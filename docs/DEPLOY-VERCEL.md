# Deploying the SealedBench leaderboard to Vercel

The web app (`apps/web`) is a Next.js 16 app that reads **live Sui testnet** events at
request time. It needs no backend — judges' browsers do the verification. The
`/api/evaluations/*` run-control routes are **disabled by default**
(`SEALEDBENCH_ENABLE_RUNS` unset), so the deployed site is a safe, read-only verifier;
the live enclave run is driven separately by the operator (`pnpm live:nitro-run`).

## One-time setup

```bash
# 1. Authenticate (interactive — run it yourself in the terminal)
npx vercel login

# 2. From the repo root, link a project
npx vercel link
```

When prompted, **set the Root Directory to `apps/web`** (Vercel → Project → Settings →
Build & Output → Root Directory). Vercel auto-detects Next.js + pnpm from there.

## Environment variables (Vercel → Settings → Environment Variables)

All have safe defaults baked into `deployments/testnet.json`, but set them explicitly
for production so the build never depends on the committed JSON:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` |
| `NEXT_PUBLIC_SEALEDBENCH_PACKAGE_ID` | `0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f` |
| `NEXT_PUBLIC_SEALEDBENCH_ACTIVE_EVAL_IDS` | `0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222` |
| `NEXT_PUBLIC_ENCLAVE_PK` | `d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d` |

Leave `SEALEDBENCH_ENABLE_RUNS` unset (runs stay off in the hosted environment).

## Ship it

```bash
npx vercel --prod
```

The leaderboard, in-browser Walrus/trace verification, and all Suiscan/Walrus links
work on the hosted URL exactly as they do locally. Paste that URL into the DeepSurge
submission as the live demo.
