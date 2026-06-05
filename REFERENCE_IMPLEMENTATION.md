# SealedBench — Reference Implementation

Companion to `BUILD_PLAN.md`. **Paste-ready, compile-targeted code for the HARD, novel parts only** — the Seal / Nautilus / Move load-bearing modules and the cross-language signing contract that ties them together. This is NOT a full app scaffold; it covers the five things an autonomous agent would otherwise flail on. Everything else (Next.js UI, monorepo glue, fixtures) follows `BUILD_PLAN.md` §4 directly.

File layout matches `BUILD_PLAN.md` §4. Where the existing Codex scaffold already implements a module correctly (`move/sealedbench/sources/*`), this doc is the **specification of record** — it explains *why* each byte is where it is, and the few things to fix.

---

## ⚠️ THE ONE CONTRACT THAT MUST NOT DRIFT (read this first)

Every signature in this project is the **same shape**: the enclave signs the **raw BCS bytes of an `IntentMessage`**, and Move re-derives those exact bytes and calls `ed25519::ed25519_verify`. Get this wrong and *nothing* verifies. Grounded against `~/repo/aegis-wallet/move/enclave/sources/enclave.move` (verbatim, reused):

```move
// enclave::enclave — REUSED VERBATIM from Aegis. Do not edit.
public struct IntentMessage<T: drop> has copy, drop { intent: u8, timestamp_ms: u64, payload: T }

public fun verify_signature<T, P: drop>(
    enclave: &Enclave<T>, intent_scope: u8, timestamp_ms: u64, payload: P, signature: &vector<u8>,
): bool {
    let intent_message = create_intent_message(intent_scope, timestamp_ms, payload);
    let payload = bcs::to_bytes(&intent_message);          // <-- THE BYTES
    return ed25519::ed25519_verify(signature, &enclave.pk, &payload)
}
```

So on the Rust side the enclave MUST:
1. Build a struct that BCS-serializes **identically** to `IntentMessage { intent: u8, timestamp_ms: u64, payload }`.
2. Sign those raw bytes with ed25519 **directly** — `signing_key.sign(&bcs_bytes)`.

> **CRITICAL — do NOT reuse `AegisSigningKey::sign_transaction_bytes` for score/seal payloads.** That helper (in `sui_signature.rs`) does `ed25519(Blake2b(0x000000 || tx_bytes))` — correct for signing **Sui transactions**, wrong here. `verify_signature` verifies over the **plain BCS bytes of the IntentMessage**, not a Blake2b digest and not with the tx-intent prefix. We add a sibling method `sign_intent_bytes` (below) and keep the original for any tx co-signing.

**BCS field-order law:** BCS serializes struct fields **in declaration order**, with no tags. Therefore the Rust `#[derive(Serialize)]` struct field order MUST equal the Move struct field order, field for field, type for type (`u8`→`u8`, Move `u64`→Rust `u64`, Move `String`→Rust `String`, Move `vector<u8>`→Rust `Vec<u8>`, Move `ID`→Rust `[u8; 32]`). `bcs` (the Rust crate, same wire format Mysten uses) handles `String` as ULEB128-len-prefixed UTF-8 and `Vec<u8>` as ULEB128-len-prefixed bytes — identical to Move.

**Intent scopes (fixed, distinct, must match across all three languages):**
| scope | const name | used by | payload struct |
|---|---|---|---|
| `1` | `SCORE_INTENT` | `attested_score::post_score` | `ScorePayload` |
| `2` | `SEAL_INTENT`  | `seal_policy::seal_approve`  | `SealApproval` |

**`ID` encoding:** a Sui `ID`/`address` is BCS-serialized as a fixed `[u8; 32]` (no length prefix). On the Rust side, take the `SealedEval` object id, hex-decode the 0x string to 32 bytes, and serialize as a `[u8; 32]` newtype (see `IdBytes` below). Verify-by-construction in the round-trip test in §1.

---

## 0. Grounding ledger — what's real vs. VERIFY-FIRST

| Area | Status | Source |
|---|---|---|
| `enclave::{EnclaveConfig, Enclave, register_enclave, verify_signature, pk, new_enclave_for_testing}` signatures | ✅ real | `~/repo/aegis-wallet/move/enclave/sources/enclave.move` (vendored verbatim) |
| `IntentMessage` BCS layout + the `x"0020..."` golden vector | ✅ real | same file, `#[test] fun test_serde` |
| Rust `serialize_ed25519_sui_signature`, `AegisSigningKey`, NSM `attestation.rs`, Axum route shape | ✅ real | `~/repo/aegis-wallet/enclave/src/{sui_signature,attestation,cosign,main}.rs` |
| `register_enclave` PTB (`load_nitro_attestation` → `register_enclave<T>`) | ✅ real | `~/repo/aegis-wallet/scripts/register-nautilus-enclave.ts` |
| Seal SDK: `SealClient{encrypt,decrypt,fetchKeys}`, `SessionKey.create/createRequestParams`, `EncryptOptions/DecryptOptions`, `KemType/DemType` | ✅ real | installed `@mysten/seal@1.1.3` `dist/*.d.mts` |
| Seal `seal_approve` rules (`entry` not `public entry`, `id: vector<u8>` first, side-effect-free, dry-run evaluated) | ✅ real | Seal `docs/content/UsingSeal.mdx`; pattern `move/patterns/.../tle.move` |
| Seal **testnet** key-server object IDs | ✅ real | `UsingSeal.mdx` (mysten-testnet open servers) |
| Seal→Nautilus key-release (enclave ElGamal keypair; shares encrypted to it; `seal_approve` verifies ed25519 over intent w/ `enclave.pk()`) | ✅ real (high-level) | `docs.sui.io/sui-stack/nautilus/seal` |
| Walrus PUT `/v1/blobs?epochs=N` + `newlyCreated.blobObject.blobId` / `alreadyCertified.blobId`; GET `/v1/blobs/<id>`; testnet/mainnet hosts | ✅ real | walrus-docs `docs/usage/web-api.md` |
| **In-enclave Seal key fetch in Rust** (no official Rust Seal client) | ⚠️ **VERIFY-FIRST** | documented path is TS SDK / Seal CLI `fetch-keys`; Rust must reimplement the HTTP+ElGamal or shell the CLI. See §3 note + fallback. |
| ElGamal scheme used by Seal responses (BLS12-381 G1 group elements, not classic ElGamal) | ⚠️ **VERIFY-FIRST** | doc says "BLS group elements"; match `@mysten/seal` `elgamal.mjs` exactly or use the fallback. |

**The fallback (documented in `BUILD_PLAN.md` §2, V1/V4, and used if §3's in-enclave fetch can't be finished):** the enclave does NOT speak Seal directly. Instead the **orchestrator** (TS/Python, §4) holds a `SessionKey` whose capability is the registered on-chain `Enclave`, calls `seal_approve` to fetch+decrypt the symmetric key, and passes the **decrypted test set over a TLS channel terminated inside the enclave** (or the enclave is provisioned a long-lived key at registration). The **attested-honest-scoring** claim (the moat) survives all three custody variants — only *who calls Seal* changes. Ship whichever lands; document it in `docs/verify/seal_nautilus_pattern.md`.

---

## 1. Move — `move/sealedbench/sources/sealed_eval.move`

`SealedEval` shared object + append-only access log via events + the attested-score writer. (The scaffold splits the score writer into `attested_score.move`; that split is fine and shown in §1b. Both are reproduced so the BCS contract is visible in one place.)

