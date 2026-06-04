#[allow(lint(public_entry))]
module sealedbench::sealed_eval {
    use std::{
        option::{Self, Option},
        string::String,
        vector,
    };
    use sui::{
        clock::{Self, Clock},
        event,
        object::{Self, ID, UID},
        transfer,
        tx_context::{Self, TxContext},
    };

    const EBadPlaintextHashLength: u64 = 1;
    const EBadCiphertextHashLength: u64 = 2;
    const EZeroSetSize: u64 = 3;
    const EAlreadyRevealed: u64 = 4;

    const SHA256_LENGTH: u64 = 32;

    public struct SealedEval has key, store {
        id: UID,
        author: address,
        sha256_plaintext: vector<u8>,
        sha256_ciphertext: vector<u8>,
        walrus_blob_id: String,
        seal_policy_id: ID,
        model_target: String,
        set_size: u64,
        cutoff_ts_ms: u64,
        sealed_at_ms: u64,
        revealed: bool,
        plaintext_blob_id: Option<String>,
    }

    public struct SealedEvalCreated has copy, drop {
        eval_id: ID,
        author: address,
        sha256_plaintext: vector<u8>,
        sha256_ciphertext: vector<u8>,
        walrus_blob_id: String,
        seal_policy_id: ID,
        model_target: String,
        set_size: u64,
        cutoff_ts_ms: u64,
        sealed_at_ms: u64,
    }

    public struct SealedEvalRevealed has copy, drop {
        eval_id: ID,
        plaintext_blob_id: String,
    }

    #[allow(lint(share_owned))]
    public entry fun create(
        sha256_plaintext: vector<u8>,
        sha256_ciphertext: vector<u8>,
        walrus_blob_id: String,
        seal_policy_id: ID,
        model_target: String,
        set_size: u64,
        cutoff_ts_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let eval = new(
            sha256_plaintext,
            sha256_ciphertext,
            walrus_blob_id,
            seal_policy_id,
            model_target,
            set_size,
            cutoff_ts_ms,
            clock,
            ctx,
        );

        emit_created(&eval);
        transfer::public_share_object(eval);
    }

    fun new(
        sha256_plaintext: vector<u8>,
        sha256_ciphertext: vector<u8>,
        walrus_blob_id: String,
        seal_policy_id: ID,
        model_target: String,
        set_size: u64,
        cutoff_ts_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SealedEval {
        assert!(vector::length(&sha256_plaintext) == SHA256_LENGTH, EBadPlaintextHashLength);
        assert!(vector::length(&sha256_ciphertext) == SHA256_LENGTH, EBadCiphertextHashLength);
        assert!(set_size > 0, EZeroSetSize);

        SealedEval {
            id: object::new(ctx),
            author: tx_context::sender(ctx),
            sha256_plaintext,
            sha256_ciphertext,
            walrus_blob_id,
            seal_policy_id,
            model_target,
            set_size,
            cutoff_ts_ms,
            sealed_at_ms: clock::timestamp_ms(clock),
            revealed: false,
            plaintext_blob_id: option::none(),
        }
    }

    public entry fun reveal(eval: &mut SealedEval, plaintext_blob_id: String) {
        assert!(!eval.revealed, EAlreadyRevealed);
        eval.revealed = true;
        eval.plaintext_blob_id = option::some(plaintext_blob_id);

        event::emit(SealedEvalRevealed {
            eval_id: object::id(eval),
            plaintext_blob_id: *option::borrow(&eval.plaintext_blob_id),
        });
    }

    public fun id(eval: &SealedEval): ID {
        object::id(eval)
    }

    public fun author(eval: &SealedEval): address {
        eval.author
    }

    public fun sha256_plaintext(eval: &SealedEval): &vector<u8> {
        &eval.sha256_plaintext
    }

    public fun sha256_ciphertext(eval: &SealedEval): &vector<u8> {
        &eval.sha256_ciphertext
    }

    public fun walrus_blob_id(eval: &SealedEval): &String {
        &eval.walrus_blob_id
    }

    public fun seal_policy_id(eval: &SealedEval): ID {
        eval.seal_policy_id
    }

    public fun model_target(eval: &SealedEval): &String {
        &eval.model_target
    }

    public fun set_size(eval: &SealedEval): u64 {
        eval.set_size
    }

    public fun cutoff_ts_ms(eval: &SealedEval): u64 {
        eval.cutoff_ts_ms
    }

    public fun sealed_at_ms(eval: &SealedEval): u64 {
        eval.sealed_at_ms
    }

    public fun revealed(eval: &SealedEval): bool {
        eval.revealed
    }

    public fun plaintext_blob_id(eval: &SealedEval): &Option<String> {
        &eval.plaintext_blob_id
    }

    fun emit_created(eval: &SealedEval) {
        event::emit(SealedEvalCreated {
            eval_id: object::id(eval),
            author: eval.author,
            sha256_plaintext: eval.sha256_plaintext,
            sha256_ciphertext: eval.sha256_ciphertext,
            walrus_blob_id: eval.walrus_blob_id,
            seal_policy_id: eval.seal_policy_id,
            model_target: eval.model_target,
            set_size: eval.set_size,
            cutoff_ts_ms: eval.cutoff_ts_ms,
            sealed_at_ms: eval.sealed_at_ms,
        });
    }
}
