//! SealedBench Nautilus enclave library. The attested honest-scoring core:
//! decrypt a Seal-sealed held-out set in-memory, run a model, grade
//! deterministically, and sign a ScorePayload that `attested_score::post_score`
//! verifies on-chain. Off-Linux it builds in local-unattested mode (no NSM).
//!
//! The Seal key-server fetch + the OpenAI-compatible HTTP client live in the
//! server binary (both need egress / API keys); this library is the pure,
//! unit-testable evaluation + attestation-signing core.

pub mod attestation;
pub mod evaluate;
pub mod grade;
pub mod http_model;
pub mod model_client;
pub mod payload;
pub mod signing;

pub use evaluate::{
    build_signed_score, evaluate, parse_items, Evaluation, HeldoutItem, ItemTrace, RunTrace,
    SignedScore,
};
pub use model_client::ModelClient;
pub use payload::{ScorePayload, SealApproval, SCORE_INTENT, SEAL_INTENT};
pub use signing::EnclaveKey;