```move
module sealedbench::sealed_eval;

use std::string::String;
use sui::clock::Clock;
use sui::event;

// === errors ===
const EBadPlaintextHashLength: u64 = 1;
const EBadCiphertextHashLength: u64 = 2;
const EZeroSetSize: u64 = 3;
const EAlreadyRevealed: u64 = 4;

const SHA256_LENGTH: u64 = 32;

/// Sealed held-out benchmark. Shared so anyone can read provenance and so the
/// enclave can reference it when posting a score. Immutable once created except
/// for the optional post-eval `reveal`.
public struct SealedEval has key, store {
    id: UID,
    author: address,
    sha256_plaintext: vector<u8>,   // 32 bytes — SHA-256 of the raw JSONL test set
    sha256_ciphertext: vector<u8>,  // 32 bytes — SHA-256 of the Seal ciphertext on Walrus
    walrus_blob_id: String,
    seal_policy_id: ID,             // the package/object the Seal `id` namespace is bound to
    model_target: String,
    set_size: u64,
    cutoff_ts_ms: u64,              // author-supplied: target model's stated training cutoff
    sealed_at_ms: u64,             // stamped from &Clock — the provenance anchor
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

/// Append-only ACCESS LOG. Every time the enclave is granted the key (logged by
/// the orchestrator right after a successful `seal_approve` dry-run) one of these
/// is emitted. Events are append-only by construction — a tamper-evident audit trail.
public struct EvalAccessLogged has copy, drop {
    eval_id: ID,
    accessor_pk: vector<u8>,   // the enclave pk the key was released to
    access_ts_ms: u64,
}

public struct SealedEvalRevealed has copy, drop { eval_id: ID, plaintext_blob_id: String }

/// Create + share a SealedEval, stamping `sealed_at_ms` from the on-chain clock.
public fun create(
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
    assert!(sha256_plaintext.length() == SHA256_LENGTH, EBadPlaintextHashLength);
    assert!(sha256_ciphertext.length() == SHA256_LENGTH, EBadCiphertextHashLength);
    assert!(set_size > 0, EZeroSetSize);

    let eval = SealedEval {
        id: object::new(ctx),
        author: ctx.sender(),
        sha256_plaintext,
        sha256_ciphertext,
        walrus_blob_id,
        seal_policy_id,
        model_target,
        set_size,
        cutoff_ts_ms,
        sealed_at_ms: clock.timestamp_ms(),
        revealed: false,
        plaintext_blob_id: option::none(),
    };

    event::emit(SealedEvalCreated {
        eval_id: object::id(&eval),
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

    transfer::share_object(eval);
}

/// Append-only access-log writer. Call after the orchestrator confirms a
/// successful enclave key release. No state mutation beyond emitting the event.
public fun log_access(eval: &SealedEval, accessor_pk: vector<u8>, clock: &Clock) {
    event::emit(EvalAccessLogged {
        eval_id: object::id(eval),
        accessor_pk,
        access_ts_ms: clock.timestamp_ms(),
    });
}

/// Optional public reveal of the plaintext blob after evaluation closes.
public fun reveal(eval: &mut SealedEval, plaintext_blob_id: String) {
    assert!(!eval.revealed, EAlreadyRevealed);
    eval.revealed = true;
    eval.plaintext_blob_id = option::some(plaintext_blob_id);
    event::emit(SealedEvalRevealed { eval_id: object::id(eval), plaintext_blob_id });
}

// === getters (used by attested_score + off-chain readers) ===
public fun id(e: &SealedEval): ID { object::id(e) }
public fun author(e: &SealedEval): address { e.author }
public fun sha256_plaintext(e: &SealedEval): &vector<u8> { &e.sha256_plaintext }
public fun sha256_ciphertext(e: &SealedEval): &vector<u8> { &e.sha256_ciphertext }
public fun walrus_blob_id(e: &SealedEval): &String { &e.walrus_blob_id }
public fun seal_policy_id(e: &SealedEval): ID { e.seal_policy_id }
public fun model_target(e: &SealedEval): &String { &e.model_target }
public fun set_size(e: &SealedEval): u64 { e.set_size }
public fun cutoff_ts_ms(e: &SealedEval): u64 { e.cutoff_ts_ms }
public fun sealed_at_ms(e: &SealedEval): u64 { e.sealed_at_ms }
public fun revealed(e: &SealedEval): bool { e.revealed }

#[test]
fun test_create_stamps_clock_and_validates_hashes() {
    let mut ts = sui::test_scenario::begin(@0xA);
    let ctx = ts.ctx();
    let mut clock = sui::clock::create_for_testing(ctx);
    clock.set_for_testing(1_700_000_000_000);

    create(
        x"00000000000000000000000000000000000000000000000000000000000000aa", // 32B
        x"00000000000000000000000000000000000000000000000000000000000000bb", // 32B
        b"walrusBlob123".to_string(),
        object::id_from_address(@0xCAFE),
        b"acme-model-2026".to_string(),
        50,
        1_690_000_000_000, // cutoff before sealed_at -> demo would show "sealed AFTER cutoff ✗"
        &clock,
        ctx,
    );
    clock.destroy_for_testing();

    ts.next_tx(@0xA);
    let e = ts.take_shared<SealedEval>();
    assert!(e.sealed_at_ms() == 1_700_000_000_000, 0);
    assert!(e.sha256_plaintext().length() == 32, 1);
    assert!(e.set_size() == 50, 2);
    sui::test_scenario::return_shared(e);
    ts.end();
}
```

> **Move 2024 note:** this uses the **module-label** form (`module sealedbench::sealed_eval;` with no braces) and method syntax (`eval.length()`, `clock.timestamp_ms()`). The scaffold currently uses the older braced form with explicit `use std::vector` — that compiles too, but the label form is the 2024.beta idiom and avoids the `EUnusedUseException`/`use fun` noise. Either is acceptable; do not mix within one file.

### 1b. `move/sealedbench/sources/attested_score.move`

`post_attested_score` verifies the enclave signature over `(eval_id || model_id || score || nonce)` — encoded as the `ScorePayload` struct below — via the reused `enclave::verify_signature` **before** recording the score.

