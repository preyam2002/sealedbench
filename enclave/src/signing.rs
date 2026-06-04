//! The enclave's ed25519 identity key. It signs the BCS-encoded IntentMessage
//! directly (raw ed25519, no digest) so `sui::ed25519::ed25519_verify` in the
//! Move `enclave::verify_signature` accepts it.
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use serde::Serialize;

use crate::payload::{intent_message_bytes, ScorePayload, SealApproval, SCORE_INTENT, SEAL_INTENT};

#[derive(Clone)]
pub struct EnclaveKey {
    key: SigningKey,
}

impl EnclaveKey {
    pub fn generate() -> Self {
        Self {
            key: SigningKey::generate(&mut OsRng),
        }
    }

    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self {
            key: SigningKey::from_bytes(&seed),
        }
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.key.verifying_key().to_bytes()
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.public_key_bytes())
    }

    pub fn sign_intent<P: Serialize>(&self, intent: u8, timestamp_ms: u64, payload: P) -> [u8; 64] {
        let message = intent_message_bytes(intent, timestamp_ms, payload);
        self.key.sign(&message).to_bytes()
    }

    pub fn sign_score(&self, timestamp_ms: u64, payload: ScorePayload) -> [u8; 64] {
        self.sign_intent(SCORE_INTENT, timestamp_ms, payload)
    }

    pub fn sign_seal_approval(&self, timestamp_ms: u64, payload: SealApproval) -> [u8; 64] {
        self.sign_intent(SEAL_INTENT, timestamp_ms, payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The fixed seed used by tools/gen-attestation-vectors.ts: bytes 1..=32.
    fn seeded_key() -> EnclaveKey {
        let mut seed = [0u8; 32];
        for (i, b) in seed.iter_mut().enumerate() {
            *b = (i as u8) + 1;
        }
        EnclaveKey::from_seed(seed)
    }

    const TIMESTAMP: u64 = 1744038900000;

    #[test]
    fn public_key_matches_move_vector() {
        assert_eq!(
            seeded_key().public_key_hex(),
            "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664"
        );
    }

    #[test]
    fn score_signature_matches_move_vector() {
        let payload = ScorePayload {
            sealed_eval_id: [0xab; 32],
            model_target: "demo/clean-open-model-2024-10".to_string(),
            score_num: 37,
            score_den: 50,
            items_hash: vec![0x07; 32],
            trace_blob_id: "trace-blob-xyz".to_string(),
        };
        let sig = seeded_key().sign_score(TIMESTAMP, payload);
        // This is the exact signature the Move attested_score test verifies.
        assert_eq!(
            hex::encode(sig),
            "3db884b66788ac14e6fbb56401d7a4ddd14f3ab7796d2fc1c68a4c2bce46b9e96d6aca516c615da53200f3760170d7cb70c7f9dd883b0b9125671c800384c705"
        );
    }

    #[test]
    fn seal_signature_matches_move_vector() {
        let sig = seeded_key().sign_seal_approval(TIMESTAMP, SealApproval { id: vec![0x22; 16] });
        // Exact signature the Move seal_policy test verifies.
        assert_eq!(
            hex::encode(sig),
            "9513b9fe9d920e6ec473b9245d2776d7af972c305e29d319056d69c2faa1456829d2b0df3cb4ba83311e289703bb57a08d0cc378e85a78f5b9d6e4f71a269409"
        );
    }
}
