//! SealedBench enclave HTTP server.
//!  - GET  /health_check     liveness + attestation mode
//!  - GET  /get_attestation  enclave pubkey (+ Nitro doc on Linux)
//!  - POST /evaluate         decrypt-in-memory(*) -> score -> signed ScorePayload
//!
//! (*) The Seal key-server fetch + in-enclave decrypt is gated (needs live key
//! servers + a registered enclave); until then /evaluate accepts the decrypted
//! held-out set directly so the scoring + attestation-signing path is runnable.
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use sealedbench_enclave::attestation::nitro_attestation_document;
use sealedbench_enclave::http_model::OpenAiCompatClient;
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
    attestation_document: Option<String>,
}

async fn get_attestation(State(state): State<AppState>) -> Json<Attestation> {
    let pk = state.key.public_key_bytes();
    let doc = nitro_attestation_document(&pk).ok().map(hex::encode);
    Json(Attestation {
        public_key: hex::encode(pk),
        mode: attestation_mode(),
        attestation_document: doc,
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
    api_key: String,
    system: String,
    /// Decrypted held-out set (JSONL). Replaced by in-enclave Seal decrypt later.
    items_jsonl: String,
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

fn parse_id_hex(value: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(value.trim_start_matches("0x")).map_err(|e| e.to_string())?;
    bytes
        .try_into()
        .map_err(|_| "sealed_eval_id must be 32 bytes".to_string())
}

fn run_evaluate(
    req: &EvaluateRequest,
    model: &dyn ModelClient,
    key: &EnclaveKey,
) -> Result<SignedScore, String> {
    let sealed_eval_id = parse_id_hex(&req.sealed_eval_id)?;
    let items = parse_items(&req.items_jsonl)?;
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
        let model =
            OpenAiCompatClient::new(req.endpoint.clone(), req.api_key.clone(), req.model.clone());
        let _ = tx.send(run_evaluate(&req, &model, &key));
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
        assert!(json["attestation_document"].is_null());
    }

    #[test]
    fn run_evaluate_scores_and_signs() {
        let req = EvaluateRequest {
            sealed_eval_id: format!("0x{}", "cd".repeat(32)),
            model_target: "clean".to_string(),
            endpoint: "http://unused".to_string(),
            model: "m".to_string(),
            api_key: String::new(),
            system: "be terse".to_string(),
            items_jsonl: concat!(
                "{\"id\":\"a\",\"question\":\"2+2?\",\"answer\":\"4\",\"rubric\":\"r\"}\n",
                "{\"id\":\"b\",\"question\":\"sky?\",\"answer\":\"blue\",\"rubric\":\"r\"}\n"
            )
            .to_string(),
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
