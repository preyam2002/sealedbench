# SealedBench — tasklist / resume anchor

**Status (2026-06-09):** entire *gate-free* spine BUILT & VERIFIED on real infra.
Current working tree has 79 tests green (45 vitest · 10 Move · 24 cargo), a
fresh five-module testnet package, and a matching seed `SealedEval`.
Submittable as a Walrus-track entry today. The remaining production moat needs
external resources plus the live in-enclave Seal decrypt path — see **GATED**
below.

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
SEALEDBENCH_SKIP_NETWORK=1 pnpm test     # offline: shared/web pass, walrus/seal net-tests skip
pnpm move:test                            # 10/10
(cd enclave && cargo test)                # 24/24
pnpm tsx scripts/verify-provenance.ts     # defaults to recorded seedSealedEvalId
git log --oneline | head -12              # expect d5808ba … f048e6a
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
- After registration: `pnpm assert:enclave --enclave-object <id>`, then finish
  G3 before enabling `evaluate-and-post --execute --enclave-object <id>`.
- `pnpm preflight:gates` reports these as `nitro_pcrs` and
  `nitro_attestation` until the Nitro outputs exist.
- Result: a real `AttestedScore` → leaderboard shows it automatically (no UI change).

### G3. In-enclave Seal decrypt  — needs live key-server session vs the registered enclave
- Add `enclave/src/seal_client.rs`: ElGamal keypair + Seal `FetchKey` + in-enclave
  decrypt. Replaces the current "request carries decrypted `items_jsonl`" seam in
  `/evaluate`. Depends on G2 (registered enclave for `seal_approve`).
- Until this lands, `pnpm preflight:gates` reports `in_enclave_seal_decrypt`,
  and `evaluate-and-post` requires `--allow-plaintext-items` and refuses
  `--execute`.
- Cross-check against `@mysten/seal` SessionKey flow; fallback options in
  BUILD_PLAN §2 (V1/V4) if `seal_approve`-to-enclave-pk can't be made to work.

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
