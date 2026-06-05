//! Minimal Walrus publisher client so the enclave can archive the run trace and
//! commit its blobId inside the signed ScorePayload (Phase 2.6). The publisher
//! HTTP API needs only network egress (no key), so this is exercised against the
//! live testnet publisher in smoke tests.
use serde::Deserialize;

#[derive(Deserialize)]
struct BlobObject {
    #[serde(rename = "blobId")]
    blob_id: String,
}

#[derive(Deserialize)]
struct NewlyCreated {
    #[serde(rename = "blobObject")]
    blob_object: BlobObject,
}

#[derive(Deserialize)]
struct AlreadyCertified {
    #[serde(rename = "blobId")]
    blob_id: String,
}

#[derive(Deserialize)]
struct PutResponse {
    #[serde(rename = "newlyCreated")]
    newly_created: Option<NewlyCreated>,
    #[serde(rename = "alreadyCertified")]
    already_certified: Option<AlreadyCertified>,
}

pub fn parse_blob_id(json: &str) -> Result<String, String> {
    let parsed: PutResponse =
        serde_json::from_str(json).map_err(|e| format!("bad walrus response: {e}"))?;
    if let Some(nc) = parsed.newly_created {
        return Ok(nc.blob_object.blob_id);
    }
    if let Some(ac) = parsed.already_certified {
        return Ok(ac.blob_id);
    }
    Err(format!("unexpected walrus response: {json}"))
}

/// PUT `data` to the Walrus publisher and return its blobId. Blocking; must run
/// off the async reactor (the server calls it from a dedicated thread).
pub fn put_blob(publisher_url: &str, data: &[u8], epochs: u32) -> Result<String, String> {
    let url = format!(
        "{}/v1/blobs?epochs={}",
        publisher_url.trim_end_matches('/'),
        epochs.max(1)
    );
    let res = reqwest::blocking::Client::new()
        .put(url)
        .body(data.to_vec())
        .send()
        .map_err(|e| format!("walrus put failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("walrus http {}", res.status()));
    }
    let text = res.text().map_err(|e| format!("read walrus body: {e}"))?;
    parse_blob_id(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_newly_created() {
        let json = r#"{"newlyCreated":{"blobObject":{"blobId":"ABC123","size":10}}}"#;
        assert_eq!(parse_blob_id(json).unwrap(), "ABC123");
    }

    #[test]
    fn parses_already_certified() {
        let json = r#"{"alreadyCertified":{"blobId":"XYZ789","endEpoch":42}}"#;
        assert_eq!(parse_blob_id(json).unwrap(), "XYZ789");
    }

    #[test]
    fn errors_on_unexpected() {
        assert!(parse_blob_id(r#"{"error":"nope"}"#).is_err());
    }
}
