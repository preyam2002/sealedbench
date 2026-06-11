/**
 * Phase 2.7 orchestrator. Given a SealedEval and a running enclave:
 *   1. POST the held-out set to the local enclave /evaluate (it scores +
 *      archives the run trace to Walrus + signs a ScorePayload),
 *   2. verify the trace commitment (sha256(trace) == signed items_hash),
 *   3. print the exact attested_score::post_score arguments.
 *
 * This is a local-only plaintext-items pipeline until in-enclave Seal decrypt
 * lands. The script refuses --execute so it cannot create an on-chain score that
 * overclaims Seal key release to the enclave.
 *
 * Usage:
 *   tsx scripts/evaluate-and-post.ts --sealed-eval <id> --enclave <url>
 *        --endpoint <modelUrl> --model <name> [--api-key <k>] --set <jsonl>
 *        [--network testnet] --allow-plaintext-items
 */
import { readFile } from "node:fs/promises";
import { Transaction } from "@mysten/sui/transactions";
import { sha256Hex } from "@sealedbench/seal";
import { loadDeployment } from "@sealedbench/shared";
import { getBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import {
  assertEvaluateAndPostMode,
  parseEvaluateAndPostArgs,
} from "./lib/evaluate-and-post-args.ts";
import {
  parseSealedEvalCommitmentFields,
  verifyPlaintextSetAgainstCommitment,
} from "./lib/sealed-eval-commitment.ts";
import { createSuiClient, hexToBytes, loadKeypair } from "./lib/sui.ts";

async function main(): Promise<void> {
  const args = parseEvaluateAndPostArgs(process.argv.slice(2));
  assertEvaluateAndPostMode(args);
  const deployment = await loadDeployment(args.network);
  const sealedEval = args.sealedEval ?? deployment.seedSealedEvalId;
  if (!sealedEval) {
    throw new Error("--sealed-eval <objectId> is required");
  }
  const walrus = walrusConfigFromEnv({
    ...process.env,
    SUI_NETWORK: args.network,
  });

  const itemsJsonl = await readFile(args.set, "utf8");
  const client = createSuiClient(args.network);
  const object = await client.getObject({
    id: sealedEval,
    options: { showContent: true },
  });
  const content = object.data?.content;
  if (content?.dataType !== "moveObject") {
    throw new Error(`sealed eval ${sealedEval} has no Move object content`);
  }
  const commitment = parseSealedEvalCommitmentFields(
    content.fields as Record<string, unknown>,
  );
  const verified = verifyPlaintextSetAgainstCommitment(itemsJsonl, commitment);
  console.log(
    `      local set matches SealedEval: items=${verified.itemCount} sha256=${verified.sha256Plaintext}`,
  );

  console.log(`[1/3] Calling enclave /evaluate at ${args.enclave}...`);
  const res = await fetch(`${args.enclave}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sealed_eval_id: sealedEval,
      model_target: args.model,
      endpoint: args.endpoint,
      model: args.model,
      model_provider: args.provider,
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
  const postArgs = {
    target: `${deployment.packageId}::attested_score::post_score`,
    type_arg:
      args.typeArg ?? `${deployment.packageId}::attestation::SEALEDBENCH`,
    enclave: args.enclaveObject ?? null,
    sealed_eval: sealedEval,
    score_num: score.score_num,
    score_den: score.score_den,
    items_hash: `0x${score.items_hash}`,
    trace_blob_id: score.trace_blob_id,
    timestamp_ms: score.timestamp_ms,
    signature: `0x${score.signature}`,
  };
  console.log(JSON.stringify(postArgs, null, 2));

  if (args.execute) {
    if (!args.enclaveObject) {
      throw new Error(
        "--execute requires --enclave-object <Enclave object id>",
      );
    }
    const tx = new Transaction();
    tx.moveCall({
      target: postArgs.target,
      typeArguments: [postArgs.type_arg],
      arguments: [
        tx.object(args.enclaveObject),
        tx.object(sealedEval),
        tx.pure.u64(BigInt(score.score_num)),
        tx.pure.u64(BigInt(score.score_den)),
        tx.pure.vector("u8", Array.from(hexToBytes(score.items_hash))),
        tx.pure.string(score.trace_blob_id),
        tx.pure.u64(BigInt(score.timestamp_ms)),
        tx.pure.vector("u8", Array.from(hexToBytes(score.signature))),
        tx.object(deployment.clockObjectId),
      ],
    });

    const keypair = await loadKeypair();
    const res = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });
    const status = res.effects?.status?.status;
    if (status !== "success") {
      throw new Error(
        `post_score failed: ${JSON.stringify(res.effects?.status)}`,
      );
    }
    const created = (res.objectChanges ?? []).find(
      (change) =>
        change.type === "created" &&
        "objectType" in change &&
        change.objectType.endsWith("::attested_score::AttestedScore"),
    );
    const scoreId =
      created && "objectId" in created ? created.objectId : undefined;
    console.log(
      JSON.stringify(
        { step: "post_score", digest: res.digest, scoreId },
        null,
        2,
      ),
    );
  }
  console.log(
    args.execute
      ? "\nOn-chain post_score complete."
      : "\nLocal plaintext pipeline complete ✓ — scored, trace archived + committed. Production post_score remains disabled until in-enclave Seal decrypt lands.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