```move
module sealedbench::attested_score;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use enclave::enclave::{Self, Enclave};
use sealedbench::sealed_eval::{Self, SealedEval};

const EInvalidEnclaveSignature: u64 = 1;
const EBadItemsHashLength: u64 = 2;
const EZeroDenominator: u64 = 3;

const SHA256_LENGTH: u64 = 32;
/// scope=1 — MUST match Rust `SCORE_INTENT` and the table in the header.
const SCORE_INTENT: u8 = 1;

/// The signed message. FIELD ORDER IS LOAD-BEARING — it is the canonical encoding
/// of (eval_id || model_id || score || nonce):
///   eval_id     = sealed_eval_id (ID, 32B)
///   model_id    = model_target   (String)
///   score       = score_num / score_den (two u64)
///   nonce       = items_hash (32B, the SHA-256 over the ordered per-item results;
///                 doubles as the anti-replay nonce since it's unique per run) + trace_blob_id
/// Rust must derive a struct that BCS-serializes byte-identically (see §3 `ScorePayload`).
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
    enclave_pk: vector<u8>,
    posted_at_ms: u64,
}

/// Verify the enclave signature over the ScorePayload, then record the score.
/// Aborts (EInvalidEnclaveSignature) unless `signature` is a valid ed25519 sig
/// by `enclave.pk()` over IntentMessage{SCORE_INTENT, timestamp_ms, ScorePayload{..}}.
public fun post_attested_score<T>(
    enclave: &Enclave<T>,
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
    assert!(score_den > 0, EZeroDenominator);
    assert!(items_hash.length() == SHA256_LENGTH, EBadItemsHashLength);

    let sealed_eval_id = sealed_eval::id(sealed_eval);
    let model_target = *sealed_eval::model_target(sealed_eval);

    let payload = ScorePayload {
        sealed_eval_id,
        model_target,
        score_num,
        score_den,
        items_hash,
        trace_blob_id,
    };
    assert!(
        enclave::verify_signature(enclave, SCORE_INTENT, timestamp_ms, payload, &signature),
        EInvalidEnclaveSignature,
    );

    let score = AttestedScore {
        id: object::new(ctx),
        sealed_eval_id,
        model_target,
        score_num,
        score_den,
        items_hash,
        trace_blob_id,
        enclave_pk: *enclave::pk(enclave),
        posted_at_ms: clock.timestamp_ms(),
    };

    event::emit(AttestedScorePosted {
        score_id: object::id(&score),
        sealed_eval_id,
        model_target: score.model_target,
        score_num,
        score_den,
        enclave_pk: score.enclave_pk,
        posted_at_ms: score.posted_at_ms,
    });

    transfer::share_object(score);
}

public fun sealed_eval_id(s: &AttestedScore): ID { s.sealed_eval_id }
public fun score_num(s: &AttestedScore): u64 { s.score_num }
public fun score_den(s: &AttestedScore): u64 { s.score_den }
public fun items_hash(s: &AttestedScore): &vector<u8> { &s.items_hash }
public fun trace_blob_id(s: &AttestedScore): &String { &s.trace_blob_id }
public fun enclave_pk(s: &AttestedScore): &vector<u8> { &s.enclave_pk }

#[test]
fun post_score_accepts_enclave_sig_and_aborts_on_tamper() {
    // PK + SIG are generated by tools/gen-attestation-vectors.ts (fixed ed25519 seed)
    // signing IntentMessage{1, TS, ScorePayload{ id=0x..22 , "m", 9, 10, items_hash, "trace" }}.
    // Replace the placeholders below with the real vectors emitted by that tool.
    let pk: vector<u8> = x"79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
    let sig: vector<u8> = x"<<SCORE_SIG from gen-attestation-vectors.ts>>";
    let ts_ms: u64 = 1744038900000;

    let mut sc = sui::test_scenario::begin(@0xA11CE);
    let ctx = sc.ctx();
    let mut clock = sui::clock::create_for_testing(ctx);

    // Build a SealedEval whose object id equals the id the vector signed over.
    // (In practice the tool reads this id back; for the unit test, construct the
    //  SealedEval first, fetch its id, then sign — see tools/gen-attestation-vectors.ts.)
    let e = enclave::new_enclave_for_testing<sealedbench::seal_policy::TESTW>(pk, ctx);
    // ... create SealedEval, then:
    // post_attested_score(&e, &eval, 9, 10, items_hash, b"trace".to_string(), ts_ms, sig, &clock, ctx);
    // assert an AttestedScore was shared; then assert a tampered score_num aborts.
    enclave::destroy(e);
    clock.destroy_for_testing();
    sc.end();
}
```

> The `#[test]` above is a skeleton because the signature must be generated by the **same** ed25519 key as `PK`, over the **real** `SealedEval` id. The canonical way (mirrors the Aegis `test_serde` golden-vector approach) is a tiny `tools/gen-attestation-vectors.ts` that: makes a fixed-seed `Ed25519Keypair`, BCS-encodes the `IntentMessage`, signs, and prints `PK` + `SIG` + the chosen `eval_id`/`items_hash` for pasting. See §6.

---

## 2. Move — `move/sealedbench/sources/seal_policy.move`

`seal_approve` gates Seal key release to the attested enclave. Verifies the request carries a valid ed25519 signature from `enclave.pk()`. **`entry`, never `public entry`. Side-effect-free.** Matches the Seal pattern (`UsingSeal.mdx`: `seal_approve*` are non-public `entry`, side-effect-free, evaluated under `dry_run_transaction_block`).

```move
/// Seal access policy: the decryption key for a SealedEval is released ONLY to the
/// registered, attested enclave. Seal key servers evaluate `seal_approve` in a dry
/// run before returning key shares; it aborts unless the caller presents an ed25519
/// signature by the enclave's key over the access intent.
module sealedbench::seal_policy;

use enclave::enclave::{Self, Enclave};

const EInvalidEnclave: u64 = 1;
/// scope=2 — distinct from SCORE_INTENT=1; MUST match Rust `SEAL_INTENT`.
const SEAL_INTENT: u8 = 2;

/// Canonical encoding of the Seal access request the enclave signs.
/// `id` is the Seal IBE identity bytes the key servers are asked to release for.
public struct SealApproval has copy, drop { id: vector<u8> }

/// Seal entry: by convention the FIRST arg is the requested identity `id: vector<u8>`.
/// We then take the registered Enclave + a timestamp + the enclave's signature, and
/// abort unless the signature verifies against `enclave.pk()`.
///
/// VERIFY-FIRST: the Seal→Nautilus docs confirm `seal_approve` verifies an ed25519
/// signature over an intent message using `enclave.pk()`, scope-bound, with a fixed
/// key id. The shape below (id-as-IBE-identity + enclave sig over IntentMessage) maps
/// 1:1 to that. IF a hosted Seal key server additionally requires the *tx sender* to
/// equal a registered address (as the wallet example does), add:
///     assert!(ctx.sender() == enclave_owner_addr, EWrongSender);
/// using `enclave.owner` (add an `owner()` getter to the vendored module if needed).
/// FALLBACK (BUILD_PLAN §2 V1/V4): if gating-by-enclave-pk can't be made to work with
/// the chosen key servers in time, switch to the capability/session-key path — make
/// `id` carry the SealedEval ID and gate on a session whose cap is the on-chain
/// Enclave object; the attested-scoring claim is unaffected.
entry fun seal_approve<T>(
    id: vector<u8>,
    enclave: &Enclave<T>,
    timestamp_ms: u64,
    signature: vector<u8>,
) {
    assert!(
        enclave::verify_signature(
            enclave,
            SEAL_INTENT,
            timestamp_ms,
            SealApproval { id },
            &signature,
        ),
        EInvalidEnclave,
    );
}

#[test_only] public struct TESTW has drop {}
// Vectors from tools/gen-attestation-vectors.ts (fixed seed) signing
// IntentMessage{ SEAL_INTENT=2, TS, SealApproval{ id = x"22..22" } }.
#[test_only] const PK: vector<u8> = x"79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
#[test_only] const SEAL_SIG: vector<u8> =
    x"9513b9fe9d920e6ec473b9245d2776d7af972c305e29d319056d69c2faa1456829d2b0df3cb4ba83311e289703bb57a08d0cc378e85a78f5b9d6e4f71a269409";
#[test_only] const TS: u64 = 1744038900000;

#[test]
fun seal_approve_accepts_enclave_signature() {
    let mut s = sui::test_scenario::begin(@0xA11CE);
    let e = enclave::new_enclave_for_testing<TESTW>(PK, s.ctx());
    seal_approve(x"22222222222222222222222222222222", &e, TS, SEAL_SIG);
    enclave::destroy(e);
    s.end();
}

#[test]
#[expected_failure(abort_code = EInvalidEnclave)]
fun seal_approve_rejects_wrong_identity() {
    let mut s = sui::test_scenario::begin(@0xA11CE);
    let e = enclave::new_enclave_for_testing<TESTW>(PK, s.ctx());
    // Different id than was signed -> verify fails -> abort.
    seal_approve(x"33333333333333333333333333333333", &e, TS, SEAL_SIG);
    enclave::destroy(e);
    s.end();
}
```

