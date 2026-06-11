/// On-chain home for enclave-attested benchmark scores. A score is only created
/// if the enclave's ed25519 signature over the score intent verifies against the
/// registered `Enclave`'s public key — i.e. the score provably came from the
/// exact attested code, on the exact decrypted set, with no human tampering.
module sealedbench::attested_score {
    use std::string::String;
    use sui::{clock::{Self, Clock}, event};
    use enclave::enclave::{Self, Enclave};
    use sealedbench::attestation::SEALEDBENCH;
    use sealedbench::sealed_eval::{Self, SealedEval};

    const EInvalidEnclaveSignature: u64 = 1;
    const EBadItemsHashLength: u64 = 2;
    const EZeroDenominator: u64 = 3;

    const SHA256_LENGTH: u64 = 32;
    /// Intent scope byte for a score attestation (distinct from Seal access = 2).
    const SCORE_INTENT: u8 = 1;

    /// The exact message the enclave signs. Field order MUST match the Rust
    /// enclave's BCS serialization and the Move IntentMessage wrapping.
    public struct ScorePayload has copy, drop {
        sealed_eval_id: ID,
        model_target: String,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
    }

    public struct AttestedScore has key, store {
        id: UID,
        sealed_eval_id: ID,
        model_target: String,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
        enclave_pk: vector<u8>,
        posted_at_ms: u64,
    }

    public struct AttestedScorePosted has copy, drop {
        score_id: ID,
        sealed_eval_id: ID,
        model_target: String,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
        enclave_pk: vector<u8>,
        posted_at_ms: u64,
    }

    #[allow(lint(share_owned))]
    public fun post_score(
        enclave: &Enclave<SEALEDBENCH>,
        sealed_eval: &SealedEval,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let score = new(
            enclave,
            sealed_eval,
            score_num,
            score_den,
            items_hash,
            trace_blob_id,
            timestamp_ms,
            signature,
            clock,
            ctx,
        );

        event::emit(AttestedScorePosted {
            score_id: object::id(&score),
            sealed_eval_id: score.sealed_eval_id,
            model_target: score.model_target,
            score_num: score.score_num,
            score_den: score.score_den,
            items_hash: score.items_hash,
            trace_blob_id: score.trace_blob_id,
            enclave_pk: score.enclave_pk,
            posted_at_ms: score.posted_at_ms,
        });

        transfer::share_object(score);
    }

    public fun new(
        enclave: &Enclave<SEALEDBENCH>,
        sealed_eval: &SealedEval,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): AttestedScore {
        assert!(score_den > 0, EZeroDenominator);
        assert!(vector::length(&items_hash) == SHA256_LENGTH, EBadItemsHashLength);

        let sealed_eval_id = sealed_eval::id(sealed_eval);
        let model_target = *sealed_eval::model_target(sealed_eval);

        // The enclave signs IntentMessage{SCORE_INTENT, timestamp_ms, payload}
        // binding the score to this exact SealedEval, model, and item set.
        assert!(
            verify_score_signature(
                enclave,
                sealed_eval_id,
                model_target,
                score_num,
                score_den,
                items_hash,
                trace_blob_id,
                timestamp_ms,
                &signature,
            ),
            EInvalidEnclaveSignature,
        );

        AttestedScore {
            id: object::new(ctx),
            sealed_eval_id,
            model_target,
            score_num,
            score_den,
            items_hash,
            trace_blob_id,
            enclave_pk: *enclave::pk(enclave),
            posted_at_ms: clock::timestamp_ms(clock),
        }
    }

    /// Pure verification of an enclave score signature over the canonical
    /// ScorePayload. Returns true iff `signature` is a valid enclave-key
    /// signature over IntentMessage{SCORE_INTENT, timestamp_ms, payload}.
    public fun verify_score_signature(
        enclave: &Enclave<SEALEDBENCH>,
        sealed_eval_id: ID,
        model_target: String,
        score_num: u64,
        score_den: u64,
        items_hash: vector<u8>,
        trace_blob_id: String,
        timestamp_ms: u64,
        signature: &vector<u8>,
    ): bool {
        let payload = ScorePayload {
            sealed_eval_id,
            model_target,
            score_num,
            score_den,
            items_hash,
            trace_blob_id,
        };
        enclave::verify_signature(enclave, SCORE_INTENT, timestamp_ms, payload, signature)
    }

    public fun sealed_eval_id(score: &AttestedScore): ID { score.sealed_eval_id }
    public fun model_target(score: &AttestedScore): &String { &score.model_target }
    public fun score_num(score: &AttestedScore): u64 { score.score_num }
    public fun score_den(score: &AttestedScore): u64 { score.score_den }
    public fun items_hash(score: &AttestedScore): &vector<u8> { &score.items_hash }
    public fun trace_blob_id(score: &AttestedScore): &String { &score.trace_blob_id }
    public fun enclave_pk(score: &AttestedScore): &vector<u8> { &score.enclave_pk }
    public fun posted_at_ms(score: &AttestedScore): u64 { score.posted_at_ms }
}
