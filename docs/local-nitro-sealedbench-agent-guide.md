# SealedBench Nitro Agent Guide

This is the current SealedBench-specific Nitro state on the shared EC2 host.
It is safe to use for continuation by future agents; it contains no private key
contents.

## Host And Boundaries

- EC2 host: `ec2-13-51-174-115.eu-north-1.compute.amazonaws.com`
- SSH user: `ec2-user`
- Local SSH key path: `/Users/preyam/Documents/Private stuff/Aletheia.pem`
- SealedBench remote path: `~/sealedbench-nitro/enclave`
- Existing Aegis remote path: `~/aegis-wallet-nitro/enclave`
- Do not terminate or reconfigure Aegis without explicit user approval.
- Prefer `./shared-host-switchover.sh` on this shared host. It terminates
  enclaves by explicit id and refuses to stop Aegis unless
  `SEALEDBENCH_ALLOW_AEGIS_STOP=true` is set.

## Current Remote State

Current demo mode has SealedBench running and Aegis temporarily paused:

- Enclave name: `sealedbench-enclave`
- CID: `17`
- CPUs: `1,3`
- Memory: `2048 MiB`
- Services: `sealedbench-ingress.service` is active,
  `aegis-sui-proxy.service` is active, and `aegis-inbound-proxy.service` is
  failed while Aegis is paused.

The Nitro allocator reserves exactly:

```yaml
memory_mib: 3072
cpu_pool: 1,3
```

Because a running Nitro enclave consumes its assigned allocator CPUs
exclusively, Aegis and SealedBench cannot run concurrently on this host. A
non-destructive attempt to start SealedBench while Aegis owned the pool with
`ENCLAVE_CID=17 MEMORY_MIB=1024 CPU_COUNT=1` failed with Nitro:

```text
The enclave cannot be created because no CPUs are available in the pool
```

## Built SealedBench EIF

A SealedBench EIF has been built successfully using the runtime-only path:

```bash
cd ~/sealedbench-nitro/enclave
make build-enclave-prebuilt IMAGE=sealedbench-enclave:oss-smollm2-prebuilt
```

The build uses:

- Cross-compiled Linux x86_64 `sealedbench-enclave-server`
- llama.cpp release `b9701`, commit `24bba7b98ea1544cc89352c7a573baedcb831a64`
- `llama-b9701-bin-ubuntu-x64.tar.gz`
- llama archive SHA-256:
  `90b4bab33ff877c31464f1658cce1ff609d20e6209d3cac6a66d3f282d0f7175`
- SmolLM2 GGUF SHA-256:
  `f35d6de965cf283cf1fca70dd08aeb0a825e57c616092a257f15e78108c8326b`

The image contains runnable Linux x86_64 binaries. Remote sanity check:

```bash
docker run --rm --entrypoint /bin/sh sealedbench-enclave:oss-smollm2-prebuilt \
  -lc 'ldd /usr/local/bin/sealedbench-enclave-server && /usr/local/bin/llama-server --version | head -3'
```

Expected llama line:

```text
version: 9701 (24bba7b98)
built with GNU 11.4.0 for Linux x86_64
```

## Current SealedBench PCRs

Local evidence copied from the EC2 host:

- `enclave/out/build-output.txt`
- `enclave/out/pcr-values.json`

PCRs:

```json
{
  "pcr0": "5cd6cbbf2cee04df9a6dc11c92a1dcfdf4306449b6c7802cb55888ea7aaae0cdf845a5fa18a37b690f3a8ed12063fbaa",
  "pcr1": "4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493",
  "pcr2": "78bb768000c049ecd03d33f378e25669c74b29c2ccf9798350168805ca0fa563bfcc2d50fe74e904d5fb7498faf5c6fe"
}
```

The current live proof is stronger than the old preflight gate: the SealedBench
Nitro enclave is running, registered on-chain, and has posted a real score from
the selected UI eval.

```bash
pnpm assert:enclave \
  --network testnet \
  --enclave-object 0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e \
  --enclave http://127.0.0.1:3321
```

Expected:

