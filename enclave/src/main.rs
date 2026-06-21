//! SealedBench enclave HTTP server.
//!  - GET  /health_check     liveness + attestation mode
//!  - GET  /get_attestation  enclave pubkey (+ Nitro doc on Linux)
//!  - POST /evaluate         decrypt-in-memory -> score -> signed ScorePayload
//!
//! /evaluate takes either `sealed_items` (production path: the enclave fetches
//! Seal keys gated by seal_policy::seal_approve and decrypts in memory — needs
//! a registered enclave on-chain) or plaintext `items_jsonl` (local fallback
//! for the scoring + attestation-signing pipeline; not a key-release proof).
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

use sealedbench_enclave::attestation::nitro_attestation_document;
use sealedbench_enclave::http_model::{AnthropicMessagesClient, OpenAiCompatClient};
use sealedbench_enclave::seal_client::{fetch_and_decrypt, SealedItemsRequest};
use sealedbench_enclave::{
    build_signed_score, evaluate, parse_items, EnclaveKey, ModelClient, SignedScore,
};

#[derive(Clone)]
struct AppState {
    key: Arc<EnclaveKey>,
}

fn attestation_mode() -> &'static str {
    if cfg!(target_os = "linux") {
        "nitro"
    } else {
        "local-unattested"
    }
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    mode: &'static str,
}

async fn health_check() -> Json<Health> {
    Json(Health {
        status: "ok",
        mode: attestation_mode(),
    })
}

#[derive(Serialize)]
struct Attestation {
    public_key: String,
    mode: &'static str,
    /// Base64 COSE attestation document (the encoding `scripts/register-
    /// nautilus-enclave.ts` reads and `0x2::nitro_attestation` verifies on-chain).
    /// `null` outside a Linux Nitro enclave.
    attestation: Option<String>,
}

async fn get_attestation(State(state): State<AppState>) -> Json<Attestation> {
    let pk = state.key.public_key_bytes();
    let doc = nitro_attestation_document(&pk).ok().map(|bytes| B64.encode(bytes));
    Json(Attestation {
        public_key: hex::encode(pk),
        mode: attestation_mode(),
        attestation: doc,
    })
}

#[derive(Deserialize)]
struct EvaluateRequest {
    /// Sui object id of the SealedEval being scored (0x + 64 hex).
    sealed_eval_id: String,
    model_target: String,
    endpoint: String,
    model: String,
    #[serde(default)]
    model_provider: Option<String>,
    #[serde(default)]
    api_key: String,
    system: String,
    /// Plaintext held-out set (JSONL). Local fallback; mutually exclusive with
    /// `sealed_items`.
    #[serde(default)]
    items_jsonl: String,
    /// Production path: Seal ciphertext + key-server/enclave metadata for
    /// in-enclave key fetch + decrypt.
    #[serde(default)]
    sealed_items: Option<SealedItemsRequest>,
    /// Walrus publisher to archive the run trace. Empty -> inline mode (no PUT),
    /// used by offline unit tests.
    #[serde(default)]
    walrus_publisher_url: String,
    #[serde(default = "default_epochs")]
    walrus_epochs: u32,
    timestamp_ms: u64,
}

fn default_epochs() -> u32 {
    1
}

#[derive(Debug, PartialEq, Eq)]
enum ModelProvider {
    OpenAiCompat,
    Anthropic,
}

fn normalize_model_provider(value: Option<&str>) -> Result<ModelProvider, String> {
    match value.unwrap_or("openai").to_ascii_lowercase().as_str() {
        "openai" | "openai-compatible" | "openai_compatible" => Ok(ModelProvider::OpenAiCompat),
        "anthropic" | "claude" => Ok(ModelProvider::Anthropic),
        provider => Err(format!("unsupported model_provider {provider}")),
    }
}

fn non_empty_env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|value| !value.is_empty())
}

/// The model target baked into the measured image (and therefore the PCRs).
/// When `endpoint` is set, an attested score is provably produced against THIS
/// endpoint/model — the request may only supply the api_key, never redirect the
/// enclave at a different model. Empty (local dev / unattested) -> the request's
/// own endpoint/model/provider are used.
struct BakedModel {
    endpoint: Option<String>,
    model: Option<String>,
    provider: Option<String>,
}

fn baked_model() -> BakedModel {
    BakedModel {
        endpoint: non_empty_env("SEALEDBENCH_MODEL_ENDPOINT"),
        model: non_empty_env("SEALEDBENCH_MODEL_ID"),
        provider: non_empty_env("SEALEDBENCH_MODEL_PROVIDER"),
    }
}

/// Resolve the endpoint/model/provider the enclave will actually dial: a baked
/// (measured) value wins over the request, so the attestation binds the model
/// target rather than trusting the caller.
fn resolve_model_target(
    baked: BakedModel,
    req_endpoint: &str,
    req_model: &str,
    req_provider: Option<&str>,
) -> (String, String, Option<String>) {
    (
        baked.endpoint.unwrap_or_else(|| req_endpoint.to_string()),
        baked.model.unwrap_or_else(|| req_model.to_string()),
        baked
            .provider
            .or_else(|| req_provider.map(str::to_string)),
    )
}

