//! Model runner abstraction. The real OpenAI-compatible HTTP client lives in the
//! server binary (it needs an API key + egress, both gated). The enclave logic
//! depends only on this trait, so grading/scoring is unit-testable with a fake.

pub trait ModelClient {
    /// Run one chat completion and return the model's text answer.
    fn complete(&self, system: &str, user: &str) -> Result<String, String>;
}
