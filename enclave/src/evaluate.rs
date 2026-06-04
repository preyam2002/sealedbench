//! Core /evaluate logic: for each held-out item, prompt the model, grade
//! deterministically, tally, build the run trace + its hash, and produce a
//! signed ScorePayload. The decrypted items + responses live only in memory and
//! the returned trace (destined for Walrus); they are never logged.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::grade::is_correct;
use crate::model_client::ModelClient;
use crate::payload::ScorePayload;
use crate::signing::EnclaveKey;

#[derive(Debug, Clone, Deserialize)]
pub struct HeldoutItem {
    pub id: String,
    pub question: String,
    pub answer: String,
    pub rubric: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemTrace {
    pub id: String,
    pub prompt: String,
    pub response: String,
    pub correct: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunTrace {
    pub model_target: String,
    pub system: String,
    pub items: Vec<ItemTrace>,
}

pub struct Evaluation {
    pub score_num: u64,
    pub score_den: u64,
    pub trace: RunTrace,
    /// Exact bytes to store on Walrus; `items_hash` is sha256 of these.
    pub trace_bytes: Vec<u8>,
    pub items_hash: [u8; 32],
}

#[derive(Debug, Clone, Serialize)]
pub struct SignedScore {
    pub sealed_eval_id: String,
    pub model_target: String,
    pub score_num: u64,
    pub score_den: u64,
    pub items_hash: String,
    pub trace_blob_id: String,
    pub timestamp_ms: u64,
    pub enclave_pk: String,
    pub signature: String,
}

pub fn parse_items(jsonl: &str) -> Result<Vec<HeldoutItem>, String> {
    jsonl
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str::<HeldoutItem>(line).map_err(|e| e.to_string()))
        .collect()
}

pub fn evaluate(
    model_target: &str,
    system: &str,
    items: &[HeldoutItem],
    model: &dyn ModelClient,
) -> Result<Evaluation, String> {
    let mut item_traces = Vec::with_capacity(items.len());
    let mut score_num = 0u64;

    for item in items {
        let response = model.complete(system, &item.question)?;
        let correct = is_correct(&item.answer, &response);
        if correct {
            score_num += 1;
        }
        item_traces.push(ItemTrace {
            id: item.id.clone(),
            prompt: item.question.clone(),
            response,
            correct,
        });
    }

    let trace = RunTrace {
        model_target: model_target.to_string(),
        system: system.to_string(),
        items: item_traces,
    };
    let trace_bytes = serde_json::to_vec(&trace).map_err(|e| e.to_string())?;
    let items_hash: [u8; 32] = Sha256::digest(&trace_bytes).into();

    Ok(Evaluation {
        score_num,
        score_den: items.len() as u64,
        trace,
        trace_bytes,
        items_hash,
    })
}

/// Build the enclave-signed ScorePayload that `attested_score::post_score`
/// verifies on-chain. `trace_blob_id` is the Walrus id of `eval.trace_bytes`,
/// so the trace is committed to by the signature (not appended after).
pub fn build_signed_score(
    eval: &Evaluation,
    sealed_eval_id: [u8; 32],
    model_target: &str,
    trace_blob_id: &str,
    timestamp_ms: u64,
    key: &EnclaveKey,
) -> SignedScore {
    let payload = ScorePayload {
        sealed_eval_id,
        model_target: model_target.to_string(),
        score_num: eval.score_num,
        score_den: eval.score_den,
        items_hash: eval.items_hash.to_vec(),
        trace_blob_id: trace_blob_id.to_string(),
    };
    let signature = key.sign_score(timestamp_ms, payload);

    SignedScore {
        sealed_eval_id: hex::encode(sealed_eval_id),
        model_target: model_target.to_string(),
        score_num: eval.score_num,
        score_den: eval.score_den,
        items_hash: hex::encode(eval.items_hash),
        trace_blob_id: trace_blob_id.to_string(),
        timestamp_ms,
        enclave_pk: key.public_key_hex(),
        signature: hex::encode(signature),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    const ITEMS: &str = concat!(
        "{\"id\":\"a\",\"question\":\"2+2?\",\"answer\":\"4\",\"rubric\":\"r\"}\n",
        "{\"id\":\"b\",\"question\":\"capital of France?\",\"answer\":\"Paris\",\"rubric\":\"r\"}\n",
        "{\"id\":\"c\",\"question\":\"color of the sky?\",\"answer\":\"blue\",\"rubric\":\"r\"}\n"
    );

    // A model that answers from a lookup table; unknown questions -> "i don't know".
    struct CannedModel(HashMap<String, String>);
    impl ModelClient for CannedModel {
        fn complete(&self, _system: &str, user: &str) -> Result<String, String> {
            Ok(self
                .0
                .get(user)
                .cloned()
                .unwrap_or_else(|| "i don't know".to_string()))
        }
    }

    fn clean_model() -> CannedModel {
        // Gets 2 of 3 right.
        let mut m = HashMap::new();
        m.insert("2+2?".to_string(), "4".to_string());
        m.insert("capital of France?".to_string(), "Paris".to_string());
        CannedModel(m)
    }

    fn contaminated_model() -> CannedModel {
        // "Memorized" every answer -> 3 of 3.
        let mut m = HashMap::new();
        m.insert("2+2?".to_string(), "4".to_string());
        m.insert("capital of France?".to_string(), "Paris".to_string());
        m.insert("color of the sky?".to_string(), "blue".to_string());
        CannedModel(m)
    }

    #[test]
    fn scores_and_traces_each_item() {
        let items = parse_items(ITEMS).unwrap();
        let eval = evaluate("clean", "be terse", &items, &clean_model()).unwrap();
        assert_eq!(eval.score_den, 3);
        assert_eq!(eval.score_num, 2);
        assert_eq!(eval.trace.items.len(), 3);
        assert!(eval.trace.items[2].correct == false);
    }

    #[test]
    fn contamination_scores_higher_on_the_same_set() {
        let items = parse_items(ITEMS).unwrap();
        let clean = evaluate("clean", "s", &items, &clean_model()).unwrap();
        let dirty = evaluate("dirty", "s", &items, &contaminated_model()).unwrap();
        assert!(dirty.score_num > clean.score_num);
        assert_eq!(dirty.score_num, 3);
    }

    #[test]
    fn items_hash_is_deterministic_and_commits_the_trace() {
        let items = parse_items(ITEMS).unwrap();
        let a = evaluate("m", "s", &items, &clean_model()).unwrap();
        let b = evaluate("m", "s", &items, &clean_model()).unwrap();
        assert_eq!(a.items_hash, b.items_hash);
        // hash actually commits the bytes that go to Walrus
        assert_eq!(<[u8; 32]>::from(Sha256::digest(&a.trace_bytes)), a.items_hash);
    }

    #[test]
    fn signed_score_carries_pk_and_signature() {
        let items = parse_items(ITEMS).unwrap();
        let eval = evaluate("clean", "s", &items, &clean_model()).unwrap();
        let key = EnclaveKey::from_seed([9u8; 32]);
        let signed =
            build_signed_score(&eval, [0xcd; 32], "clean", "blob123", 1_700_000_000_000, &key);
        assert_eq!(signed.score_num, 2);
        assert_eq!(signed.enclave_pk, key.public_key_hex());
        assert_eq!(signed.signature.len(), 128); // 64 bytes hex
    }
}
