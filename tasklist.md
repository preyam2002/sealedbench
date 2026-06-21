# SealedBench — tasklist / resume anchor

**Status (2026-06-21):** the live proof surface now shows four real testnet
`SealedEval` objects in the frontend, verifies Walrus ciphertext hashes in the
browser, and has a server-side **Run in enclave** job path wired to the running
SealedBench Nitro enclave. Walrus uses max-duration testnet storage
(`WALRUS_EPOCHS=53`) and permanent blob mode. G3 (in-enclave Seal decrypt) is
implemented and live-exercised. The tiny OSS model path is pinned to
SmolLM2-135M Q2_K and baked into the SealedBench EIF on the shared Nitro host.

A real testnet run has been posted from the selected UI eval. Current proof:

- SealedEval:
  `0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222`
- Registered enclave:
  `0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e`
- AttestedScore:
  `0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff`
- Score: `27/50`, trace blob
  `hCunq9O1tUfbdZJi-4FKKHXlc4Zwncp0T66YLlZvcrk`, digest
  `FN3JW6Be3D871SSeT4QMkKKa47exGSnEVmVr9AtahRoy`

Current operational caveat: Aegis is temporarily paused while SealedBench owns
the full allocated Nitro CPU pool (`1,3`). Both cannot run on this shared host
at the same time without a larger/reconfigured allocator or a separate Nitro
instance.

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
(cd enclave && cargo test)                # 36/36 (incl. seal_client cross-lang vectors)
pnpm tsx scripts/verify-provenance.ts     # defaults to recorded seedSealedEvalId
pnpm assert:enclave --network testnet \
  --enclave-object 0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e \
  --enclave http://127.0.0.1:3321
pnpm tsx scripts/verify-trace.ts \
  0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff \
  --network testnet
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
      `/get_attestation`, `/evaluate`). Sigs byte-match Move vectors. `cargo test` 36/36.
- [x] Phase 2.6 trace→Walrus + `items_hash` commitment (verified on real Walrus);
      `scripts/verify-trace.ts`.
- [x] Phase 2.7 `scripts/evaluate-and-post.ts` local plaintext pipeline
      verified; it now verifies the supplied set hash against the on-chain
      `SealedEval` and refuses `--execute` until in-enclave Seal decrypt lands.
- [x] `apps/web` Next.js 16 eval explorer (reads real chain events). It lists
      multiple sealed evals, lets the user select one, verifies Walrus hashes in
      browser, and exposes the guarded run-job control. `next build` passes
      with the known Turbopack NFT trace warning from the server-side run route.
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
      verify-trace against the posted AttestedScore).

---

## Live Gates And Next Work

### G1. Real model scoring  — OSS local model path implemented
- The first live run uses pinned
  `enacimie/SmolLM2-135M-Instruct-Q2_K-GGUF` at revision
  `013b8f77eeab23a8bcaa34fb221e7d646879bc40`.
- Remote verified artifact baked into the SealedBench EIF has SHA-256
  `f35d6de965cf283cf1fca70dd08aeb0a825e57c616092a257f15e78108c8326b`.
- If the GGUF is also present locally at
  `/tmp/smollm2-135m-instruct-q2_k.gguf`, then
  `SEALEDBENCH_LOCAL_MODEL_PATH=/tmp/smollm2-135m-instruct-q2_k.gguf
  pnpm preflight:gates` satisfies the model gate without an external API key.

### G2. On-chain AttestedScore — DONE on testnet
- Done locally: full package published, `attestation::SEALEDBENCH` OTW exists,
  `attestation::init` minted the enclave Cap, and deployment records
  `enclaveCapId`.
- Done locally: `scripts/register-nautilus-enclave.ts`,
  `scripts/assert-enclave-pk.ts`, and post_score argument construction.