fn parse_id_hex(value: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(value.trim_start_matches("0x")).map_err(|e| e.to_string())?;
    bytes
        .try_into()
        .map_err(|_| "sealed_eval_id must be 32 bytes".to_string())
}

/// Resolve the held-out set: in-enclave Seal decrypt (production) or the
/// plaintext seam (local pipeline). Exactly one source must be present.
fn resolve_items_text(req: &EvaluateRequest, key: &EnclaveKey) -> Result<String, String> {
    match (&req.sealed_items, req.items_jsonl.is_empty()) {
        (Some(sealed), true) => {
            let plaintext = fetch_and_decrypt(sealed, key, req.timestamp_ms)?;
            String::from_utf8(plaintext)
                .map_err(|_| "decrypted held-out set is not valid UTF-8".to_string())
        }
        (None, false) => Ok(req.items_jsonl.clone()),
        (Some(_), false) => {
            Err("provide either sealed_items or items_jsonl, not both".to_string())
        }
        (None, true) => Err("missing held-out set: provide sealed_items or items_jsonl".to_string()),
    }
}

fn run_evaluate(
    req: &EvaluateRequest,
    model: &dyn ModelClient,
    key: &EnclaveKey,
) -> Result<SignedScore, String> {
    let sealed_eval_id = parse_id_hex(&req.sealed_eval_id)?;
    let items_text = resolve_items_text(req, key)?;
    let items = parse_items(&items_text)?;
    let evaluation = evaluate(&req.model_target, &req.system, &items, model)?;

    // Archive the trace to Walrus and commit its blobId in the signature, so the
    // trace is bound by the attestation rather than appended afterward.
    let trace_blob_id = if req.walrus_publisher_url.is_empty() {
        format!("inline:{}", hex::encode(evaluation.items_hash))
    } else {
        sealedbench_enclave::walrus::put_blob(
            &req.walrus_publisher_url,
            &evaluation.trace_bytes,
            req.walrus_epochs,
        )?
    };

    Ok(build_signed_score(
        &evaluation,
        sealed_eval_id,
        &req.model_target,
        &trace_blob_id,
        req.timestamp_ms,
        key,
    ))
}

async fn evaluate_handler(
    State(state): State<AppState>,
    Json(req): Json<EvaluateRequest>,
) -> Result<Json<SignedScore>, (StatusCode, String)> {
    let key = state.key.clone();
    // reqwest::blocking refuses to run inside a Tokio runtime, so the blocking
    // model calls run on a dedicated OS thread and the result returns over a
    // oneshot channel.
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        // A baked (measured) endpoint/model wins over the request; only the
        // api_key is ever taken from the caller.
        let (endpoint, model_id, provider_str) = resolve_model_target(
            baked_model(),
            &req.endpoint,
            &req.model,
            req.model_provider.as_deref(),
        );
        let result = normalize_model_provider(provider_str.as_deref()).and_then(|provider| {
            let model: Box<dyn ModelClient> = match provider {
                ModelProvider::OpenAiCompat => Box::new(OpenAiCompatClient::new(
                    endpoint.clone(),
                    req.api_key.clone(),
                    model_id.clone(),
                )),
                ModelProvider::Anthropic => Box::new(AnthropicMessagesClient::new(
                    endpoint.clone(),
                    req.api_key.clone(),
                    model_id.clone(),
                )),
            };
            run_evaluate(&req, model.as_ref(), &key)
        });
        let _ = tx.send(result);
    });
    let result = rx
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e))?;
    Ok(Json(result))
}

