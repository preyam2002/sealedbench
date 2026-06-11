# SealedBench — demo script (≤4 min)

The money shot: contamination caught **and** the catch proven honest, with every
id resolvable on-chain.

| t | Action | What the audience sees |
|---|--------|------------------------|
| 0:00 | The problem | "Benchmark scores are lies if the test leaked, and labs grade their own homework. We close both." |
| 0:20 | The sealed set on-chain | `SealedEval 0x758aab4a…` on the explorer: sha256, Walrus blobId, `sealed_at_ms`, `cutoff_ts_ms`. Run `verify-provenance.ts` live → ciphertext MATCH ✓, model cutoff precedes the seal. |
| 1:00 | Two models | Model A (post-cutoff, plausibly contaminated, high public score) vs Model B (open, public checkpoint *before* the seal — provably could not have memorized it). |
| 1:20 | Attested eval | Production path: `evaluate-and-post.ts` → the enclave fetches the Seal key, decrypts in-memory, archives the run trace to Walrus, and signs a ScorePayload. Local fallback: run it with `--allow-plaintext-items` and say it is not the production key-release proof. |
| 2:20 | Verify the catch | `verify-trace.ts` → the Walrus trace's sha256 equals the on-chain `items_hash`. The grading is auditable, prompt by prompt. |
| 2:50 | The reveal | Leaderboard: Model A's sealed-set score **collapses** vs its public number; Model B holds. Badges: provenance ✓ + attested-honest ✓. |
| 3:30 | The pitch | A benchmark number labs *and* regulators can verify (EU AI Act model-evaluation records). Distinct from TOLDPROOF (predictions, no TEE) and Walmarket (market oracle): SealedBench = TEE-attested custody + honest scoring of held-out benchmark sets. |

## Live-run notes

- Pre-start the enclave: `cd enclave && ENCLAVE_ADDR=0.0.0.0:3000 cargo run --bin sealedbench-enclave-server`.
- Leaderboard: `pnpm -F @sealedbench/web dev`.
- The fully-attested run (real Nitro + model key + in-enclave Seal decrypt) is
  the production path. The local-unattested mode demos scoring/signing/trace
  commitment only; state clearly which mode is showing.
- Backup: pre-recorded run + cached ids in `docs/VERIFICATION.md` in case of live
  RPC/enclave hiccups.