```json
{
  "publicKey": "d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d",
  "status": "match"
}
```

## Continue From Here

To keep demoing the live SealedBench path:

- Keep Aegis paused while the SealedBench enclave owns CPUs `1,3`.
- Keep the local SSH tunnel open: `3321 -> 127.0.0.1:3001`.
- Run the web app with `SEALEDBENCH_ENABLE_RUNS=true` and the registered
  enclave object id.

To run both Aegis and SealedBench at the same time, use one of these instead:

- Change the host allocator on a larger instance so both enclaves have reserved
  CPU and memory capacity.
- Use a separate Nitro-enabled EC2 instance for SealedBench.

Read current state without mutating Aegis:

```bash
cd ~/sealedbench-nitro/enclave
./shared-host-switchover.sh status
```

After explicit user approval to pause Aegis, or if you need to recreate the
current SealedBench state, use the guarded switchover:

```bash
cd ~/sealedbench-nitro/enclave
SEALEDBENCH_ALLOW_AEGIS_STOP=true ./shared-host-switchover.sh start-sealedbench
```

This stops only `aegis-enclave` by id, starts `sealedbench-enclave`, exposes the
SealedBench ingress on `127.0.0.1:3001`, and writes:

```text
/tmp/sealedbench-attestation.json
```

If the SealedBench run is interrupted, restore Aegis before leaving the host:

```bash
cd ~/sealedbench-nitro/enclave
./shared-host-switchover.sh restore-aegis
```

From the local repo, the same post-approval sequence is wrapped by:

```bash
pnpm live:nitro-run --dry-run --sealed-eval <sealed-eval-id>
SEALEDBENCH_ALLOW_AEGIS_STOP=true pnpm live:nitro-run --sealed-eval <sealed-eval-id>
pnpm live:nitro-run --dry-run --setup-frontend --sealed-eval <sealed-eval-id>
SEALEDBENCH_ALLOW_AEGIS_STOP=true pnpm live:nitro-run --setup-frontend --sealed-eval <sealed-eval-id>
```

The default real run starts SealedBench, copies PCRs and attestation, registers
the enclave, opens the local `3321 -> 127.0.0.1:3001` SSH tunnel, asserts public
key match, runs `evaluate-and-post --sealed --execute`, and restores Aegis in a
`finally` block. The `--setup-frontend` mode stops before the score command,
prints the web env, holds the tunnel open for browser-triggered runs, and
restores Aegis when stopped.

Current frontend env:

```bash
SEALEDBENCH_ENABLE_RUNS=true \
SEALEDBENCH_ENCLAVE_URL=http://127.0.0.1:3321 \
SEALEDBENCH_ENCLAVE_OBJECT_ID=0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e \
SEALEDBENCH_REPO_ROOT=/Users/preyam/repo/sealedbench \
NEXT_PUBLIC_ENCLAVE_PK=d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d \
pnpm --dir apps/web exec next start --port 3012
```

Current posted score proof:

```bash
pnpm tsx scripts/verify-trace.ts \
  0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff \
  --network testnet
```

Expected trace hash:

```text
d4a03e29ea1cda60806b385b31c07bd6c7354a9cd1b1bf0e8b6552bde3e64c2d
```

If you are doing the manual remote path instead of `pnpm live:nitro-run`, copy
attestation locally:

```bash
scp -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com:/tmp/sealedbench-attestation.json \
  enclave/attestation.json
```

Register and verify:

```bash
SEALEDBENCH_PCRS_JSON=enclave/out/pcr-values.json \
SEALEDBENCH_ATTESTATION_PATH=enclave/attestation.json \
pnpm register:enclave

pnpm assert:enclave --enclave-object "$SEALEDBENCH_ENCLAVE_ID" --enclave http://127.0.0.1:3321
```

The live proof threshold has been met for the testnet demo: a SealedBench
attestation exists, the enclave public key matches the registered on-chain
object, and a real `AttestedScore` is posted from the selected UI eval. The
remaining operational caveat is shared-host capacity: restore Aegis when the
SealedBench demo is no longer needed.