fn app(state: AppState) -> Router {
    Router::new()
        .route("/health_check", get(health_check))
        .route("/get_attestation", get(get_attestation))
        .route("/evaluate", post(evaluate_handler))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let key = Arc::new(EnclaveKey::generate());
    tracing::info!(pubkey = %key.public_key_hex(), mode = attestation_mode(), "enclave key ready");
    let baked = baked_model();
    tracing::info!(
        model_endpoint = baked.endpoint.as_deref().unwrap_or("<request-supplied>"),
        model_id = baked.model.as_deref().unwrap_or("<request-supplied>"),
        model_provider = baked.provider.as_deref().unwrap_or("<request-supplied>"),
        "model target"
    );
    let state = AppState { key };
    let addr = std::env::var("ENCLAVE_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    tracing::info!(%addr, "listening");
    axum::serve(listener, app(state)).await.expect("serve");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use std::collections::HashMap;
    use tower::ServiceExt;

    struct FakeModel(HashMap<String, String>);
    impl ModelClient for FakeModel {
        fn complete(&self, _system: &str, user: &str) -> Result<String, String> {
            Ok(self.0.get(user).cloned().unwrap_or_default())
        }
    }

    fn state() -> AppState {
        AppState {
            key: Arc::new(EnclaveKey::from_seed([5u8; 32])),
        }
    }

    #[tokio::test]
    async fn health_check_reports_mode() {
        let res = app(state())
            .oneshot(
                Request::builder()
                    .uri("/health_check")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["mode"], "local-unattested");
    }

    #[test]
    fn evaluate_requires_exactly_one_items_source() {
        let key = EnclaveKey::from_seed([5u8; 32]);
        let mut req = EvaluateRequest {
            sealed_eval_id: format!("0x{}", "cd".repeat(32)),
            model_target: "m".to_string(),
            endpoint: "http://unused".to_string(),
            model: "m".to_string(),
            model_provider: None,
            api_key: String::new(),
            system: "s".to_string(),
            items_jsonl: String::new(),
            sealed_items: None,
            walrus_publisher_url: String::new(),
            walrus_epochs: 1,
            timestamp_ms: 0,
        };
        assert!(resolve_items_text(&req, &key)
            .unwrap_err()
            .contains("missing held-out set"));
        req.items_jsonl = "x".to_string();
        req.sealed_items = serde_json::from_str(
            r#"{"encrypted_object_b64":"AA==","key_servers":[],"enclave_object":{"object_id":"0x1","initial_shared_version":1}}"#,
        )
        .unwrap();
        assert!(resolve_items_text(&req, &key)
            .unwrap_err()
            .contains("not both"));
    }

    #[test]
    fn model_provider_defaults_to_openai_compat() {
        assert_eq!(normalize_model_provider(None).unwrap(), ModelProvider::OpenAiCompat);
        assert_eq!(
            normalize_model_provider(Some("anthropic")).unwrap(),
            ModelProvider::Anthropic,
        );
    }

    #[test]
    fn baked_model_target_overrides_request() {
        // The measured image pins the endpoint; a caller cannot redirect the
        // attested enclave at a different model — only the api_key is theirs.
        let baked = BakedModel {
            endpoint: Some("https://api.anthropic.com".to_string()),
            model: Some("claude-opus-4-8".to_string()),
            provider: Some("anthropic".to_string()),
        };
        let (endpoint, model, provider) =
            resolve_model_target(baked, "http://evil.example", "evil-model", Some("openai"));
        assert_eq!(endpoint, "https://api.anthropic.com");
        assert_eq!(model, "claude-opus-4-8");
        assert_eq!(provider.as_deref(), Some("anthropic"));
    }

    #[test]
    fn unbaked_model_target_uses_request() {
        let baked = BakedModel {
            endpoint: None,
            model: None,
            provider: None,
        };
        let (endpoint, model, provider) =
            resolve_model_target(baked, "http://127.0.0.1:3930", "demo", Some("openai"));
        assert_eq!(endpoint, "http://127.0.0.1:3930");
        assert_eq!(model, "demo");
        assert_eq!(provider.as_deref(), Some("openai"));
    }

    #[tokio::test]
    async fn get_attestation_exposes_pubkey() {
        let res = app(state())
            .oneshot(
                Request::builder()
                    .uri("/get_attestation")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        // off-Linux: pubkey present, no Nitro document
        assert_eq!(json["public_key"].as_str().unwrap().len(), 64);
        assert_eq!(json["mode"], "local-unattested");
        assert!(json["attestation"].is_null());
    }

    #[test]
    fn run_evaluate_scores_and_signs() {
        let req = EvaluateRequest {
            sealed_eval_id: format!("0x{}", "cd".repeat(32)),
            model_target: "clean".to_string(),
            endpoint: "http://unused".to_string(),
            model: "m".to_string(),
            model_provider: None,
            api_key: String::new(),
            system: "be terse".to_string(),
            items_jsonl: concat!(
                "{\"id\":\"a\",\"question\":\"2+2?\",\"answer\":\"4\",\"rubric\":\"r\"}\n",
                "{\"id\":\"b\",\"question\":\"sky?\",\"answer\":\"blue\",\"rubric\":\"r\"}\n"
            )
            .to_string(),
            sealed_items: None,
            walrus_publisher_url: String::new(),
            walrus_epochs: 1,
            timestamp_ms: 1_700_000_000_000,
        };
        let mut answers = HashMap::new();
        answers.insert("2+2?".to_string(), "4".to_string());
        let key = EnclaveKey::from_seed([5u8; 32]);

        let signed = run_evaluate(&req, &FakeModel(answers), &key).unwrap();
        assert_eq!(signed.score_num, 1);
        assert_eq!(signed.score_den, 2);
        assert_eq!(signed.enclave_pk, key.public_key_hex());
        assert_eq!(signed.signature.len(), 128);
        // inline mode commits the items_hash as the trace marker
        assert!(signed.trace_blob_id.starts_with("inline:"));
    }
}