> The scaffold already ships this module with these exact test vectors **passing** — they are real, generated from the fixed seed. Keep them. When you add the `ScorePayload` vectors in §1b, generate both from the *same* seed in one tool run so `PK` is shared.

---

## 3. Rust enclave `/evaluate` route

Adapts the Aegis Axum co-signer. New files: `enclave/src/{evaluate.rs, seal_client.rs, model_client.rs}` + the signer extension. Reuses `attestation.rs` and `sui_signature.rs` **verbatim**, plus the new `sign_intent_bytes` method. Shown: the route handler, the structs, the BCS-canonical signer, and the model/grade glue — not the whole crate.

### 3a. `enclave/src/sui_signature.rs` — ADD this method (keep the file otherwise verbatim)

```rust
// === ADD to impl AegisSigningKey (rename to EnclaveSigningKey for SealedBench if you like) ===
use ed25519_dalek::Signer; // already imported in the Aegis file

impl AegisSigningKey {
    /// Sign the RAW bytes of a BCS-encoded IntentMessage. This is what
    /// `enclave::verify_signature` checks. Do NOT route score/seal payloads
    /// through `sign_transaction_bytes` (that Blake2b-digests with a tx-intent
    /// prefix and is only for Sui transactions).
    pub fn sign_intent_bytes(&self, intent_bcs: &[u8]) -> [u8; 64] {
        self.key.sign(intent_bcs).to_bytes()
    }
}
```

### 3b. `enclave/src/evaluate.rs` — payload structs + BCS intent wrapper + route

```rust
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    model_client::{run_model, GradeResult},
    seal_client::decrypt_sealed_set,
    sui_signature::{serialize_ed25519_sui_signature, AegisSigningKey},
};

/// scope bytes — MUST match the Move consts.
const SCORE_INTENT: u8 = 1;
#[allow(dead_code)]
const SEAL_INTENT: u8 = 2;

/// 32-byte Sui ID/address. BCS-serializes as a fixed [u8;32] (no length prefix),
/// exactly like a Move `ID`. `serde_bytes`/`Vec<u8>` would add a length prefix and
/// would NOT match — use a fixed array newtype.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct IdBytes(pub [u8; 32]);

impl IdBytes {
    pub fn from_hex(s: &str) -> Result<Self, String> {
        let clean = s.strip_prefix("0x").unwrap_or(s);
        let v = hex::decode(clean).map_err(|e| format!("bad id hex: {e}"))?;
        let arr: [u8; 32] = v.try_into().map_err(|_| "id must be 32 bytes".to_string())?;
        Ok(IdBytes(arr))
    }
}

/// MIRRORS Move `attested_score::ScorePayload`. Field order + types are LOAD-BEARING.
/// Move ID -> IdBytes([u8;32]); Move String -> String; Move u64 -> u64;
/// Move vector<u8> -> Vec<u8>.
#[derive(Clone, Debug, Serialize)]
pub struct ScorePayload {
    pub sealed_eval_id: IdBytes,
    pub model_target: String,
    pub score_num: u64,
    pub score_den: u64,
    pub items_hash: Vec<u8>,
    pub trace_blob_id: String,
}

/// MIRRORS Move `enclave::IntentMessage<T>`: { intent: u8, timestamp_ms: u64, payload: T }.
/// BCS over THIS is exactly what `verify_signature` re-derives and checks.
#[derive(Clone, Debug, Serialize)]
pub struct IntentMessage<T: Serialize> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub payload: T,
}

pub fn sign_score(
    key: &AegisSigningKey,
    payload: ScorePayload,
    timestamp_ms: u64,
) -> Result<(String, String), String> {
    let msg = IntentMessage { intent: SCORE_INTENT, timestamp_ms, payload };
    // SAME wire format as Move `bcs::to_bytes`. The `bcs` crate (Mysten's) is canonical.
    let bytes = bcs::to_bytes(&msg).map_err(|e| format!("bcs encode: {e}"))?;
    let sig = key.sign_intent_bytes(&bytes);
    // Return both raw-hex (for the Move entry's `signature: vector<u8>`) and the
    // Sui-serialized form (only needed if you also submit the tx from the enclave).
    Ok((
        hex::encode(sig),
        serialize_ed25519_sui_signature(&sig, &key.public_key_bytes()),
    ))
}

// === HTTP types ===

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateRequest {
    /// 0x-hex Sui object id of the SealedEval.
    pub sealed_eval_id: String,
    /// Walrus blob id of the Seal ciphertext.
    pub walrus_blob_id: String,
    /// Seal IBE identity bytes (hex) the key was sealed under == the `id` seal_approve checks.
    pub seal_id_hex: String,
    /// Model id for the OpenAI-compatible endpoint (e.g. "gpt-4o-mini", an open checkpoint).
    pub model_target: String,
    /// Unix ms; the enclave binds this into the signed intent (anti-replay window).
    pub timestamp_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateResponse {
    pub sealed_eval_id: String,
    pub model_target: String,
    pub score_num: u64,
    pub score_den: u64,
    pub items_hash: String,      // hex, 32 bytes
    pub trace_blob_id: String,
    pub timestamp_ms: u64,
    pub signature_hex: String,   // -> Move `post_attested_score(.., signature)`
    pub enclave_pk_hex: String,  // == /get_attestation pubkey
}
```

### 3c. The Axum handler (in `enclave/src/main.rs`, replacing `/co_sign`)

```rust
// main.rs — swap the route + add the handler. AppState carries the signing key
// (kept) plus model/Walrus config read from env.
//
//   let app = Router::new()
//       .route("/health_check", get(health_check))
//       .route("/get_attestation", get(get_attestation))   // KEPT VERBATIM
//       .route("/evaluate", post(evaluate))                 // NEW (replaces /co_sign)
//       .with_state(state);

use crate::evaluate::{sign_score, EvaluateRequest, EvaluateResponse, IdBytes, ScorePayload};

async fn evaluate(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EvaluateRequest>,
) -> Result<Json<EvaluateResponse>, (axum::http::StatusCode, String)> {
    use axum::http::StatusCode;
    let err = |c: StatusCode, m: String| (c, m);

    // (a) fetch ciphertext from Walrus by blob id
    let ciphertext = crate::seal_client::fetch_walrus_blob(
        &state.walrus_aggregator, &req.walrus_blob_id,
    ).await.map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;

    // (b)+(c) obtain Seal key shares ENCRYPTED TO THE ENCLAVE'S ElGamal pubkey,
    // reconstruct the symmetric key IN-ENCLAVE, AES-decrypt the held-out set.
    // Plaintext lives only in this stack frame; never logged, never returned.
    let plaintext = crate::seal_client::decrypt_sealed_set(
        &state, &req.seal_id_hex, &ciphertext,
    ).await.map_err(|e| err(StatusCode::FORBIDDEN, e))?;

    // (d) run the model over each item and grade (temperature=0 for determinism)
    let graded = crate::model_client::run_and_grade(
        &state, &req.model_target, &plaintext,
    ).await.map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;
    drop(plaintext); // explicit: decrypted set is gone before we build the response

    // items_hash = SHA-256 over the canonical ordered per-item result rows; it is the
    // commitment the on-chain object stores and the trace on Walrus must reproduce.
    let items_hash = graded.items_hash.clone();          // Vec<u8>, 32 bytes
    let trace_blob_id = crate::seal_client::put_walrus_blob(
        &state.walrus_publisher, &graded.trace_json, state.walrus_epochs,
    ).await.map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;

    // (e) sign IntentMessage{SCORE_INTENT, ts, ScorePayload{..}}
    let id = IdBytes::from_hex(&req.sealed_eval_id)
        .map_err(|e| err(StatusCode::BAD_REQUEST, e))?;
    let payload = ScorePayload {
        sealed_eval_id: id,
        model_target: req.model_target.clone(),
        score_num: graded.correct,
        score_den: graded.total,
        items_hash: items_hash.clone(),
        trace_blob_id: trace_blob_id.clone(),
    };
    let (signature_hex, _sui_sig) = sign_score(&state.signing_key, payload, req.timestamp_ms)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(EvaluateResponse {
        sealed_eval_id: req.sealed_eval_id,
        model_target: req.model_target,
        score_num: graded.correct,
        score_den: graded.total,
        items_hash: hex::encode(items_hash),
        trace_blob_id,
        timestamp_ms: req.timestamp_ms,
        signature_hex,
        enclave_pk_hex: hex::encode(state.signing_key.public_key_bytes()),
    }))
}
```

