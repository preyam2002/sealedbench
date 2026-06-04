//! Deterministic, no-human-in-the-loop grading. Determinism is essential: the
//! same decrypted item + same model response must always yield the same verdict,
//! so the attested score is reproducible from the trace.

/// Lowercase, trim, and collapse internal whitespace.
pub fn normalize(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// A response is correct if the normalized expected answer appears in the
/// normalized response (exact match included). Empty expected answers never pass.
pub fn is_correct(expected_answer: &str, response: &str) -> bool {
    let expected = normalize(expected_answer);
    if expected.is_empty() {
        return false;
    }
    let actual = normalize(response);
    actual == expected || actual.contains(&expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_and_substring_match() {
        assert!(is_correct("Yes", "yes"));
        assert!(is_correct("4", "The answer is 4."));
        assert!(is_correct("San Francisco", "  san   francisco "));
    }

    #[test]
    fn wrong_answers_fail() {
        assert!(!is_correct("Yes", "no"));
        assert!(!is_correct("42", "the answer is 7"));
        assert!(!is_correct("", "anything"));
    }

    #[test]
    fn deterministic() {
        let a = is_correct("Paris", "The capital is Paris.");
        let b = is_correct("Paris", "The capital is Paris.");
        assert_eq!(a, b);
    }
}
