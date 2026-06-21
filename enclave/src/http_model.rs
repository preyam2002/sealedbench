//! Real HTTP model clients. Temperature is pinned to 0 for deterministic,
//! reproducible scoring. Live calls need an API key (gated); request shaping
//! and response parsing are pure and unit-tested here.
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
    max_tokens: u32,
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

#[derive(Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct AnthropicTextBlock<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}

#[derive(Serialize)]
struct AnthropicMessage<'a> {
    role: &'a str,
    content: Vec<AnthropicTextBlock<'a>>,
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    temperature: f32,
    system: Vec<AnthropicTextBlock<'a>>,
    messages: Vec<AnthropicMessage<'a>>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

pub fn build_request_body(model: &str, system: &str, user: &str) -> serde_json::Value {
    serde_json::to_value(ChatRequest {
        model,
        temperature: 0.0,
        max_tokens: 32,
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

pub fn build_anthropic_request_body(
    model: &str,
    system: &str,
    user: &str,
    max_tokens: u32,
) -> serde_json::Value {
    serde_json::to_value(AnthropicRequest {
        model,
        max_tokens,
        temperature: 0.0,
        system: vec![AnthropicTextBlock {
            kind: "text",
            text: system,
            cache_control: Some(CacheControl { kind: "ephemeral" }),
        }],
        messages: vec![AnthropicMessage {
            role: "user",
            content: vec![AnthropicTextBlock {
                kind: "text",
                text: user,
                cache_control: None,
            }],
        }],
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

pub fn parse_anthropic_completion(body: &str) -> Result<String, String> {
    let parsed: AnthropicResponse =
        serde_json::from_str(body).map_err(|e| format!("bad completion json: {e}"))?;
    let text = parsed
        .content
        .into_iter()
        .filter_map(|block| (block.kind == "text").then_some(block.text).flatten())
        .collect::<Vec<_>>()
        .join("");
    if text.is_empty() {
        return Err("no text content in completion".to_string());
    }
    Ok(text)
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

pub struct AnthropicMessagesClient {
    base_url: String,
    api_key: String,
    model: String,
    max_tokens: u32,
    client: reqwest::blocking::Client,
}

impl AnthropicMessagesClient {
    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            model,
            max_tokens: 1024,
            client: reqwest::blocking::Client::new(),
        }
    }
}

impl ModelClient for AnthropicMessagesClient {
    fn complete(&self, system: &str, user: &str) -> Result<String, String> {
        let body = build_anthropic_request_body(&self.model, system, user, self.max_tokens);
        let res = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .map_err(|e| format!("model request failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("model http {}", res.status()));
        }
        let text = res.text().map_err(|e| format!("read body: {e}"))?;
        parse_anthropic_completion(&text)
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
        assert_eq!(body["max_tokens"], 32);
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

    #[test]
    fn anthropic_request_uses_messages_api_with_cached_system_block() {
        let body = build_anthropic_request_body("claude-sonnet-4-5", "be terse", "2+2?", 64);
        assert_eq!(body["model"], "claude-sonnet-4-5");
        assert_eq!(body["max_tokens"], 64);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["system"][0]["type"], "text");
        assert_eq!(body["system"][0]["text"], "be terse");
        assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"][0]["text"], "2+2?");
    }

    #[test]
    fn parses_anthropic_text_blocks() {
        let json = r#"{"content":[{"type":"text","text":"4"},{"type":"text","text":"\nDone"}]}"#;
        assert_eq!(parse_anthropic_completion(json).unwrap(), "4\nDone");
    }
}