### 3d. `enclave/src/seal_client.rs` — Walrus IO (real) + Seal decrypt (VERIFY-FIRST)

```rust
use crate::AppState;

/// GET ciphertext from a Walrus aggregator. Endpoint shape is REAL:
///   GET {aggregator}/v1/blobs/<blobId>  -> raw bytes
pub async fn fetch_walrus_blob(aggregator: &str, blob_id: &str) -> Result<Vec<u8>, String> {
    let url = format!("{aggregator}/v1/blobs/{blob_id}");
    let resp = reqwest::Client::new().get(&url).send().await
        .map_err(|e| format!("walrus GET: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("walrus GET {}: {}", url, resp.status()));
    }
    Ok(resp.bytes().await.map_err(|e| format!("walrus body: {e}"))?.to_vec())
}

/// PUT trace bytes to a Walrus publisher. Endpoint + the `epochs` param are REAL and
/// `epochs` is MANDATORY. Response JSON: prefer `newlyCreated.blobObject.blobId`,
/// else `alreadyCertified.blobId`.
pub async fn put_walrus_blob(publisher: &str, body: &[u8], epochs: u32) -> Result<String, String> {
    let url = format!("{publisher}/v1/blobs?epochs={epochs}");
    let resp = reqwest::Client::new().put(&url).body(body.to_vec()).send().await
        .map_err(|e| format!("walrus PUT: {e}"))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("walrus PUT json: {e}"))?;
    json.pointer("/newlyCreated/blobObject/blobId")
        .or_else(|| json.pointer("/alreadyCertified/blobId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("no blobId in walrus response: {json}"))
}

/// Reconstruct the symmetric key from Seal shares (encrypted to the enclave's ElGamal
/// pubkey) and AES-decrypt the held-out set, all in-enclave.
///
/// ⚠️ VERIFY-FIRST — there is NO official Rust Seal client. The DOCUMENTED path is the
/// TS SDK (`SealClient.fetchKeys`/`decrypt`) or the Seal CLI (`seal fetch-keys`). Three
/// implementable options, in order of effort:
///
///   (1) PORT the minimal flow from `@mysten/seal` `dist/{elgamal,ibe,kdf,dem,shamir,
///       decrypt}.mjs`: generate a BLS12-381 ElGamal keypair (G1 group elements) at
///       enclave startup; POST a FetchKey request to each key server (the `id`, the PTB
///       bytes that call `seal_approve`, the SessionKey certificate, and the ElGamal
///       enc pubkey); each server returns a share encrypted to that pubkey; ElGamal-
///       decrypt shares, Shamir-combine to the IBE key, HKDF -> AES-256, AES-GCM-decrypt.
///       MATCH `elgamal.mjs` + `dem.mjs` byte-for-byte or decryption fails silently.
///   (2) SHELL OUT to the Seal CLI inside the enclave image (`seal fetch-keys ...`),
///       parse its output. Simplest to get right; bloats the EIF + needs CLI egress.
///   (3) FALLBACK (BUILD_PLAN §2): the enclave does not fetch the key at all — the
///       orchestrator decrypts via the TS SDK using a SessionKey gated to the on-chain
///       Enclave, and streams the plaintext to the enclave over enclave-terminated TLS,
///       OR the enclave is provisioned a long-lived key at registration. The
///       attested-honest-scoring claim is identical under all three.
///
/// Until one of these is locked, this returns the plaintext via option (3)'s shape so
/// the rest of the pipeline (and `cargo test evaluate`) is exercisable with a fixture.
pub async fn decrypt_sealed_set(
    _state: &AppState,
    _seal_id_hex: &str,
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    // VERIFY-FIRST placeholder. For local `cargo test`, point AppState at a fixture key
    // (AES-256) provisioned at startup and AES-GCM-decrypt `ciphertext` here. Replace
    // with option (1)/(2) for the attested mainnet path. NEVER log the return value.
    decrypt_with_provisioned_key(_state, ciphertext)
}

fn decrypt_with_provisioned_key(_state: &AppState, _ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    // implement AES-256-GCM open with `_state.provisioned_key`; omitted for brevity.
    Err("provisioned-key decrypt not wired; see VERIFY-FIRST options".into())
}
```

### 3e. `enclave/src/model_client.rs` — OpenAI-compatible runner + grader

```rust
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use crate::AppState;

#[derive(Debug)]
pub struct GradeResult {
    pub correct: u64,
    pub total: u64,
    pub items_hash: Vec<u8>,   // 32 bytes
    pub trace_json: Vec<u8>,   // full prompts+responses+grades, -> Walrus
}

#[derive(Deserialize)]
struct HeldoutItem { id: String, question: String, answer: String, rubric: String }

#[derive(Serialize)]
struct ChatReq<'a> {
    model: &'a str,
    messages: Vec<ChatMsg<'a>>,
    temperature: f32,   // 0.0 — determinism is part of the honesty claim
}
#[derive(Serialize)]
struct ChatMsg<'a> { role: &'a str, content: &'a str }
#[derive(Deserialize)]
struct ChatResp { choices: Vec<Choice> }
#[derive(Deserialize)]
struct Choice { message: RespMsg }
#[derive(Deserialize)]
struct RespMsg { content: String }

/// OpenAI-compatible `/v1/chat/completions`. Provider/base-url/key come from AppState
/// (env), so the SAME code drives an open checkpoint and a hosted model.
async fn complete(state: &AppState, model: &str, prompt: &str) -> Result<String, String> {
    let body = ChatReq {
        model,
        messages: vec![ChatMsg { role: "user", content: prompt }],
        temperature: 0.0,
    };
    let resp = reqwest::Client::new()
        .post(format!("{}/v1/chat/completions", state.model_base_url))
        .bearer_auth(&state.model_api_key)
        .json(&body)
        .send().await.map_err(|e| format!("model call: {e}"))?;
    let parsed: ChatResp = resp.json().await.map_err(|e| format!("model json: {e}"))?;
    parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "empty model response".into())
}

