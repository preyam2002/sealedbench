/**
 * Phase 2.7 orchestrator. Given a SealedEval and a running enclave:
 *   1. POST the held-out set to the enclave /evaluate (it scores + archives the
 *      run trace to Walrus + signs a ScorePayload),
 *   2. verify the trace commitment (sha256(trace) == signed items_hash),
 *   3. print the exact attested_score::post_score arguments.
 *
 * The final on-chain `post_score` submit needs a *registered* on-chain Enclave
 * object, which requires a real Nitro attestation (gated). Until then this runs
 * the full local pipeline and prints what to submit.
 *
 * Usage:
 *   tsx scripts/evaluate-and-post.ts --sealed-eval <id> --enclave <url>
 *        --endpoint <modelUrl> --model <name> [--api-key <k>] --set <jsonl>
 *        [--network testnet]
 */
import { readFile } from "node:fs/promises";
import { sha256Hex } from "@sealedbench/seal";
import { loadDeployment } from "@sealedbench/shared";
import { getBlob, walrusConfigFromEnv } from "@sealedbench/walrus";

type Args = {
  sealedEval: string;
  enclave: string;
  endpoint: string;
  model: string;
  apiKey: string;
  set: string;
  network: "testnet" | "mainnet";
};

function parseArgs(argv: string[]): Args {
  const get = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sealedEval = get("--sealed-eval");
  if (!sealedEval) {
    throw new Error("--sealed-eval <objectId> is required");
  }
  return {
    sealedEval,
    enclave: get("--enclave") ?? "http://127.0.0.1:3000",
    endpoint: get("--endpoint") ?? "http://127.0.0.1:3930",
    model: get("--model") ?? "demo",
    apiKey: get("--api-key") ?? process.env.OPENAI_API_KEY ?? "",
    set: get("--set") ?? "fixtures/heldout/sealedbench-v1.jsonl",
    network: (get("--network") as Args["network"]) ?? "testnet",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const deployment = await loadDeployment(args.network);
  const walrus = walrusConfigFromEnv({
    ...process.env,
    SUI_NETWORK: args.network,
  });

  const itemsJsonl = await readFile(args.set, "utf8");

  console.log(`[1/3] Calling enclave /evaluate at ${args.enclave}...`);
  const res = await fetch(`${args.enclave}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sealed_eval_id: args.sealedEval,
      model_target: args.model,
      endpoint: args.endpoint,
      model: args.model,
      api_key: args.apiKey,
      system: "Answer the question concisely.",
      items_jsonl: itemsJsonl,
      walrus_publisher_url: walrus.publisherUrl,
      walrus_epochs: walrus.epochs,
      timestamp_ms: Date.now(),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `enclave /evaluate failed: HTTP ${res.status} ${await res.text()}`,
    );
  }
  const score = (await res.json()) as {
    score_num: number;
    score_den: number;
    items_hash: string;
    trace_blob_id: string;
    enclave_pk: string;
    signature: string;
    timestamp_ms: number;
  };
  console.log(
    `      score=${score.score_num}/${score.score_den} trace=${score.trace_blob_id}`,
  );
  console.log(`      enclave_pk=${score.enclave_pk}`);

  console.log("[2/3] Verifying trace commitment on Walrus...");
  const trace = await getBlob(score.trace_blob_id, {
    config: walrus,
    retries: 8,
  });
  const recomputed = sha256Hex(trace);
  if (recomputed !== score.items_hash) {
    throw new Error(
      `trace commitment mismatch: signed ${score.items_hash} != recomputed ${recomputed}`,
    );
  }
  console.log(`      items_hash ${score.items_hash} ✓`);

  console.log(
    "[3/3] post_score arguments (submit once an Enclave is registered):",
  );
  console.log(
    JSON.stringify(
      {
        target: `${deployment.packageId}::attested_score::post_score`,
        sealed_eval: args.sealedEval,
        score_num: score.score_num,
        score_den: score.score_den,
        items_hash: `0x${score.items_hash}`,
        trace_blob_id: score.trace_blob_id,
        timestamp_ms: score.timestamp_ms,
        signature: `0x${score.signature}`,
        note: "needs a registered Enclave<T> object (Nitro attestation) as the first arg",
      },
      null,
      2,
    ),
  );
  console.log(
    "\nLocal pipeline complete ✓ — scored, trace archived + committed. On-chain post_score is gated on enclave registration.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
