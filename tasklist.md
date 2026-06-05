# SealedBench — tasklist / resume anchor

**Status (2026-06-05):** entire *gate-free* spine BUILT & VERIFIED on real infra.
12 commits, 46 tests green (19 vitest · 9 Move · 18 cargo). Submittable as a
Walrus-track entry today. The only remaining work needs external resources
(model API key, AWS Nitro, live Seal key-server session) — see **GATED** below.

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
pnpm move:test                            # 9/9
(cd enclave && cargo test)                # 18/18
pnpm tsx scripts/verify-provenance.ts 0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945
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
      `seal_policy` + vendored `enclave`. `sui move test` 9/9 (real ed25519 vectors).
- [x] `scripts/seal-and-notarize.ts` → real SealedEval on-chain;
      `scripts/verify-provenance.ts` (exit 0 / tamper exit 1).
- [x] `enclave/` Rust: lib + runnable axum server (`/health_check`,
      `/get_attestation`, `/evaluate`). Sigs byte-match Move vectors. `cargo test` 18/18.
- [x] Phase 2.6 trace→Walrus + `items_hash` commitment (verified on real Walrus);
      `scripts/verify-trace.ts`.
- [x] Phase 2.7 `scripts/evaluate-and-post.ts` (local pipeline verified).
- [x] `apps/web` Next.js 16 leaderboard (reads real chain events). `next build` clean.
- [x] CI (node/rust/move), `docs/VERIFICATION.md`, `docs/demo-script.md`.

---

## GATED — remaining work + exact unblock

### G1. Real model scoring  — needs `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (or OpenAI-compat URL)
- The enclave `/evaluate` already calls any OpenAI-compatible endpoint
  (`enclave/src/http_model.rs`). Just pass real `--endpoint/--model/--api-key`.
- Optional: native Anthropic Messages API + `cache_control` prompt caching
  (standing pref) — currently OpenAI-compat only; add an Anthropic path in
  `http_model.rs` if targeting Claude directly. Test: parsing unit tests there.

### G2. On-chain AttestedScore  — needs an AWS **Nitro** box (Aegis one reusable)
- Vendor + retarget `~/repo/aegis-wallet/scripts/register-nautilus-enclave.ts`
  → `scripts/register-nautilus-enclave.ts`. Needs the enclave EIF + a real
  Nitro attestation doc (`make build-enclave` on the Nitro box, reuse Aegis
  Makefile/Dockerfile patterns).
- Define the package OTW + an `init` that mints the enclave `Cap` (so
  `Enclave<OTW>` has a concrete `T`); wire `post_score`'s type arg.
- Then `scripts/evaluate-and-post.ts` submits `post_score` (add `--execute`):
  PTB = `attested_score::post_score(enclave, sealedEval, num, den, items_hash,
  trace_blob_id, ts, sig, clock)`. The arg values are already printed by the script.
- Add `scripts/assert-enclave-pk.ts` (fetch `Enclave`, assert pk == /get_attestation).
- Result: a real `AttestedScore` → leaderboard shows it automatically (no UI change).

### G3. In-enclave Seal decrypt  — needs live key-server session vs the registered enclave
- Add `enclave/src/seal_client.rs`: ElGamal keypair + Seal `FetchKey` + in-enclave
  decrypt. Replaces the current "request carries decrypted `items_jsonl`" seam in
  `/evaluate`. Depends on G2 (registered enclave for `seal_approve`).
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
| Package | `0x40cdf0833159ce9f688d33fa17c4b6256042c9babbc807e8600bd3c7f0fa0448` |
| UpgradeCap | `0xe66a1016dd39d67ff79ac43f123cd08d90e132402c9862702a36a4397fc876c3` |
| SealedEval | `0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945` |
| Walrus ciphertext | `w2_IDO4XednvPnNTI9P9s_WmCB5qhSfAazMLInNEPEI` |
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