/// Decrypt set (JSONL) -> run each item -> grade -> tally + canonical hash + trace.
pub async fn run_and_grade(
    state: &AppState,
    model: &str,
    plaintext_jsonl: &[u8],
) -> Result<GradeResult, String> {
    let text = std::str::from_utf8(plaintext_jsonl).map_err(|e| format!("utf8: {e}"))?;
    let items: Vec<HeldoutItem> = text.lines().filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(|e| format!("bad jsonl: {e}")))
        .collect::<Result<_, _>>()?;

    let mut correct = 0u64;
    let mut hasher = Sha256::new();
    let mut trace = Vec::<serde_json::Value>::new();

    for item in &items {
        let response = complete(state, model, &item.question).await?;
        // Grading: exact-match here for determinism; swap for a rubric judge (also
        // temperature=0, deterministic) if `rubric` is non-trivial. Whatever the rule,
        // it must be pure + reproducible from the trace.
        let is_correct = grade(&item.answer, &item.rubric, &response);
        if is_correct { correct += 1; }

        // Canonical per-item row feeds BOTH the items_hash and the Walrus trace.
        let row = serde_json::json!({
            "id": item.id, "response": response, "correct": is_correct,
        });
        // Hash the canonical compact bytes of each row, in order -> items_hash.
        hasher.update(serde_json::to_vec(&row).map_err(|e| e.to_string())?);
        trace.push(serde_json::json!({
            "id": item.id, "question": item.question, "answer": item.answer,
            "rubric": item.rubric, "response": response, "correct": is_correct,
        }));
    }

    let items_hash = hasher.finalize().to_vec();
    let trace_json = serde_json::to_vec(&serde_json::json!({
        "model": model, "endpoint": state.model_base_url, "items": trace,
    })).map_err(|e| e.to_string())?;

    Ok(GradeResult { correct, total: items.len() as u64, items_hash, trace_json })
}

fn grade(answer: &str, _rubric: &str, response: &str) -> bool {
    response.trim().eq_ignore_ascii_case(answer.trim())
}
```

### 3f. `cargo test` — proves the SAME-BYTES contract without a chain

```rust
// enclave/src/evaluate.rs  #[cfg(test)]
// The golden vector is generated by the Move `enclave::test_serde` (the x"0020..."
// constant) — re-deriving it here proves Rust BCS == Move BCS for IntentMessage.
#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    #[derive(Serialize)]
    struct SigningPayload { location: String, temperature: u64 }

    #[test]
    fn bcs_intent_matches_move_golden() {
        // Mirrors enclave.move::test_serde: scope=0, ts=1744038900000,
        // payload { location: "San Francisco", temperature: 13 }.
        let msg = IntentMessage {
            intent: 0u8,
            timestamp_ms: 1744038900000u64,
            payload: SigningPayload { location: "San Francisco".into(), temperature: 13 },
        };
        let bytes = bcs::to_bytes(&msg).unwrap();
        assert_eq!(
            hex::encode(&bytes),
            "0020b1d110960100000d53616e204672616e636973636f0d00000000000000",
        );
    }

    #[test]
    fn no_plaintext_in_trace_logging() {
        // assert the response struct + any tracing line never contains a held-out answer.
        // (capture tracing with a test subscriber; assert the secret substring is absent)
    }
}
```

> **Why §3f is the linchpin:** if `bcs_intent_matches_move_golden` passes, the Rust enclave and the Move verifier agree byte-for-byte on `IntentMessage` encoding. Every score/seal signature is then guaranteed to verify on-chain. This is the single highest-value test in the repo — write it first.

---

## 4. TS / Python — seal + upload + record + evaluate

### 4a. `packages/walrus/src/index.ts` — store/read (endpoints REAL)

```ts
// @mysten/sui@2.17.0. Endpoints from BUILD_PLAN §2 V3 (walrus-docs web-api.md).
export const WALRUS_ENDPOINTS = {
  testnet: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
  },
  mainnet: {
    publisher: "https://publisher.walrus-mainnet.walrus.space",
    aggregator: "https://aggregator.walrus-mainnet.walrus.space",
  },
} as const;

export type WalrusNetwork = keyof typeof WALRUS_ENDPOINTS;

interface PutResult { newlyCreated?: { blobObject: { blobId: string } }; alreadyCertified?: { blobId: string } }

/** PUT bytes; `epochs` is MANDATORY (testnet epoch ~1d, mainnet ~2w). */
export async function putBlob(
  bytes: Uint8Array,
  epochs: number,
  net: WalrusNetwork = "testnet",
): Promise<string> {
  const url = `${WALRUS_ENDPOINTS[net].publisher}/v1/blobs?epochs=${epochs}`;
  const res = await fetch(url, { method: "PUT", body: bytes });
  if (!res.ok) throw new Error(`walrus PUT ${res.status}`);
  const json = (await res.json()) as PutResult;
  const blobId = json.newlyCreated?.blobObject.blobId ?? json.alreadyCertified?.blobId;
  if (!blobId) throw new Error(`no blobId in response: ${JSON.stringify(json)}`);
  return blobId;
}

export async function getBlob(blobId: string, net: WalrusNetwork = "testnet"): Promise<Uint8Array> {
  const url = `${WALRUS_ENDPOINTS[net].aggregator}/v1/blobs/${blobId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`walrus GET ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
```

### 4b. `packages/seal/src/index.ts` — Seal-encrypt the held-out set (API REAL)

```ts
import { SealClient, SessionKey, KemType, DemType } from "@mysten/seal";
import type { KeyServerConfig } from "@mysten/seal";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, toHex } from "@mysten/sui/utils";
import { sha256 } from "@noble/hashes/sha2";

// REAL mysten-testnet OPEN key servers (from Seal docs UsingSeal.mdx). 2-of-2 here.
export const TESTNET_KEY_SERVERS: KeyServerConfig[] = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];
// Mainnet: discover the production servers via getAllowlistedKeyServers / Seal docs
// at cutover (VERIFY-FIRST: object IDs differ on mainnet).

export interface SealedSet {
  ciphertext: Uint8Array;
  sha256Plaintext: Uint8Array;   // 32 bytes
  sha256Ciphertext: Uint8Array;  // 32 bytes
  sealIdHex: string;             // the IBE identity (== `id` checked by seal_approve)
  policyId: string;              // the package id namespace bound to the Seal `id`
}

/**
 * Seal-encrypt a held-out JSON test set under a policy whose `seal_approve` (Phase 2)
 * gates to the enclave key. The Seal `id` = packageId-namespaced identity bytes.
 */
export async function sealHeldoutSet(opts: {
  plaintext: Uint8Array;       // the raw JSONL bytes
  packageId: string;           // sealedbench package (holds seal_policy::seal_approve)
  idBytesHex: string;          // identity, e.g. hex of the SealedEval's intended id/nonce
  threshold?: number;
  net?: "testnet" | "mainnet";
}): Promise<SealedSet> {
  const suiClient = new SuiClient({ url: getFullnodeUrl(opts.net ?? "testnet") });
  const client = new SealClient({
    suiClient,
    serverConfigs: TESTNET_KEY_SERVERS,
    verifyKeyServers: false, // open servers; flip true at startup if you must verify URLs
  });

  const { encryptedObject } = await client.encrypt({
    kemType: KemType.BonehFranklinBLS12381DemCCA,
    demType: DemType.AesGcm256,
    threshold: opts.threshold ?? 2,
    packageId: opts.packageId,
    id: opts.idBytesHex,           // hex string; matches `seal_approve(id: vector<u8>, ...)`
    data: opts.plaintext,
  });

  return {
    ciphertext: encryptedObject,
    sha256Plaintext: sha256(opts.plaintext),
    sha256Ciphertext: sha256(encryptedObject),
    sealIdHex: opts.idBytesHex,
    policyId: opts.packageId,
  };
}

