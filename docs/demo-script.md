# SealedBench — demo script

The live frontend is the demo surface. It shows four real testnet `SealedEval`
objects, one real posted `AttestedScore`, browser-side Walrus hash
verification, trace verification, and a server-side **Run in enclave** path
wired to the running SealedBench Nitro enclave.

Current demo mode temporarily pauses Aegis on the shared Nitro host. The host
allocator reserves only CPUs `1,3`, and a Nitro enclave consumes its assigned
CPUs exclusively, so Aegis and SealedBench cannot both run on this host at the
same time without a larger/reconfigured instance.

## Manual Frontend Demo

Open the built frontend:

```text
http://localhost:3012
```

Demo flow:

1. Show the top stats: `testnet`, `Sealed benchmarks: 4`, `Attested scores: 1`.
2. Scroll to **The ledger**.
3. Select **Eval-01**. It should show `1 attested honest run ✓` and the score
   `27/50 · 54%`.
4. Click **Verify blob** on the selected eval.
5. Show `MATCH`: the browser fetched the ciphertext from Walrus, hashed it, and
   matched the on-chain Sui hash.
6. Click **Verify trace** on the posted score. It should match the on-chain
   `items_hash`.
7. Open `score↗` and `trace↗` if you want to show the raw Sui object and Walrus
   trace blob.
8. Click **Run in enclave** only if you want to run another live scoring job.
   It will use the currently running Nitro tunnel and can post an additional
   `AttestedScore`.

Live proof ids:

| | |
|---|---|
| SealedEval | `0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222` |
| Registered enclave | `0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e` |
| Enclave public key | `d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d` |
| AttestedScore | `0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff` |
| post_score digest | `FN3JW6Be3D871SSeT4QMkKKa47exGSnEVmVr9AtahRoy` |
| Trace blob | `hCunq9O1tUfbdZJi-4FKKHXlc4Zwncp0T66YLlZvcrk` |
| items_hash | `d4a03e29ea1cda60806b385b31c07bd6c7354a9cd1b1bf0e8b6552bde3e64c2d` |

## Nitro Status

The real SealedBench EIF has been built on the AWS Nitro host with:

- pinned SmolLM2 GGUF model baked into the image
- pinned llama.cpp release binary baked into the image
- Walrus + Seal outbound manifest baked into the image
- PCR evidence copied to `enclave/out/pcr-values.json`

Trace proof:

```bash
pnpm tsx scripts/verify-trace.ts \
  0x4e563e5549e419cb213e97fb53e5b8701996b131b0187906f38f3fd7ecd3caff \
  --network testnet
```

Expected:

```text
output contains MATCH
```

Dry-run the full guarded operator sequence without touching remote state:

```bash
pnpm live:nitro-run --dry-run \
  --setup-frontend \
  --sealed-eval 0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222
```

## Full Demo Setup

If the current local tunnel or web server is not running, use the guarded EC2
setup. It pauses Aegis, starts SealedBench, registers the current Nitro
attestation, opens the local tunnel, asserts the public key, and prints the
exact web env:

```bash
SEALEDBENCH_ALLOW_AEGIS_STOP=true pnpm live:nitro-run \
  --setup-frontend \
  --sealed-eval 0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222
```

Leave that process running while testing. In another terminal, start the web app
with the registered enclave id printed by the script. For the current live demo
object:

```bash
SEALEDBENCH_ENABLE_RUNS=true \
SEALEDBENCH_ENCLAVE_URL=http://127.0.0.1:3321 \
SEALEDBENCH_ENCLAVE_OBJECT_ID=0x50570041a718078ef51044328a23f2d00fa637353cc92e233d94d959461f7a1e \
SEALEDBENCH_REPO_ROOT=/Users/preyam/repo/sealedbench \
NEXT_PUBLIC_ENCLAVE_PK=d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d \
pnpm --dir apps/web exec next start --port 3012
```

When finished with the Nitro demo, stop the setup wrapper with `Ctrl-C`; it
restores Aegis in `finally`. If the wrapper is not the process holding
SealedBench, restore manually from the remote host with
`./shared-host-switchover.sh restore-aegis`.
