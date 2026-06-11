# SealedBench — tasklist / resume anchor

**Status (2026-06-11):** entire *gate-free* spine BUILT & VERIFIED on real
infra, **including G3 (in-enclave Seal decrypt)** — 92 tests green (48 vitest ·
10 Move · 34 cargo), fresh five-module testnet package, matching seed
`SealedEval`, and a Rust Seal client byte-matched against @mysten/seal via
cross-language vectors. Submittable as a Walrus-track entry today. The ONLY
remaining blockers are external: a model API key (G1) and an AWS Nitro box
(G2); the live `--sealed` round-trip waits on G2's registered enclave.

> Resume rule (this user's standing feedback): **verify before claiming done.**
> Run the "confirm current state" block first. Commit after each atomic task.
> Past Codex pattern here: great work left uncommitted / "done" claimed while
> uncommitted or unverified — always `git log` + re-run the checks + resolve
> on-chain ids before trusting status.

---

## Confirm current state (run first, ~1 min)

```bash
cd ~/repo/sealedbench
pnpm install --no-frozen-lockfile
SEALEDBENCH_SKIP_NETWORK=1 pnpm test     # offline: 44 pass, walrus/seal net-tests skip
pnpm move:test                            # 10/10
(cd enclave && cargo test)                # 34/34 (incl. seal_client cross-lang vectors)
pnpm tsx scripts/verify-provenance.ts     # defaults to recorded seedSealedEvalId
pnpm preflight:gates                      # expect blockers: model_api_key, nitro_pcrs, nitro_attestation
git log --oneline | head -12              # expect feat(G3) commits on top of 27c9572 … c3a8155
```
Full live round-trips (real testnet) run with `pnpm test` (no skip env).

---

## DONE — built & verified, gate-free

- [x] Phase 0 scaffold + 50-item seed `fixtures/heldout/sealedbench-v1.jsonl`.
- [x] `packages/walrus` — real testnet PUT/GET round-trip.
- [x] `packages/seal` — real Seal encryption vs live testnet key servers + offline
      backup-key round-trip.
- [x] Move pkg published to testnet; `sealed_eval` + `attested_score` +
      `seal_policy` + `attestation` + vendored `enclave`. `sui move test` 10/10
      (real ed25519 vectors).
- [x] `scripts/seal-and-notarize.ts` → real SealedEval on-chain;
      `scripts/verify-provenance.ts` (exit 0 / tamper exit 1).
- [x] `enclave/` Rust: lib + runnable axum server (`/health_check`,
      `/get_attestation`, `/evaluate`). Sigs byte-match Move vectors. `cargo test` 24/24.
- [x] Phase 2.6 trace→Walrus + `items_hash` commitment (verified on real Walrus);
      `scripts/verify-trace.ts`.
- [x] Phase 2.7 `scripts/evaluate-and-post.ts` local plaintext pipeline
      verified; it now verifies the supplied set hash against the on-chain
      `SealedEval` and refuses `--execute` until in-enclave Seal decrypt lands.
- [x] `apps/web` Next.js 16 leaderboard (reads real chain events). `next build` clean.
- [x] CI (node/rust/move), `docs/VERIFICATION.md`, `docs/demo-script.md`.
- [x] **G3 implementation** — `enclave/src/seal_client.rs`: full Seal fetch_key
      client (ElGamal, session cert, seal_approve PTB BCS, threshold key fetch +
      verification) + `seal_decrypt` via the canonical MystenLabs/seal crypto
      crate (pinned rev). `/evaluate` takes `sealed_items`; plaintext seam stays
      gated behind `--allow-plaintext-items`. Byte-matched against
      @mysten/seal 1.1.3 via `fixtures/seal-vectors.json`
      (`tools/gen-seal-vectors.ts`). `evaluate-and-post --sealed` wires it
      end-to-end; `--execute` now requires `--sealed`.
- [x] `pnpm demo` runner (artifacts table → live verify-provenance →
      verify-trace once an AttestedScore exists).

---

## GATED — remaining work + exact unblock

### G1. Real model scoring  — needs `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (or OpenAI-compat URL)
- The enclave `/evaluate` supports OpenAI-compatible endpoints and native
  Anthropic Messages API with `cache_control` prompt caching.
- Test with a running enclave:
  `pnpm tsx scripts/evaluate-and-post.ts --allow-plaintext-items --provider anthropic --model <claude-model> --endpoint https://api.anthropic.com`.
- `pnpm preflight:gates` reports this as `model_api_key` until a model API
  credential or compatible endpoint is configured.

### G2. On-chain AttestedScore  — needs an AWS **Nitro** box (Aegis one reusable)
- Done locally: full package published, `attestation::SEALEDBENCH` OTW exists,
  `attestation::init` minted the enclave Cap, and deployment records
  `enclaveCapId`.
- Done locally: `scripts/register-nautilus-enclave.ts`,
  `scripts/assert-enclave-pk.ts`, and post_score argument construction.
- Remaining: build the enclave EIF on Nitro, produce real PCRs + attestation doc,
  then run `pnpm register:enclave --attestation-path <doc.json>`.
- After registration: `pnpm assert:enclave --enclave-object <id>`, then the full
  production run is `evaluate-and-post --sealed --enclave-object <id> --execute`
  (G3 is implemented; this is the first live exercise of it).
- `pnpm preflight:gates` reports these as `nitro_pcrs` and
  `nitro_attestation` until the Nitro outputs exist.
- Result: a real `AttestedScore` → leaderboard shows it automatically (no UI change).

### G3. In-enclave Seal decrypt — IMPLEMENTED; live round-trip waits on G2
- DONE: `enclave/src/seal_client.rs` (see DONE section). The protocol + crypto
  are byte-verified offline against @mysten/seal; what remains is exercising
  the live key-server `fetch_key` once G2 registers the enclave (the servers
  dry-run `seal_approve` against the on-chain `Enclave` object).
- After G2: `pnpm tsx scripts/evaluate-and-post.ts --sealed
  --enclave-object <id> [--execute]`.

### Phase 4 (after gates)
- [ ] Mainnet cutover (needs mainnet gas; fill `SEAL_KEY_SERVERS.mainnet` in
      `packages/seal/src/config.ts` from seal-docs Pricing page).
- [ ] The two-model "contamination collapse" demo (one clean open model w/ public
      checkpoint before seal + one post-cutoff model). Record ≤4-min video.
- [ ] DeepSurge submission (Walrus track) — confirm deadline (June 21) + whether
      two distinct projects allowed (Predict Studio is the other entry).

---

## Real artifacts (testnet)

| | |
|---|---|
| Package | `0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f` |
| UpgradeCap | `0x7dc07b18cee10a051b23192bed99e31b333878ab0b7af3cc3417eac25100cb8c` |
| EnclaveCap | `0x147c132bad4b40574e6717126309bd6e32d8f42b780c1dc925948876648a6017` |
| SealedEval | `0x758aab4a1ecbb5dab258af6a42a9208562038df125df0fd667572c06e62a77c6` |
| Walrus ciphertext | `T8KX29uMz18IWrYxgTAm9sfFrIgBCIJg5KDhG_6MLNQ` |
| Active signer addr | `0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a` (~68 testnet SUI) |

## Gotchas
- Official Sui testnet fullnode hard-429s; default RPC = publicnode + retry
  transport. Override `SUI_FULLNODE_URL`.
- `@mysten/seal@1.1.3` peers `@mysten/sui@^2.16`; sui 2.x client =
  `SuiJsonRpcClient`/`getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc`.
- `seal.encrypt` requires `packageId` to be a real on-chain package.
- Enclave NSM is Linux-only (cfg-gated); off-Linux = local-unattested mode.
- Attestation test vectors are fixed-seed: `tools/gen-attestation-vectors.ts`.
- Reuses Aegis enclave infra (`~/repo/aegis-wallet/enclave`, Path A AWS box).