/** Round-trip helper for the Phase-1 Vitest test (author session, before the enclave exists). */
export async function buildSealApproveTx(packageId: string, idHex: string): Promise<Transaction> {
  const tx = new Transaction();
  // NOTE: the real seal_approve also takes (&Enclave, timestamp_ms, signature). For the
  // Seal `decrypt`/`fetchKeys` PTB the args are filled by whoever holds the enclave sig.
  tx.moveCall({
    target: `${packageId}::seal_policy::seal_approve`,
    arguments: [tx.pure.vector("u8", Array.from(fromHex(idHex))) /* , enclave, ts, sig */],
  });
  return tx;
}

export { sha256, toHex, fromHex };
```

> **VERIFY-FIRST on the decrypt PTB:** `client.decrypt({ data, sessionKey, txBytes })` requires `txBytes` to be a PTB that calls `seal_approve*` (Seal docs). Because our `seal_approve` needs `(&Enclave, timestamp_ms, signature)`, the **enclave** (or its delegate) builds and signs that PTB — the author-side Phase-1 `decrypt` test uses a *placeholder* time-lock policy as `BUILD_PLAN.md` §1.2 specifies, upgraded to the enclave-gated policy in Phase 2. Don't try to make the author session decrypt the enclave-gated set.

### 4c. `scripts/seal-and-notarize.ts` — Phase-1 e2e (create `SealedEval`)

```ts
import { readFileSync } from "node:fs";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import { putBlob } from "@sealedbench/walrus";
import { sealHeldoutSet } from "@sealedbench/seal";

const PACKAGE_ID = process.env.SEALEDBENCH_PACKAGE_ID!;
const NET = (process.env.SUI_NETWORK ?? "testnet") as "testnet" | "mainnet";
const CLOCK = "0x6";

