# SealedBench — BUILD_PLAN.md

Codex-executable, end-to-end build plan. Every task has an **Acceptance Criterion (AC)** and an **exact verification command**. Build phases in order; do not start a phase until the prior phase's DoD is green. Target chain: **Sui mainnet** (testnet for dev/CI). Deadline: **2026-06-21 PT**.

> Conventions for the executing agent (Codex):
> - Absolute repo root: `~/repo/sealedbench`. All paths below are relative to it unless prefixed `~/`.
> - Package manager: **pnpm**. Lint/format: **Biome**. Tests: **Vitest** (TS), `sui move test` (Move), `cargo test` (Rust), `pytest` (Python).
> - Never commit secrets. `.env.local` is gitignored; provide `.env.example`.
> - Reuse, don't rewrite: the Nautilus enclave + Move attestation module + register script come from `~/repo/aegis-wallet` (read paths are listed in §2 and §5-Phase2). Copy them in and adapt; do not re-derive attestation from scratch.
> - Commit per atomic task with a conventional-commit message. Branch `main`; feature branches optional.

---

## 1. Objective, spine, and the one killer demo

### Objective
Ship a Sui-mainnet dapp that issues **provably-uncontaminated and provably-honestly-scored** AI benchmark results. A benchmark author seals a held-out test set (Seal) to Walrus and notarizes it on-chain *before* a model's training cutoff; an **attested Nautilus enclave** is the only party Seal will release the key to, and it decrypts → runs the model → posts a signed honest score on-chain with the run trace on Walrus; a Next.js leaderboard ranks models on clean, honestly-scored benchmarks.

### The spine (the one critical path — build this end-to-end before anything else)
```
author CLI/UI
  → Seal-encrypt held-out test set (policy gated to enclave pubkey)
  → PUT ciphertext to Walrus  → blobId
  → create SealedEval Move object on Sui { sha256(plaintext), sha256(ciphertext), walrus_blob_id, cutoff_ts_ms, seal_policy_id, model_target }
                                  ───────────────── PHASE 1 ENDS HERE (submittable) ─────────────────
  → registered Nautilus enclave: Seal `seal_approve` releases key ONLY to attested enclave pubkey
  → enclave decrypts in-memory → runs model via OpenAI-compatible endpoint → scores
  → enclave posts AttestedScore on Sui (ed25519-signed by enclave key, verified on-chain via the Aegis enclave module)
  → run trace (prompts+responses+grades) PUT to Walrus  → trace_blobId on the score object
                                  ───────────────── PHASE 2 ENDS HERE (the moat) ─────────────────
  → Next.js leaderboard reads SealedEval + AttestedScore objects, renders provenance + attestation badges
```

### The one killer demo (this is the submission's money shot)
Two models, one sealed benchmark, side by side:
- **Model A (contaminated):** training cutoff *after* the benchmark's public release. Public self-reported score: high.
- **Model B (clean):** an **open model with a publicly-dated checkpoint** whose cutoff is *before* SealedBench sealed the held-out twin. Provably could not have memorized it.

Run both through the attested enclave on the sealed set. **Demo assertion:** Model A's score on the sealed twin **collapses** relative to its public number; Model B's holds. Each leaderboard row links the Sui `SealedEval` (seal-before-cutoff timestamp), the Walrus `trace_blobId`, and the enclave attestation. The audience watches contamination get caught **and** verifies the catch was honest.

> The demo only needs ONE self-authored sealed set + the two models to be compelling. Everything else is breadth.

---

## 2. Verify-first unknowns (resolve BEFORE writing dependent code)

Each unknown has a **probe** and a **pass condition**. Capture outputs into `docs/verify/` as `.json`/`.md` so later tasks can cite real values. **Do not proceed to the phase that depends on an unknown until its probe passes.**

