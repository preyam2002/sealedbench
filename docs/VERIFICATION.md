# SealedBench — verification ledger

Everything here is real and reproducible. No mocks: on-chain ids resolve on a Sui
explorer, Walrus blobs resolve on the aggregator, and signatures verify across
Rust, TypeScript, and Move.

## Real testnet artifacts

| Artifact | Id |
|---|---|
| Move package | `0x40cdf0833159ce9f688d33fa17c4b6256042c9babbc807e8600bd3c7f0fa0448` |
| UpgradeCap | `0xe66a1016dd39d67ff79ac43f123cd08d90e132402c9862702a36a4397fc876c3` |
| SealedEval (seed v1) | `0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945` |
| Create tx | `BFiJG7kTRUX3LDaYbm8gdCnxyUjHcm3EBec1rRuAtywV` |
| Walrus ciphertext blob | `w2_IDO4XednvPnNTI9P9s_WmCB5qhSfAazMLInNEPEI` |
| sha256(plaintext) | `45da3c9554f9dfbf128e2de6416beb6b99703b718495041354669f899545701f` |

## Test matrix (46 tests, 3 languages)

```bash
pnpm test                       # 19 vitest (web 9, shared 4, walrus 3, seal 3)
pnpm move:test                  # 9  sui move tests
cd enclave && cargo test        # 18 cargo tests
```

`SEALEDBENCH_SKIP_NETWORK=1 pnpm test` skips the live-testnet round-trips for
offline/CI determinism.

## Reproduce each guarantee

**Phase 1 — seal-before-cutoff provenance**
```bash
pnpm tsx scripts/verify-provenance.ts 0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945
#   -> ciphertext integrity MATCH, exit 0
pnpm tsx scripts/verify-provenance.ts 0x7593... --tamper-test
#   -> MISMATCH, exit 1
```

**Cross-language attestation interop** — the Rust enclave produces the exact
signature the Move contract verifies (fixed-seed vector):
- `enclave/src/signing.rs::tests` asserts pk + score + seal signatures.
- `move/sealedbench/tests` + `seal_policy` verify the same bytes on-chain.
- regenerate: `pnpm tsx tools/gen-attestation-vectors.ts`.

**Phase 2.6 — run trace committed on Walrus** (no Nitro/keys):
```bash
cd enclave && ENCLAVE_ADDR=127.0.0.1:3931 cargo run --bin sealedbench-enclave-server &
# POST /evaluate with walrus_publisher_url -> returns trace_blob_id + items_hash
pnpm tsx scripts/verify-trace.ts --blob <traceBlobId> --items-hash <hex>
#   -> MATCH exit 0
```

**Phase 2.7 — full local pipeline**:
```bash
pnpm tsx scripts/evaluate-and-post.ts --sealed-eval 0x7593... \
  --enclave http://127.0.0.1:3931 --endpoint <openai-compatible-url> --model <name>
#   -> score, trace on Walrus, items_hash verified, post_score args printed
```

## Proven vs gated

**Proven (real infra, gate-free):** Move publish + SealedEval + Walrus
ciphertext + provenance; Seal encryption against live testnet key servers; the
enclave scores, archives the trace to Walrus, and signs a ScorePayload that
verifies on-chain; the leaderboard reads real chain events.

**Gated (needs external resources):**
- Real model scores → `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (or any
  OpenAI-compatible endpoint).
- In-enclave Seal decrypt → live key-server session against the registered enclave.
- On-chain `AttestedScore` → a registered `Enclave` object, which requires a real
  AWS Nitro attestation document. Once registered, `evaluate-and-post.ts` submits
  `post_score` and the leaderboard shows the score automatically.

## Precise claims (do not conflate)

- **The seal proves** a specific ciphertext (by SHA-256) was on-chain before a
  stated cutoff and never released in plaintext. It does not prove the content is
  a good benchmark, nor that the author kept no private copy.
- **The TEE proves** the score came from the exact attested code, on the exact
  decrypted set, against the exact endpoint, with no cherry-picking. It does not
  prove the endpoint served the same weights as a public model release.
