//! Real OpenAI-compatible chat-completions client (OpenAI / DeepSeek / Anthropic
//! OpenAI-compat / local servers). Temperature is pinned to 0 for deterministic,
//! reproducible scoring. Live calls need an API key (gated); the request shaping
//! and response parsing are pure and unit-tested here.
//!
//! Note: for Anthropic-native prompt caching (a standing project preference) the
//! Messages API with `cache_control` on the static system + instruction blocks
//! is required; that native path is a follow-up for the real run. This client
//! targets the OpenAI-compatible surface the build plan specifies.
use serde::{Deserialize, Serialize};

use crate::model_client::ModelClient;

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    temperature: f32,
    messages: Vec<ChatMessage<'a>>,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

pub fn build_request_body(model: &str, system: &str, user: &str) -> serde_json::Value {
    serde_json::to_value(ChatRequest {
        model,
        temperature: 0.0,
        messages: vec![
            ChatMessage {
                role: "system",
                content: system,
            },
            ChatMessage {
                role: "user",
                content: user,
            },
        ],
    })
    .expect("request is serializable")
}

pub fn parse_completion(body: &str) -> Result<String, String> {
    let parsed: ChatResponse =
        serde_json::from_str(body).map_err(|e| format!("bad completion json: {e}"))?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "no choices in completion".to_string())
}

pub struct OpenAiCompatClient {
    base_url: String,
    api_key: String,
    model: String,
    client: reqwest::blocking::Client,
}

impl OpenAiCompatClient {
    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            model,
            client: reqwest::blocking::Client::new(),
        }
    }
}

impl ModelClient for OpenAiCompatClient {
    fn complete(&self, system: &str, user: &str) -> Result<String, String> {
        let body = build_request_body(&self.model, system, user);
        let res = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .map_err(|e| format!("model request failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("model http {}", res.status()));
        }
        let text = res.text().map_err(|e| format!("read body: {e}"))?;
        parse_completion(&text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_body_pins_temperature_zero() {
        let body = build_request_body("gpt-x", "be terse", "2+2?");
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["model"], "gpt-x");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "2+2?");
    }

    #[test]
    fn parses_openai_style_completion() {
        let json = r#"{"choices":[{"message":{"role":"assistant","content":"4"}}]}"#;
        assert_eq!(parse_completion(json).unwrap(), "4");
    }

    #[test]
    fn errors_on_empty_choices() {
        assert!(parse_completion(r#"{"choices":[]}"#).is_err());
    }
}