| # | Unknown | Probe (exact) | Pass condition |
|---|---------|---------------|----------------|
| V1 | **Seal → attested-enclave key release pattern.** Does Seal release the key only to the enclave, and what does `seal_approve` check? | Read `https://docs.sui.io/sui-stack/nautilus/seal`. Confirmed pattern (already verified for this plan): the enclave generates an **ElGamal key pair locally**; Seal key servers return key shares **encrypted under the enclave's encryption public key** so only the enclave can decrypt the `FetchKeyRequest` response; the Move **`seal_approve`** function verifies a signature made by the **enclave ephemeral key** (`enclave.pk()`) over an intent message, and gates on the requester matching the registered enclave. Write `docs/verify/seal_nautilus_pattern.md` capturing the API names (`seal_approve`, `enclave.pk()`, `FetchKeyRequest`, ElGamal pubkey binding). | Doc written; our `seal_approve` design in §5-P2 maps 1:1 to it. |
| V2 | **Reuse Aegis enclave for a *compute* (not co-sign) workload.** The Aegis enclave is an Axum server that attests an ed25519 key and signs Sui tx bytes. Can it instead decrypt+score+sign a score? | Read `~/repo/aegis-wallet/enclave/src/{main.rs,attestation.rs,cosign.rs,sui_signature.rs,lib.rs}` and `~/repo/aegis-wallet/enclave/{Dockerfile,Makefile,Cargo.toml}`. Confirm: `/get_attestation` returns Nitro doc binding the ed25519 pubkey; `sui_signature.rs` produces a Sui-serialized ed25519 signature; Makefile builds an EIF via `nitro-cli` and emits PCR0-2. | Verified present. Plan: keep attestation+signing modules verbatim; **replace** the co-sign HTTP route with a `/evaluate` route (decrypt→run model→score→sign score payload). New deps: `seal` client calls, an OpenAI-compatible HTTP client (already have `reqwest`). |
| V3 | **Walrus publisher + aggregator URLs (testnet + mainnet) and store/read API.** | `curl -sS https://aggregator.walrus-testnet.walrus.space/v1/api | head` and same for publisher; for store: `curl -X PUT "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5" --data-binary @<file>` → expect JSON with `newlyCreated.blobObject.blobId` (or `alreadyCertified.blobId`); read back: `curl -sS https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId> -o out.bin`. | A real `blobId` round-trips (bytes read back equal bytes stored). Record URLs in `config/walrus.ts`. **Known-good (verify, don't assume):** testnet `https://{publisher,aggregator}.walrus-testnet.walrus.space`, mainnet `https://{publisher,aggregator}.walrus-mainnet.walrus.space`; `epochs` is **mandatory** (testnet epoch ≈ 1 day, mainnet ≈ 2 weeks). |
| V4 | **Seal policy `seal_approve` gating to an enclave pubkey.** Can the Seal access policy be keyed to the registered `Enclave` object's `pk`? | Implement minimal `sealed_eval::seal_approve` (see §5-P2) and unit-test the gate logic with `sui move test`. Cross-check call shape against `@mysten/seal` `SealClient.fetchKeys` / session-key flow from the Seal SDK README. | `sui move test` passes a test that approves for the enclave key and **aborts** for a non-enclave key. |
| V5 | **`@mysten/sui` + dapp-kit + Seal SDK version compatibility on mainnet.** | `pnpm add @mysten/sui@~2.17.0 @mysten/dapp-kit @mysten/seal` then `pnpm -F web build`. Hit a mainnet fullnode read (`SuiClient.getLatestSuiSystemState`). | Build succeeds; mainnet read returns. Pin exact resolved versions into the table in §3. |
| V6 | **Enclave can reach an OpenAI-compatible endpoint for an OPEN model with a public checkpoint date.** | From a local (non-enclave) run of the new `/evaluate` route, call the chosen provider's `/v1/chat/completions` for the clean open model and an Anthropic-hosted model (with **prompt caching** headers). | Both return a completion; latency/token counts logged. (Enclave egress is configured in Phase 2 ops.) |

> If V1 or V4 cannot be made to pass (Seal cannot gate to an enclave pubkey in time), **fall back** to: enclave fetches the key via a session key whose capability is an on-chain `Enclave`-owned object, OR (last resort) enclave holds a long-lived Seal-derived key provisioned at registration. Document whichever path is used; the *attested honest scoring* claim survives either way, only the *key-custody* mechanism changes.

---

## 3. Tech stack (pinned)

Pin exact versions after V5 resolves; these are the targets.

| Layer | Choice | Version (target) | Notes |
|------|--------|------------------|-------|
| Smart contracts | Sui Move | **edition 2024.beta** | `SealedEval`, `AttestedScore`, `seal_approve`; vendored `enclave` module from Aegis. |
| Sui SDK | `@mysten/sui` | **~2.17.0** | tx building, object reads. |
| Wallet UI | `@mysten/dapp-kit` + `@tanstack/react-query` | latest compatible w/ sui 2.17 | connect, sign `SealedEval` creation. |
| Encryption | `@mysten/seal` (Seal SDK) | latest | client-side encrypt; `seal_approve` policy; session keys. |
| Storage | Walrus HTTP API (publisher/aggregator) | mainnet endpoints | no SDK required for MVP; optional `@mysten/walrus` later. |
| TEE enclave | Rust + Axum + AWS Nitro (NSM) | reuse Aegis `Cargo.toml` (axum 0.7, ed25519-dalek 2, `aws-nitro-enclaves-nsm-api` 0.4, reqwest 0.12) | **reused from `~/repo/aegis-wallet/enclave`**, co-sign route swapped for `/evaluate`. |
| Enclave build | Docker + `nitro-cli` | per Aegis `Makefile` | `make build-enclave` → EIF + PCR0-2 JSON. |
| Frontend | Next.js + React | **Next.js 16**, **React 19** | App Router. |
| Styling | Tailwind | **v4** | matches user default + TOLDPROOF parity. |
| Lint/format | **Biome** | latest | `biome check`. |
| Tests | Vitest (TS), `sui move test`, `cargo test`, pytest | latest | one CI workflow runs all. |
| Evaluator client | **Python 3.12** | — | drives seal→evaluate→post flow; pytest-covered. |
| Model runners | **Anthropic SDK** + **OpenAI SDK** | latest | **Anthropic calls MUST use prompt caching** (`cache_control: {type: "ephemeral"}` on the static system + benchmark-instructions blocks) — standing user preference. |
| Monorepo | pnpm workspaces | — | `packages/*`, `apps/web`, `enclave`, `move`, `evaluator`. |

---

## 4. Repo / file layout

```
~/repo/sealedbench/
├─ README.md
├─ BUILD_PLAN.md
├─ pnpm-workspace.yaml
├─ package.json                      # root scripts: test, lint, build, demo
├─ biome.json
├─ .env.example                      # SUI_*, WALRUS_*, SEAL_*, ANTHROPIC_API_KEY, OPENAI_API_KEY, model targets
├─ .github/workflows/ci.yml          # move test + vitest + cargo test + pytest + biome
├─ move/
│  ├─ sealedbench/                    # OUR package
│  │  ├─ Move.toml
│  │  └─ sources/
│  │     ├─ sealed_eval.move          # SealedEval object + events
│  │     ├─ attested_score.move       # AttestedScore object; verifies enclave ed25519 sig
│  │     └─ seal_policy.move          # seal_approve gating to registered Enclave pk
│  └─ enclave/                        # VENDORED from ~/repo/aegis-wallet/move/enclave (Mysten enclave module)
│     ├─ Move.toml
│     └─ sources/enclave.move
├─ enclave/                           # VENDORED + adapted from ~/repo/aegis-wallet/enclave
│  ├─ Cargo.toml  Cargo.lock  Dockerfile  Makefile
│  └─ src/
│     ├─ main.rs                      # Axum: /health_check, /get_attestation (kept), /evaluate (NEW, replaces /co_sign)
│     ├─ attestation.rs               # KEPT verbatim (Nitro NSM doc binds ed25519 pubkey)
│     ├─ sui_signature.rs             # KEPT (Sui-serialized ed25519 signature)
│     ├─ evaluate.rs                  # NEW: decrypt(Seal) → run model → grade → build signed ScorePayload
│     ├─ seal_client.rs               # NEW: ElGamal keypair + Seal FetchKey + decrypt in-enclave
│     └─ model_client.rs              # NEW: OpenAI-compatible /v1/chat/completions caller
├─ packages/
│  ├─ shared/                         # TS: types (SealedEval, AttestedScore), sui client factory, config
│  ├─ seal/                           # TS: encrypt held-out set, build policy, session-key helpers
│  └─ walrus/                         # TS: PUT/GET blob helpers (publisher/aggregator)
├─ evaluator/                         # Python: orchestrates seal→register→evaluate→post; pytest
│  ├─ pyproject.toml
│  ├─ sealedbench_eval/{seal_set.py, run_flow.py, grade.py, post_score.py}
│  └─ tests/
├─ apps/web/                          # Next.js 16 leaderboard
│  ├─ app/{page.tsx, eval/[id]/page.tsx, submit/page.tsx}
│  ├─ components/{Leaderboard.tsx, ProvenanceBadge.tsx, AttestationBadge.tsx}
│  └─ lib/{queries.ts, format.ts}
├─ scripts/
│  ├─ register-nautilus-enclave.ts    # VENDORED + retargeted from ~/repo/aegis-wallet/scripts/register-nautilus-enclave.ts
│  ├─ seal-and-notarize.ts            # Phase 1 e2e: encrypt → Walrus → create SealedEval
│  ├─ evaluate-and-post.ts            # Phase 2 e2e: trigger enclave → post AttestedScore
│  └─ demo.ts                         # the timed two-model demo
├─ fixtures/
│  └─ heldout/sealedbench-v1.jsonl    # ONE self-authored held-out set (the cold-start seed)
└─ docs/
   ├─ verify/                         # V1..V6 captured outputs
   └─ demo-script.md
```

---

## 5. Phased atomic tasks (MVP-first)

> Format per task: **AC** = acceptance criterion, **VERIFY** = exact command(s) that must succeed.

### Phase 0 — Scaffolding (½ day)

**0.1 Init monorepo.** Create pnpm workspace, root `package.json` scripts (`test`, `lint`, `build`, `demo`), `biome.json`, `.env.example`, `.gitignore`, CI workflow stub.
- **AC:** `pnpm install` clean; `pnpm biome check` runs (may report 0 files).
- **VERIFY:** `pnpm install && pnpm biome check .`

**0.2 Author the held-out seed set.** Hand-write `fixtures/heldout/sealedbench-v1.jsonl` — ≥50 original Q/A items (each `{id, question, answer, rubric}`) never published online. This is the cold-start asset that makes "couldn't have trained on it" literally true.
- **AC:** ≥50 lines, valid JSONL, each has the 4 keys; a `tools/validate_set.ts` check passes.
- **VERIFY:** `pnpm tsx tools/validate_set.ts fixtures/heldout/sealedbench-v1.jsonl`

**0.3 Resolve V3 + V5 + V6** (from §2) and commit `docs/verify/*`.
- **AC:** Walrus round-trip blobId recorded; sui 2.17 mainnet read succeeds; both model endpoints return a completion.
- **VERIFY:** `pnpm tsx scripts/probe-walrus.ts && pnpm tsx scripts/probe-sui.ts && python -m pytest evaluator/tests/test_model_probe.py`

---

### Phase 1 — Submittable core (no TEE) — *this alone is a Walrus-track submission*

**1.1 `SealedEval` Move object + events.** Fields: `author: address`, `sha256_plaintext: vector<u8>`, `sha256_ciphertext: vector<u8>`, `walrus_blob_id: String`, `cutoff_ts_ms: u64` (the target model's stated training cutoff), `sealed_at_ms: u64` (from `Clock`), `seal_policy_id: ID`, `model_target: String`, `set_size: u64`, `revealed: bool`. Constructor is an `entry fun create(...)` that stamps `sealed_at_ms` from `&Clock` and emits `SealedEvalCreated`. Include a `reveal(...)` entry that records the plaintext blob id post-eval (optional public reveal).
- **AC:** Object created on-chain with `sealed_at_ms < now` and all hashes 32 bytes; event emitted. `cutoff_ts_ms` is author-supplied and stored immutably.
- **VERIFY:** `sui move test` (unit tests assert hash length, event emission, `sealed_at_ms` set from clock) **and** `pnpm tsx scripts/seal-and-notarize.ts --dry-run` builds the PTB.

**1.2 `packages/seal` — encrypt held-out set.** Client-side: load the JSONL, compute `sha256(plaintext)`, Seal-encrypt under a policy that will (Phase 2) gate to the enclave key; for Phase 1 the policy is a placeholder time-lock + author key. Return `{ ciphertext, sha256_plaintext, sha256_ciphertext, policyId }`.
- **AC:** `decrypt(encrypt(x)) == x` in a Vitest round-trip using the author key; `sha256_plaintext` matches a `shasum -a 256` of the raw file.
- **VERIFY:** `pnpm -F seal test`

**1.3 `packages/walrus` — store/read blob.** `putBlob(bytes, epochs)` → `blobId`; `getBlob(blobId)` → bytes. Endpoints from `config` (V3), mandatory `epochs`.
- **AC:** Ciphertext PUT returns a `blobId`; GET returns byte-identical ciphertext.
- **VERIFY:** `pnpm -F walrus test` (round-trips against testnet aggregator)

**1.4 `scripts/seal-and-notarize.ts` — Phase-1 e2e.** Wire 1.2 → 1.3 → 1.1: encrypt the seed set → PUT ciphertext to Walrus → `create` the `SealedEval` on Sui with both hashes, the real `blobId`, the author-supplied `cutoff_ts_ms`, and `model_target`.
- **AC:** Prints a real **Sui object id + tx digest + Walrus blob id**; re-reading the object shows `sealed_at_ms` strictly less than `cutoff_ts_ms`-as-future-eval is NOT required, but `sealed_at_ms < now` and the stored `cutoff_ts_ms` round-trip. The ciphertext at `blobId` hashes to the stored `sha256_ciphertext`.
- **VERIFY:** `pnpm tsx scripts/seal-and-notarize.ts --network testnet --set fixtures/heldout/sealedbench-v1.jsonl` then `pnpm tsx scripts/verify-provenance.ts <objectId>` (re-fetches object, re-downloads blob, recomputes both SHA-256, asserts equal, prints `sealed_at_ms` vs `cutoff_ts_ms`).

**1.5 Seal-before-cutoff provenance demo (no TEE).** A script/CLI that, given a `SealedEval` object id, prints the human-readable proof: *"Test set `<sha256>` was sealed on-chain at `<sealed_at_ms>` (tx `<digest>`), which is before model `<model_target>`'s stated cutoff `<cutoff_ts_ms>`. Ciphertext on Walrus `<blobId>` verified to match."*
- **AC:** Output is correct against the real object from 1.4; tampering the blob makes `verify-provenance` fail loudly.
- **VERIFY:** `pnpm tsx scripts/verify-provenance.ts <objectId>` exits 0; a mutated-byte variant exits non-zero.

**Phase 1 DoD:** A real `SealedEval` exists on testnet (and the same flow runs on mainnet), backed by a real Walrus ciphertext, with verifiable seal-before-cutoff provenance and passing Move + TS tests. **This is submittable.**

---

### Phase 2 — The differentiator: Nautilus-attested evaluator (the moat)

**2.1 Vendor the Aegis enclave + Move attestation module + register script.** Copy `~/repo/aegis-wallet/enclave/*` → `enclave/`, `~/repo/aegis-wallet/move/enclave/*` → `move/enclave/`, `~/repo/aegis-wallet/scripts/register-nautilus-enclave.ts` → `scripts/`. Keep `attestation.rs`, `sui_signature.rs`, the Makefile/Dockerfile, and the Mysten `enclave::enclave` Move module (`EnclaveConfig`/`Enclave`/`register_enclave`/`verify_signature`/`pk`) **verbatim**.
- **AC:** `cargo test` and `sui move test` pass on the vendored, unmodified modules.
- **VERIFY:** `cd enclave && cargo test` **and** `sui move test --path move/enclave`

**2.2 New enclave route `/evaluate` (replaces `/co_sign`).** In `enclave/src/`: add `seal_client.rs` (generate ElGamal keypair locally; build `FetchKeyRequest`; receive key share encrypted under the enclave ElGamal pubkey; decrypt the Seal-wrapped symmetric key; AES-decrypt the test set **in-memory only**), `model_client.rs` (OpenAI-compatible `/v1/chat/completions`), `evaluate.rs` (for each item: prompt model → grade against rubric → tally). The route returns a **ScorePayload** `{ sealed_eval_id, model_target, score_num, score_den, items_hash, trace_blob_id }` **signed by the enclave ed25519 key** via the kept `sui_signature.rs`. The decrypted plaintext **never leaves the enclave** and is never logged.
- **AC:** Local (non-Nitro) run: `POST /evaluate` with a Seal-encrypted fixture returns a signed ScorePayload whose signature verifies against `/get_attestation`'s pubkey; grading is deterministic given a fixed seed/temperature=0; no plaintext appears in logs (assert via log capture).
- **VERIFY:** `cd enclave && cargo test evaluate` (unit: grade tally + payload signing + "no plaintext in logs" assertion) **and** `cd enclave && cargo run` + `curl -X POST localhost:3000/evaluate -d @fixtures/evaluate-req.json` returns a verifiable signature.

**2.3 `seal_policy.move::seal_approve` gating to the enclave key.** Implement `seal_approve(policy, enclave: &Enclave<T>, sig, intent_ts, ...)` mirroring the documented pattern (V1/V4): verify an ed25519 signature made by `enclave.pk()` over the intent message, and abort unless the caller is the registered enclave for the `SealedEval`'s `seal_policy_id`. Bind the policy to the `Enclave` object's `pk` at `SealedEval` creation (upgrade 1.2's placeholder policy).
- **AC:** `seal_approve` **succeeds** for a valid enclave-key signature and **aborts** (`EInvalidEnclave`) for any other key; a Vitest/integration check shows the Seal client can fetch the key only when presenting the enclave session.
- **VERIFY:** `sui move test` (positive + negative cases) **and** `pnpm tsx scripts/seal-fetch-asserts.ts` (enclave session fetches key; author session is rejected).

**2.4 `attested_score.move::AttestedScore` object + on-chain signature check.** `post_score(enclave: &Enclave<T>, sealed_eval: &SealedEval, score_num, score_den, items_hash, trace_blob_id, sig, ts)` calls `enclave::verify_signature(enclave, scope, ts, payload, sig)` (the Aegis module) and, only if true, creates an `AttestedScore { sealed_eval_id, model_target, score_num, score_den, items_hash, trace_blob_id, enclave_pk, posted_at_ms }` and emits `AttestedScorePosted`. Reject if the signing key isn't the registered enclave.
- **AC:** A score posted with the enclave's real signature creates the object; a forged/altered payload aborts on-chain.
- **VERIFY:** `sui move test` (verify-true path creates object; tampered-payload path aborts).

**2.5 Build + register the real enclave (mainnet).** Use the vendored Makefile: `make build-enclave` → EIF + `out/pcr-values.json`; run on an AWS Nitro instance; `GET /get_attestation` → attestation doc; run the retargeted `scripts/register-nautilus-enclave.ts` to `create_enclave_config` (PCR0-2) + `register_enclave` (Nitro doc → on-chain `Enclave` with the enclave pubkey).
- **AC:** An on-chain `Enclave<SEALEDBENCH>` object exists whose `pk` equals the enclave's `/get_attestation` pubkey and whose PCRs match `pcr-values.json`.
- **VERIFY:** `pnpm tsx scripts/register-nautilus-enclave.ts` prints `register_enclave` digest + config id; `pnpm tsx scripts/assert-enclave-pk.ts` fetches the `Enclave` object and asserts `pk == /get_attestation pubkey`.

**2.6 Run trace → Walrus.** The enclave (or the orchestrator, from the enclave's signed output) stores the full run trace (every prompt, every model response, every per-item grade, model+endpoint identifiers, timestamps) to Walrus; `trace_blob_id` is embedded in the signed ScorePayload so the trace is **committed to by the attestation**, not appended afterward.
- **AC:** `trace_blob_id` on the `AttestedScore` resolves on Walrus to a trace whose recomputed `items_hash` matches the on-chain `items_hash`.
- **VERIFY:** `pnpm tsx scripts/verify-trace.ts <attestedScoreId>` (downloads trace, recomputes `items_hash`, asserts equal to on-chain).

**2.7 `scripts/evaluate-and-post.ts` — Phase-2 e2e.** Given a `SealedEval` id: call the registered enclave `/evaluate` → receive signed ScorePayload + `trace_blob_id` → submit `post_score` PTB → assert `AttestedScore` created. The key is released by Seal **only** to the enclave (2.3).
- **AC:** End-to-end run yields a real `AttestedScore` object id + tx digest, with a verifiable enclave signature and a Walrus-resolvable trace; attempting the same key-fetch from a non-enclave identity fails.
- **VERIFY:** `pnpm tsx scripts/evaluate-and-post.ts --sealed-eval <id>` prints the `AttestedScore` id; `scripts/verify-trace.ts` and `scripts/assert-enclave-pk.ts` both pass.

**Phase 2 DoD (the moat):** Seal releases the decryption key *only* to the registered, attested enclave; the enclave decrypts in-memory, scores the model, and posts an on-chain `AttestedScore` whose signature verifies against the registered enclave key, with the run trace committed on Walrus. The honest-scoring claim is end-to-end real.

---

### Phase 3 — Leaderboard UI + multi-model + traces

**3.1 Next.js 16 leaderboard (`apps/web`).** App Router, Tailwind v4, dapp-kit connect. `Leaderboard.tsx` reads all `AttestedScore` + their `SealedEval` and ranks by score; each row shows model, benchmark, score, and two badges.
- **AC:** Leaderboard renders from real chain data (no mocks); `pnpm -F web build` clean.
- **VERIFY:** `pnpm -F web build && pnpm -F web test` (component test asserts a row renders from a fixture object matching the real schema).

**3.2 `ProvenanceBadge` + `AttestationBadge`.** Provenance badge: links the `SealedEval`, shows `sealed_at_ms` vs `cutoff_ts_ms` and "sealed before cutoff ✓/✗". Attestation badge: links the `Enclave` object + `trace_blob_id`, shows "attested honest run ✓" only when the on-chain signature check passed and PCRs match the published values.
- **AC:** Badges reflect truth: a `SealedEval` sealed *after* cutoff shows ✗; a score with a non-matching enclave pk shows "unverified".
- **VERIFY:** `pnpm -F web test` (both truth/false cases).

**3.3 Submit flow (`/submit`).** Authenticated UI to upload a held-out set, set `cutoff_ts_ms` + `model_target`, and run `seal-and-notarize` from the browser (Phase-1 path) + kick off evaluation (Phase-2 path) for an allowlisted model.
- **AC:** A set submitted via UI produces a `SealedEval` then an `AttestedScore` end-to-end.
- **VERIFY:** Playwright is **not** used (per project policy); instead `pnpm tsx scripts/submit-flow-headless.ts` exercises the same lib functions the page calls and asserts both objects are created.

**3.4 Multi-model.** Parameterize `evaluate-and-post` over a model list; evaluate ≥3 models against the seed set (incl. the clean open model and a post-cutoff model for the demo).
- **AC:** ≥3 `AttestedScore` objects for one `SealedEval`, distinct `model_target`s, all with verifiable traces.
- **VERIFY:** `pnpm tsx scripts/evaluate-and-post.ts --models models.json` then `scripts/verify-trace.ts` on each.

**Phase 3 DoD:** Public leaderboard ranks ≥3 models on the sealed set with live provenance + attestation badges, all backed by on-chain objects + Walrus traces.

---

### Phase 4 — Polish + demo + submission

**4.1 Mainnet cutover.** Run the full spine on **mainnet** (publish packages, register enclave, seal one set, evaluate two models). Record all mainnet ids in `docs/demo-script.md`.
- **AC:** A complete mainnet `SealedEval` + ≥2 mainnet `AttestedScore` exist and verify.
- **VERIFY:** `pnpm tsx scripts/verify-provenance.ts <mainnetSealedEval>` and `scripts/verify-trace.ts <mainnetAttestedScore>` both pass.

**4.2 Demo video + timed script (§6).** Record the two-model killer demo end-to-end.
- **AC:** ≤4-min video shows seal → attested evaluate → leaderboard with the contamination collapse; every on-chain id is real and resolvable.
- **VERIFY:** Manual check against §6 checklist; all ids resolve on a Sui explorer + Walrus aggregator.

**4.3 DeepSurge submission.** Submit on DeepSurge (Sui Overflow 2026 portal) with repo, video, live URL, and the precise claim language from README §"what is and isn't proven".
- **AC:** Submission accepted, Walrus track selected, mainnet ids included.
- **VERIFY:** Submission confirmation captured in `docs/`.

---

## 6. Timed demo script (≤4 min)

| t | Action | What the audience sees / the assertion |
|---|--------|----------------------------------------|
| 0:00 | One-line problem | "Benchmark scores are lies if the test leaked, and labs grade their own homework. We fix both." |
| 0:20 | Show the sealed set on-chain | `SealedEval` object on explorer: `sha256`, Walrus `blobId`, `sealed_at_ms`, `cutoff_ts_ms`. Run `verify-provenance.ts` live → "sealed before cutoff ✓", ciphertext hash matches. |
| 1:00 | Introduce two models | Model A (cutoff *after* public release, high public score) vs Model B (open, public checkpoint, cutoff *before* our seal). |
| 1:20 | Trigger attested eval | `evaluate-and-post.ts` → enclave fetches the Seal key (show Seal releases it **only** to the enclave), decrypts in-memory, scores. Print enclave attestation pubkey == registered `Enclave.pk`. |
| 2:20 | Post + verify | Two `AttestedScore` objects appear; on-chain signature check passed; `verify-trace.ts` confirms the Walrus run trace matches the on-chain `items_hash`. |
| 2:50 | The reveal | Leaderboard: **Model A's sealed-set score collapses** vs its public number (memorization exposed); Model B holds. Badges: provenance ✓ + attested-honest ✓. |
| 3:30 | The pitch | EU AI Act conformity (enforceable 2 Aug 2026, fines to 3% turnover); a number labs and regulators can verify. Distinct from TOLDPROOF (predictions, no TEE) and Walmarket (market oracle). |

Backup: pre-recorded run + cached objects in case of live RPC/enclave hiccup.

---

## 7. Risks & gotchas

**Prior art & exact differentiation (own this in the pitch).**
- **TOLDPROOF** (Sui Overflow 2026, Walrus track; Next.js 16 + Tailwind v4 + dapp-kit + Seal 2-of-3 + Walrus + `prediction_vault` Move module + off-chain AI judge): seals **natural-language predictions**, scored by a **trusted off-chain agent**, **no TEE**. Risk: same primitives, same track, polished. **Differentiation:** we seal **held-out benchmark test sets for model evaluation** (a different artifact), and our scoring is **attested in-enclave**, not a server you trust. Our novel pair = *seal-before-cutoff provenance* + *TEE-attested honest scoring* on **benchmarks**.
- **Walmarket** (Walrus Haulout 2025; Nautilus TEE + GPT-5 + evidence on Walrus): a **verifiable AI oracle for prediction-market resolution**. Risk: also uses Nautilus + Walrus for "verifiable AI". **Differentiation:** different artifact (sealed **exam** vs market), different claim (**uncontaminated + honest model eval** vs oracle truth), different buyer (AI labs / EU AI Act conformity vs market makers).
- One-liner for judges: *"TOLDPROOF proves you said it first; Walmarket proves a market resolved fairly; SealedBench proves a model couldn't have cheated on a benchmark and that nobody fudged the grading."*

**Two-sided cold-start.** No authors → no sealed sets; no models → no leaderboard. **Mitigation:** seed with the **one self-authored held-out set** (0.2) + evaluate **open models with publicly-dated checkpoints** so the contamination claim is literally true for ≥1 model on day one. Do not depend on third-party authors for the demo.

**Enclave ops.** Nitro builds are finicky; egress (to Seal key servers + the model endpoint) must be allowed from the enclave; PCRs change on any code/base-image change and must be re-registered. **Mitigation:** keep `attestation.rs`/`sui_signature.rs`/Makefile **unchanged** from Aegis (already proven to build + register); only the route logic is new. Pin the Docker base image. Re-run `register-nautilus-enclave.ts` after any enclave change. Have a `local-unattested` mode (Aegis already returns `mode: "local-unattested"` off-Linux) for fast dev, but the **submission demo must use the attested EIF**.

**Don't overclaim — be precise about seal vs TEE (this protects credibility with technical judges):**
- The **seal** proves a specific ciphertext (by SHA-256) was on-chain before the stated cutoff and never released in plaintext. It does **not** prove the author kept no private copy, nor that the content is a good benchmark.
- The **TEE** proves the posted score came from the exact attested code on the exact decrypted set against the exact endpoint, with no cherry-picking — i.e. the **run was honest**. It does **not** prove the endpoint served weights identical to a public model release (name this as out-of-scope: model-weight provenance is a separate problem).
- Say exactly this in the README and demo. Conflating the two is the fastest way to lose a sharp judge.

**Schedule risk (~17 days, from scratch, next to polished prior art).** Phase 1 is the floor (submittable without any TEE). If Phase 2 slips, you still ship a coherent Walrus-track entry. Treat Phase 2 as the *moat*, not the *MVP* — but it is the reason to win. Phases 3-4 are breadth/polish; cut multi-model before cutting attestation.

**Seal key-release fallbacks.** If `seal_approve`-to-enclave-pubkey can't be made to work in time (V1/V4), use the documented session-key / capability-object path or a registration-time provisioned key (see §2 fallback). The *attested honest scoring* claim survives any of these; only the key-custody mechanism changes — document which one shipped.

---

## 8. Definition of Done

**Phase 1 (submittable) — minimum to submit:**
- [ ] `SealedEval` Move package published; `sui move test` green.
- [ ] One **real** self-authored held-out set Seal-encrypted, ciphertext on **Walrus** (real `blobId`), `SealedEval` on **Sui** with both SHA-256 hashes, `cutoff_ts_ms`, `sealed_at_ms`, `model_target`.
- [ ] `verify-provenance.ts` passes on the real object; tampering fails it.
- [ ] `pnpm test` (Vitest) + `sui move test` green in CI.

**Phase 2 (the moat) — the differentiator is real:**
- [ ] Vendored Aegis enclave adapted: `/evaluate` decrypts in-enclave, runs the model, returns an ed25519-signed ScorePayload; `cargo test` green; no plaintext in logs.
- [ ] `seal_approve` releases the Seal key **only** to the registered `Enclave` pk (positive + negative `sui move test`).
- [ ] On-chain `Enclave<SEALEDBENCH>` registered (PCRs match; `pk == /get_attestation pubkey`).
- [ ] `AttestedScore` posted on-chain with on-chain signature verification; run trace on Walrus committed via `items_hash`.
- [ ] `evaluate-and-post.ts` runs the full attested path end-to-end and prints real ids.

**Phase 3-4 (win condition):**
- [ ] Next.js 16 leaderboard ranks ≥3 models on the sealed set with live provenance + attestation badges (no mocks).
- [ ] The **killer demo** runs: a post-cutoff model's score collapses on the sealed twin while a clean open model holds, and the attested run verifies.
- [ ] Full spine runs on **mainnet**; all ids resolve on explorer + Walrus.
- [ ] ≤4-min demo video + DeepSurge submission (Walrus track) with precise claim language.

**Overall DoD:** Mainnet, attested, no mocks, every claim backed by a resolvable on-chain id or Walrus blob, and the precise seal-vs-TEE language stated verbatim in README + demo.