async function main() {
  const setPath = process.argv[process.argv.indexOf("--set") + 1];
  const plaintext = new Uint8Array(readFileSync(setPath));
  const setSize = new TextDecoder().decode(plaintext).split("\n").filter((l) => l.trim()).length;
  const cutoffTsMs = Number(process.env.CUTOFF_TS_MS);            // author-supplied model cutoff
  const modelTarget = process.env.MODEL_TARGET!;

  // identity bytes for the Seal `id` namespace (a fresh nonce; also the anti-replay nonce)
  const idBytesHex = toHex(crypto.getRandomValues(new Uint8Array(16)));

  const sealed = await sealHeldoutSet({ plaintext, packageId: PACKAGE_ID, idBytesHex, net: NET });
  const epochs = NET === "mainnet" ? 26 : 5;                      // ~1yr mainnet / ~5d testnet
  const blobId = await putBlob(sealed.ciphertext, epochs, NET);

  const suiClient = new SuiClient({ url: getFullnodeUrl(NET) });
  const signer = Ed25519Keypair.fromSecretKey(process.env.SUI_SECRET_KEY!);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::sealed_eval::create`,
    arguments: [
      tx.pure.vector("u8", Array.from(sealed.sha256Plaintext)),
      tx.pure.vector("u8", Array.from(sealed.sha256Ciphertext)),
      tx.pure.string(blobId),
      tx.pure.id(PACKAGE_ID),            // seal_policy_id namespace == the package
      tx.pure.string(modelTarget),
      tx.pure.u64(setSize),
      tx.pure.u64(cutoffTsMs),
      tx.object(CLOCK),
    ],
  });

  const res = await suiClient.signAndExecuteTransaction({
    signer, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  const created = res.objectChanges?.find(
    (c) => c.type === "created" && c.objectType.endsWith("::sealed_eval::SealedEval"),
  );
  console.log(JSON.stringify({
    sealedEvalId: created && "objectId" in created ? created.objectId : null,
    txDigest: res.digest, walrusBlobId: blobId,
    sealIdHex: sealed.sealIdHex,
    sha256Ciphertext: toHex(sealed.sha256Ciphertext),
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
```

### 4d. Evaluator client — `evaluator/sealedbench_eval/run_flow.py` (Python, typed)

Triggers `/evaluate` and submits `post_attested_score`. Type hints + the enclave-sig pass-through.

```python
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class EvaluateResult:
    sealed_eval_id: str
    model_target: str
    score_num: int
    score_den: int
    items_hash_hex: str
    trace_blob_id: str
    timestamp_ms: int
    signature_hex: str
    enclave_pk_hex: str


async def trigger_evaluate(
    enclave_url: str,
    *,
    sealed_eval_id: str,
    walrus_blob_id: str,
    seal_id_hex: str,
    model_target: str,
    timestamp_ms: int,
) -> EvaluateResult:
    """POST the attested enclave's /evaluate route and parse the signed ScorePayload."""
    payload = {
        "sealedEvalId": sealed_eval_id,
        "walrusBlobId": walrus_blob_id,
        "sealIdHex": seal_id_hex,
        "modelTarget": model_target,
        "timestampMs": timestamp_ms,
    }
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(f"{enclave_url}/evaluate", json=payload)
        resp.raise_for_status()
        d = resp.json()
    return EvaluateResult(
        sealed_eval_id=d["sealedEvalId"],
        model_target=d["modelTarget"],
        score_num=int(d["scoreNum"]),
        score_den=int(d["scoreDen"]),
        items_hash_hex=d["itemsHash"],
        trace_blob_id=d["traceBlobId"],
        timestamp_ms=int(d["timestampMs"]),
        signature_hex=d["signatureHex"],
        enclave_pk_hex=d["enclavePkHex"],
    )


def post_attested_score(
    result: EvaluateResult,
    *,
    package_id: str,
    enclave_object_id: str,
    enclave_type_arg: str,  # e.g. f"{package_id}::sealedbench::SEALEDBENCH"
) -> str:
    """Submit the on-chain `post_attested_score` PTB via the Sui CLI.

    The enclave already signed IntentMessage{SCORE_INTENT, ts, ScorePayload}; on-chain
    `enclave::verify_signature` re-derives the bytes and checks them. We pass the raw
    hex signature straight through as the `signature: vector<u8>` arg.
    """
    items_hash = list(bytes.fromhex(result.items_hash_hex))
    signature = list(bytes.fromhex(result.signature_hex))
    args = [
        "sui", "client", "call",
        "--package", package_id,
        "--module", "attested_score",
        "--function", "post_attested_score",
        "--type-args", enclave_type_arg,
        "--args",
        enclave_object_id,
        result.sealed_eval_id,
        str(result.score_num),
        str(result.score_den),
        json.dumps(items_hash),
        result.trace_blob_id,
        str(result.timestamp_ms),
        json.dumps(signature),
        "0x6",  # Clock
        "--gas-budget", "100000000",
        "--json",
    ]
    out = subprocess.run(args, check=True, capture_output=True, text=True).stdout
    digest = json.loads(out).get("digest", "")
    return digest
```

> **Anthropic-hosted model with prompt caching (standing preference).** When the target/grader model is Claude (not just the OpenAI-compatible open checkpoint), the model call MUST use prompt caching: put the static system prompt + the benchmark grading instructions in their own blocks with `cache_control: {"type": "ephemeral"}`, leaving only the per-item question uncached. In the Rust enclave this means an Anthropic Messages request with `system: [{type:"text", text: <rubric/instructions>, cache_control:{type:"ephemeral"}}]`; in any Python/TS judge use the Anthropic SDK with the same block on the system + tools. The model that *fills* the leaderboard (the open checkpoint) goes through the OpenAI-compatible path in §3e; the *grader* is where caching pays off across 50+ items.

---

## 5. Phase-1 (no-TEE) provenance path — "sealed-before-cutoff" demo

The minimal claim that's submittable on its own (no enclave): commit `content_sha256` + `cutoff_ts_ms` on-chain at seal time, reveal at unlock, and prove a model whose public training cutoff predates the seal could not have seen it. This is just `sealed_eval::create` + `reveal` (§1) plus an off-chain verifier.

### `scripts/verify-provenance.ts`

```ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { fromBase64, toHex } from "@mysten/sui/utils";
import { sha256 } from "@noble/hashes/sha2";
import { getBlob } from "@sealedbench/walrus";

const NET = (process.env.SUI_NETWORK ?? "testnet") as "testnet" | "mainnet";

/**
 * Re-fetch the SealedEval, re-download the Walrus ciphertext, recompute its SHA-256,
 * and assert it matches the on-chain commitment. Then state the seal-before-cutoff
 * fact. Exit non-zero if the blob was tampered (this is the "tamper makes it fail" AC).
 */
async function main() {
  const objectId = process.argv[2];
  const sui = new SuiClient({ url: getFullnodeUrl(NET) });
  const obj = await sui.getObject({ id: objectId, options: { showContent: true } });
  const f = (obj.data?.content as { fields: Record<string, unknown> }).fields;

  const onchainCiphertextHash = bytesFieldToHex(f.sha256_ciphertext);
  const blobId = String(f.walrus_blob_id);
  const sealedAtMs = Number(f.sealed_at_ms);
  const cutoffTsMs = Number(f.cutoff_ts_ms);
  const modelTarget = String(f.model_target);

  const ciphertext = await getBlob(blobId, NET);
  const recomputed = toHex(sha256(ciphertext));
  if (recomputed !== onchainCiphertextHash) {
    console.error(`TAMPER: walrus blob hash ${recomputed} != on-chain ${onchainCiphertextHash}`);
    process.exit(1);
  }

  const sealedBeforeCutoff = sealedAtMs < cutoffTsMs;
  console.log(
    `Test set ciphertext ${onchainCiphertextHash} was sealed on-chain at ${new Date(sealedAtMs).toISOString()} ` +
    `(object ${objectId}). Model ${modelTarget} stated cutoff = ${new Date(cutoffTsMs).toISOString()}. ` +
    `Ciphertext on Walrus ${blobId} verified to match. ` +
    `sealed_before_cutoff = ${sealedBeforeCutoff ? "✓" : "✗"}.`,
  );
  // For the KILLER DEMO the interesting case is the CLEAN model: sealed_at < model cutoff
  // is the wrong direction; the provable-clean claim is the inverse — the seal happened
  // and the model's PUBLIC checkpoint date is EARLIER than sealed_at, so it could not
  // have ingested this ciphertext. Compute and print BOTH framings explicitly:
  console.log(
    `clean_model_check: a model whose public checkpoint predates ${new Date(sealedAtMs).toISOString()} ` +
    `provably could not have trained on this set.`,
  );
  process.exit(0);
}

function bytesFieldToHex(field: unknown): string {
  // Move vector<u8> reads back as number[] (or base64 in some RPC encodings).
  if (Array.isArray(field)) return toHex(Uint8Array.from(field as number[]));
  return toHex(fromBase64(String(field)));
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**The provenance argument, stated precisely (put this verbatim in the demo + README, per `BUILD_PLAN.md` §7 / README "what is and isn't proven"):**
- The on-chain `SealedEval` proves *this exact ciphertext* (by SHA-256) existed on Sui at `sealed_at_ms` (the tx is timestamped and immutable). It does **not** prove the author kept no private plaintext copy.
- A model is **provably clean** for this set iff its **public, dated checkpoint** is earlier than `sealed_at_ms` — then the sealed ciphertext did not exist when the model's weights were frozen, so it cannot be in the training data. This is the cold-start pair: one self-authored set + one open model with a published checkpoint date.
- `cutoff_ts_ms` (author-supplied) is the *contamination-risk* framing for closed models: a model with cutoff **after** the benchmark's public release is *plausibly* contaminated — the demo shows its sealed-set score collapse. That's evidence, not proof; only the open-checkpoint-before-seal case is a proof. Keep the two claims distinct.

---

## 6. `tools/gen-attestation-vectors.ts` — the golden-vector generator (unblocks every Move test)

Produces the `PK` / `SEAL_SIG` / `SCORE_SIG` constants the Move `#[test]`s paste in. One fixed seed → one shared `PK`. This is how the Aegis `test_serde` vector was made and is the only sane way to keep Rust/Move/TS BCS in lockstep.

```ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";
import { toHex } from "@mysten/sui/utils";

// Fixed 32-byte seed => deterministic key across runs (NOT for production).
const SEED = new Uint8Array(32).fill(7);
const kp = Ed25519Keypair.fromSecretKey(SEED);
const pk = kp.getPublicKey().toRawBytes(); // 32B ed25519 pubkey == enclave.pk

// BCS schemas MIRRORING the Move structs (declaration order!).
const SealApproval = bcs.struct("SealApproval", { id: bcs.vector(bcs.u8()) });
const ScorePayload = bcs.struct("ScorePayload", {
  sealed_eval_id: bcs.fixedArray(32, bcs.u8()),   // Move ID
  model_target: bcs.string(),
  score_num: bcs.u64(),
  score_den: bcs.u64(),
  items_hash: bcs.vector(bcs.u8()),
  trace_blob_id: bcs.string(),
});
const intent = <T>(scope: number, ts: bigint, schema: { serialize: (v: T) => { toBytes(): Uint8Array } }, payload: T) =>
  bcs.struct("IntentMessage", {
    intent: bcs.u8(), timestamp_ms: bcs.u64(), payload: { serialize: (v: T) => schema.serialize(v) } as never,
  }).serialize({ intent: scope, timestamp_ms: ts, payload } as never).toBytes();

const TS = 1744038900000n;

// SEAL vector (scope=2), id = 0x22..22
const sealBytes = intent(2, TS, SealApproval, { id: Array(16).fill(0x22) });
const sealSig = await kp.sign(sealBytes);

console.log(JSON.stringify({
  PK: toHex(pk),
  TS: TS.toString(),
  SEAL_SIG: toHex(sealSig),
  // For SCORE_SIG: build ScorePayload with the REAL eval_id you'll test against,
  // sign intent(1, TS, ScorePayload, {...}) the same way, print toHex(sig).
}, null, 2));
```

> `kp.sign(bytes)` signs the raw bytes with ed25519 (no Sui intent prefix) — exactly what `ed25519::ed25519_verify(sig, pk, bcs_bytes)` checks. This is the TS twin of the Rust `sign_intent_bytes` in §3a. If all three (`gen-attestation-vectors.ts`, the Rust `cargo test` golden, and the Move `#[test]`s) agree, signing is correct end-to-end.

---

## Quick map: which BUILD_PLAN task each section unblocks

| Section | BUILD_PLAN task |
|---|---|
| §1 `sealed_eval.move` | 1.1 |
| §1b `attested_score.move` | 2.4 |
| §2 `seal_policy.move` | 2.3 (V1/V4) |
| §3 Rust `/evaluate` + seal_client + model_client | 2.2 |
| §3a `sign_intent_bytes` + §3f golden test | 2.2 AC ("signature verifies against /get_attestation") |
| §4a walrus | 1.3 (V3) |
| §4b seal | 1.2 (V1/V5) |
| §4c seal-and-notarize | 1.4 |
| §4d evaluator client | 2.7 |
| §5 verify-provenance | 1.5 |
| §6 gen-attestation-vectors | the test-vector dependency under 1.1/2.3/2.4 |
