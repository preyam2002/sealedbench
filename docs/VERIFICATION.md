# SealedBench — verification ledger

Everything here is real and reproducible within the gate-free path: on-chain ids
resolve on a Sui explorer, Walrus blobs resolve on the aggregator, and
signatures verify across Rust, TypeScript, and Move. Local-only seams are
explicit; do not treat them as production Nitro/Seal proof.

## Real testnet artifacts

| Artifact | Id |
|---|---|
| Move package | `0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f` |
| UpgradeCap | `0x7dc07b18cee10a051b23192bed99e31b333878ab0b7af3cc3417eac25100cb8c` |
| Enclave Cap | `0x147c132bad4b40574e6717126309bd6e32d8f42b780c1dc925948876648a6017` |
| SealedEval (seed v1) | `0x758aab4a1ecbb5dab258af6a42a9208562038df125df0fd667572c06e62a77c6` |
| Publish tx | `4LxxArqDNs5RmysvR7UyJB8EHDGPPnQEGKbEViNmQvLu` |
| Create tx | `BPEnFv3iF7kyL6NVuFbu5AQ3xHScg61yGA3LadJBC9Sm` |
| Walrus ciphertext blob | `T8KX29uMz18IWrYxgTAm9sfFrIgBCIJg5KDhG_6MLNQ` |
| sha256(plaintext) | `45da3c9554f9dfbf128e2de6416beb6b99703b718495041354669f899545701f` |

## Test matrix (92 tests, 3 languages)

```bash
pnpm test                       # 48 vitest (web 11, shared 4, walrus 3, seal 3, scripts 27)
pnpm move:test                  # 10 sui move tests
cd enclave && cargo test        # 34 cargo tests
```

`SEALEDBENCH_SKIP_NETWORK=1 pnpm test` skips the live-testnet round-trips for
offline/CI determinism.

## Reproduce each guarantee

**Phase 1 — seal-before-cutoff provenance**
```bash
pnpm tsx scripts/verify-provenance.ts
#   -> ciphertext integrity MATCH, exit 0
pnpm tsx scripts/verify-provenance.ts --tamper-test
#   -> MISMATCH, exit 1
```

**Cross-language attestation interop** — the Rust enclave produces the exact
signature the Move contract verifies (fixed-seed vector):
- `enclave/src/signing.rs::tests` asserts pk + score + seal signatures.
- `move/sealedbench/tests` + `seal_policy` verify the same bytes on-chain.
- regenerate: `pnpm tsx tools/gen-attestation-vectors.ts`.

**Cross-language Seal interop (G3)** — the in-enclave Seal client byte-matches
@mysten/seal 1.1.3 + @mysten/sui:
- `enclave/src/seal_client.rs::tests` decrypts a TS-SDK-encrypted object through
  the full IBE/TSS/DEM stack and byte-compares the seal_approve PTB BCS,
  personal-message + fetch_key request signatures, certificate time format, and
  Sui address derivation against SDK-generated vectors.
- regenerate: `pnpm tsx tools/gen-seal-vectors.ts` (writes
  `fixtures/seal-vectors.json`).

**Phase 2.6 — run trace committed on Walrus** (no Nitro/keys):
```bash
cd enclave && ENCLAVE_ADDR=127.0.0.1:3931 cargo run --bin sealedbench-enclave-server &
# POST /evaluate with walrus_publisher_url -> returns trace_blob_id + items_hash
pnpm tsx scripts/verify-trace.ts --blob <traceBlobId> --items-hash <hex>
#   -> MATCH exit 0
```

**Phase 2.7 — full local pipeline**:
```bash
pnpm tsx scripts/evaluate-and-post.ts --enclave http://127.0.0.1:3931 \
  --endpoint <openai-compatible-url> --model <name> --allow-plaintext-items
#   -> score, trace on Walrus, items_hash verified, post_score args printed
```

For Anthropic, use `--provider anthropic --model <claude-model>` with
`ANTHROPIC_API_KEY`.

**Phase 2.8 — sealed (production) pipeline** — once an `Enclave` object is
registered (G2):
```bash
pnpm tsx scripts/evaluate-and-post.ts --sealed --enclave-object <id> \
  --enclave http://127.0.0.1:3931 --endpoint <modelUrl> --model <name> [--execute]
#   -> the enclave fetches the ciphertext from Walrus, fetches Seal keys gated
#      by seal_policy::seal_approve, decrypts in memory, scores, signs
```
`--execute` requires `--sealed`; the plaintext pipeline stays local-only behind
`--allow-plaintext-items`.

## Proven vs gated

**Proven (real infra, gate-free):** Move publish + SealedEval + Walrus
ciphertext + provenance; Seal encryption against live testnet key servers; the
local enclave scores an explicitly supplied plaintext set after verifying it
matches the sealed plaintext hash, archives the trace to Walrus, and signs a
ScorePayload that verifies on-chain; the leaderboard reads real chain events.

**Proven offline (real crypto, vector-verified):** the in-enclave Seal client —
ElGamal keygen, session certificate signing, seal_approve PTB construction,
threshold key verification, and full EncryptedObject decryption — byte-matches
the TS SDKs the repo seals with (`fixtures/seal-vectors.json`).

**Gated (needs external resources):**
- Real model scores → `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (or any
  OpenAI-compatible endpoint). Native Anthropic Messages API + prompt caching is
  implemented, but not exercised without a key.
- On-chain `AttestedScore` → a registered `Enclave` object. The package,
  `SEALEDBENCH` witness, enclave Cap, registration script, pk assertion script,
  and post_score argument builder are built; registration still needs a real AWS
  Nitro attestation document from the enclave EIF.
- Live Seal key release → the key servers dry-run `seal_approve` against the
  registered enclave object, so exercising `--sealed` end-to-end on testnet
  waits on that same registration.

Run `pnpm preflight:gates` to check the exact missing external inputs on the
current machine.

## Precise claims (do not conflate)

- **The seal proves** a specific ciphertext (by SHA-256) was on-chain before a
  stated cutoff and never released in plaintext. It does not prove the content is
  a good benchmark, nor that the author kept no private copy.
- **The TEE proves** the score came from the exact attested code, on the exact
  decrypted set, against the exact endpoint, with no cherry-picking. It does not
  prove the endpoint served the same weights as a public model release.
