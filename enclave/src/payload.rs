//! BCS-serialized payloads the enclave signs. The layout MUST match the Move
//! structs (`attested_score::ScorePayload`, `seal_policy::SealApproval`) and the
//! `enclave::IntentMessage<P>` wrapping, so signatures verify on-chain via
//! `enclave::verify_signature`.
use serde::Serialize;

/// Intent scope byte for a score attestation (matches attested_score.move).
pub const SCORE_INTENT: u8 = 1;
/// Intent scope byte for Seal access (matches seal_policy.move).
pub const SEAL_INTENT: u8 = 2;

#[derive(Serialize)]
pub struct IntentMessage<P: Serialize> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub payload: P,
}

#[derive(Serialize, Clone)]
pub struct ScorePayload {
    /// Sui object id of the SealedEval (BCS address = 32 raw bytes).
    pub sealed_eval_id: [u8; 32],
    pub model_target: String,
    pub score_num: u64,
    pub score_den: u64,
    pub items_hash: Vec<u8>,
    pub trace_blob_id: String,
}

#[derive(Serialize, Clone)]
pub struct SealApproval {
    pub id: Vec<u8>,
}

/// BCS bytes of `IntentMessage { intent, timestamp_ms, payload }`.
pub fn intent_message_bytes<P: Serialize>(intent: u8, timestamp_ms: u64, payload: P) -> Vec<u8> {
    bcs::to_bytes(&IntentMessage {
        intent,
        timestamp_ms,
        payload,
    })
    .expect("IntentMessage is BCS-serializable")
}