- **Deploy layer now BUILT**:
  `enclave/Dockerfile`, `enclave/run.sh` (multi-destination vsock egress +
  ingress), `enclave/setup-network-proxy.sh` (host systemd socat),
  `enclave/Makefile` (build-enclave/run-enclave/pcrs/host-proxy),
  `tools/gen-enclave-proxy-manifest.ts` (resolves the real Walrus + Seal hosts),
  and `enclave/DEPLOY.md` (the full runbook). Enclave hardened to bake the model
  endpoint/id into the measured image (PCRs); `/get_attestation` now emits the
  attestation doc as base64 under `attestation` (what `register:enclave` reads).
- A SealedBench EIF has been built on
  `ec2-13-51-174-115.eu-north-1.compute.amazonaws.com`; current PCRs are in
  `enclave/out/pcr-values.json`.
- Shared-host switchover is guarded by
  `enclave/shared-host-switchover.sh`; it refuses to stop Aegis unless
  `SEALEDBENCH_ALLOW_AEGIS_STOP=true`.
- Local operator wrapper:
  `pnpm live:nitro-run --dry-run --sealed-eval <eval-id>` prints the exact
  post-approval flow. The real run requires
  `SEALEDBENCH_ALLOW_AEGIS_STOP=true pnpm live:nitro-run --sealed-eval <eval-id>`.
  For the browser-triggered demo, use
  `pnpm live:nitro-run --dry-run --setup-frontend --sealed-eval <eval-id>` and
  then the same command with `SEALEDBENCH_ALLOW_AEGIS_STOP=true`.
- Done live: registered enclave object
  `0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e`
  matches live Nitro public key
  `d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d`.
- Done live: `evaluate-and-post --sealed --execute` against the selected UI eval
  posted `AttestedScore`
  `0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff`.
- Done live: leaderboard shows the score automatically and `verify-trace`
  matches Walrus trace hash
  `d4a03e29ea1cda60806b385b31c07bd6c7354a9cd1b1bf0e8b6552bde3e64c2d`.

### G3. In-enclave Seal decrypt — DONE live on testnet
- DONE: `enclave/src/seal_client.rs` (see DONE section). The protocol + crypto
  are byte-verified offline against @mysten/seal and live-exercised through the
  SealedBench Nitro enclave during the posted score run.
- To post another score: click **Run in enclave** in the frontend or run
  `pnpm tsx scripts/evaluate-and-post.ts --sealed --execute
  --enclave-object 0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e`.

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
| SealedEval | `0xc03afb12f03da17ce90ef334b740e3bde5e80995606f7558da2c629fb97d6474` |
| Walrus ciphertext | `0qirQS37ujigOoWCNzSuM97IseB-OtDt1XR2StJNNto` |
| Demo SealedEval set | `0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222`, `0x682bc37fa20e850b1de94f41ef79eacb59e37d968b74e9fbe011a22edc0510c4`, `0xcf739a8410a7edaa363df7f83135fcb249b74b4cd9fefbde7f99f297b99018bc`, `0xc03afb12f03da17ce90ef334b740e3bde5e80995606f7558da2c629fb97d6474` |
| Registered Enclave | `0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e` |
| AttestedScore | `0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff` |
| Attested trace | `hCunq9O1tUfbdZJi-4FKKHXlc4Zwncp0T66YLlZvcrk` |
| Active signer addr | `0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a` (~51 testnet SUI) |

## Gotchas
- Official Sui testnet fullnode hard-429s; default RPC = publicnode + retry
  transport. Override `SUI_FULLNODE_URL`.
- `@mysten/seal@1.1.3` peers `@mysten/sui@^2.16`; sui 2.x client =
  `SuiJsonRpcClient`/`getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc`.
- `seal.encrypt` requires `packageId` to be a real on-chain package.
- Enclave NSM is Linux-only (cfg-gated); off-Linux = local-unattested mode.
- Attestation test vectors are fixed-seed: `tools/gen-attestation-vectors.ts`.
- Reuses Aegis enclave infra (`~/repo/aegis-wallet/enclave`, Path A AWS box).
