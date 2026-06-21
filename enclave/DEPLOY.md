# SealedBench enclave — AWS Nitro deploy (G2 / live G3)

Turns the gate-free spine into the real attested path: a production Nitro EIF
with real PCRs, registered on-chain, that fetches Seal keys + decrypts the
held-out set in-enclave and posts a signed `AttestedScore`. Reuses the proven
Nitro pattern from `~/repo/aegis-wallet/enclave` (EC2 + vsock proxy), extended
to SealedBench's multiple outbound legs and a baked model endpoint.

> ⚠️ Run the enclave in **production** (no `--debug-mode`). A debug enclave has
> all-zero, unattestable PCRs and `0x2::nitro_attestation::load_nitro_attestation`
> will not yield a trustworthy `public_key`/PCR set — never register one.

## What the enclave dials (and what it does not)
Outbound, all HTTPS:443, all tunnelled over vsock: Walrus **aggregator** (fetch
the Seal ciphertext) + **publisher** (archive the run trace) and the **Seal key
servers** (`/v1/fetch_key`). The submission demo runs the tiny OSS model inside
the same EIF on loopback (`llama-server`), so no external model endpoint or API
key is needed. It never calls Sui RPC directly — the key servers run
`seal_approve` against the chain. The exact outbound set is the measured
manifest (step 1), so the PCRs attest the destinations, not just the code.

## 0. Host prereqs (Nitro-enabled EC2)
`nitro-cli` + `docker`, the nitro-enclaves allocator reserving CPU/memory
(≥3072 MiB, 2 vCPU), and `socat` + `jq` on the parent instance.

## 1. Fetch the pinned OSS model + generate the measured outbound manifest
```bash
pnpm tsx scripts/fetch-oss-model.ts \
  enclave/models/smollm2-135m-instruct-q2_k.gguf

pnpm tsx tools/gen-enclave-proxy-manifest.ts \
  --network testnet \
  --local-model \
  --base-vsock-port 8103 \
  --out enclave/out/proxy-manifest.txt
# resolves Walrus + the live Seal key-server URLs from chain.
# The model stays inside the enclave, so there is no model egress destination.
```

## 2. Build the EIF with the baked OSS model + real PCRs (on the Nitro host)
The model weights, llama.cpp runtime, scorer binary, and proxy manifest are baked
into the image, so they are measured in the PCRs: an attested score is provably
produced against this exact tiny OSS model artifact.
```bash
cd enclave
make build-enclave IMAGE=sealedbench-enclave:oss-smollm2
# -> out/sealedbench-enclave.eif and out/pcr-values.json (PCR0/1/2, 96 hex chars each)
```

On the current shared EC2 host, the full builder image can run out of root disk.
The working fallback is the runtime-only prebuilt path:

```bash
# Build the Linux x86_64 server locally with cargo-zigbuild, then copy it to:
# enclave/prebuilt/sealedbench-enclave-server
# Extract the pinned llama.cpp Ubuntu x64 release to:
# enclave/prebuilt/llama-b9701/
cd enclave
make build-enclave-prebuilt IMAGE=sealedbench-enclave:oss-smollm2-prebuilt
```

This path still bakes the server, llama.cpp runtime, model weights, and proxy
manifest into the measured EIF.

## 3. Run in production + bring up the host proxy
```bash
make run-enclave        # production: real PCRs that match the EIF
SEALEDBENCH_HOST_PORT=3001 make host-proxy
# systemd socat: one vsock egress per destination + localhost:3001 ingress bridge
```

## 4. Pull the attestation document
```bash
curl -s http://127.0.0.1:3001/get_attestation > attestation.json
# expect: { "public_key": "<hex>", "mode": "nitro", "attestation": "<base64 COSE doc>" }
```
If `mode` is `local-unattested` or `attestation` is null, you are not on Nitro
(or NSM is unavailable) — **do not register.**

## 5. Register PCRs + pubkey on-chain
```bash
# from repo root; pairs build-time PCRs with the runtime attestation document
SEALEDBENCH_PCRS_JSON=enclave/out/pcr-values.json \
SEALEDBENCH_ATTESTATION_PATH=enclave/attestation.json \
pnpm register:enclave
# create_enclave_config (PCRs) -> 0x2::nitro_attestation::load_nitro_attestation
# -> enclave::register_enclave<SEALEDBENCH>; prints { configId, enclaveId }
```

## 6. Assert the on-chain pubkey matches the live enclave
```bash
pnpm assert:enclave --enclave-object <enclaveId>   # -> status: match
```

## 7. The real attested run → on-chain AttestedScore
The endpoint/model are baked, so the request only carries the api_key. Decrypt
happens in-enclave via the live Seal key release.
```bash
ANTHROPIC_API_KEY=sk-... pnpm tsx scripts/evaluate-and-post.ts \
  --sealed --enclave-object <enclaveId> \
  --enclave http://127.0.0.1:3001 \
  --provider openai --model smollm2-135m-instruct-q2_k \
  --endpoint http://127.0.0.1:8081 \
  --execute
# enclave fetches the ciphertext from Walrus, fetch_key (gated by seal_approve
# against <enclaveId>), decrypts in memory, scores, archives the trace, signs,
# and post_score lands a real AttestedScore. The leaderboard shows it.
```

## 8. Verify the catch
```bash
pnpm demo --attested-score <scoreId>      # verify-provenance + verify-trace, live
pnpm preflight:gates                      # ready:true once PCRs + attestation exist
```

## Trust-model notes
- socat forwards **raw TCP**; each destination's TLS terminates inside the
  enclave, so the host proxy sees ciphertext only (it can delay/drop, not forge
  Walrus/Seal/model responses).
- The signing key is generated **in-enclave**, never leaves, and is bound through
  the Nitro `public_key` field (not `user_data`) — `attestation.rs` sets it
  correctly, so `document.public_key()` reads it on-chain.
- The OSS model weights and llama.cpp runtime are baked into the PCRs; no model
  API key is needed for the demo path.
- **Reproducible PCRs:** the EIF embeds the rust toolchain image + deps; pin the
  builder image digest for a reproducible measurement others can re-derive. This
  is the one remaining acceptance item to harden before mainnet.
