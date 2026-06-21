/**
 * Phase 2.7/2.8 orchestrator. Given a SealedEval and a running enclave:
 *   1. POST the held-out set to the enclave /evaluate (it scores + archives the
 *      run trace to Walrus + signs a ScorePayload),
 *   2. verify the trace commitment (sha256(trace) == signed items_hash),
 *   3. print the exact attested_score::post_score arguments (and submit them
 *      with --execute).
 *
 * Two modes:
 *   --sealed                 production path — the enclave fetches the Seal
 *                            ciphertext from Walrus, fetches IBE keys from the
 *                            key servers (gated by seal_policy::seal_approve
 *                            against the registered Enclave object) and
 *                            decrypts in memory. Requires --enclave-object.
 *   --allow-plaintext-items  local pipeline — sends the plaintext set to
 *                            /evaluate. Cannot --execute.
 *
 * Usage:
 *   tsx scripts/evaluate-and-post.ts --sealed-eval <id> --enclave <url>
 *        --endpoint <modelUrl> --model <name> [--api-key <k>] [--set <jsonl>]
 *        [--network testnet] (--sealed --enclave-object <id> [--execute]
 *                            | --allow-plaintext-items)
 */
import { readFile } from "node:fs/promises";
import { Transaction } from "@mysten/sui/transactions";
import { fetchConfiguredKeyServers, sha256Hex } from "@sealedbench/seal";
import { loadDeployment } from "@sealedbench/shared";
import { getBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import {
  assertEvaluateAndPostMode,
  parseEvaluateAndPostArgs,
  postScoreTypeArguments,
} from "./lib/evaluate-and-post-args.ts";
import { loadEnv } from "./lib/load-env.ts";
import {
  parseSealedEvalCommitmentFields,
  verifyPlaintextSetAgainstCommitment,
} from "./lib/sealed-eval-commitment.ts";
import { createSuiClient, hexToBytes, loadKeypair } from "./lib/sui.ts";

async function main(): Promise<void> {
  loadEnv();
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

  // The score's model_target is bound to the SealedEval's own declared target
  // (read from chain) — never a CLI default — so the posted score names exactly
  // the model the set was sealed for. --model only chooses which model to dial
  // locally; the attested path overrides it with the baked enclave endpoint.
  const declaredModelTarget = String(
    (content.fields as Record<string, unknown>).model_target ?? "",
  );
  if (!declaredModelTarget) {
    throw new Error(`SealedEval ${sealedEval} has no model_target on-chain`);
  }
  const dialedModel = args.model ?? declaredModelTarget;

  let itemsField: Record<string, unknown>;
  if (args.sealed) {
    // Production path: the enclave pulls the ciphertext from Walrus and
    // decrypts it in-enclave after the key servers dry-run seal_approve.
    const enclaveObjectId = args.enclaveObject as string;
    const enclaveObject = await client.getObject({
      id: enclaveObjectId,
      options: { showOwner: true },
    });
    const owner = enclaveObject.data?.owner;
    const initialSharedVersion =
      owner && typeof owner === "object" && "Shared" in owner
        ? Number(owner.Shared.initial_shared_version)
        : undefined;
    if (initialSharedVersion === undefined) {
      throw new Error(
        `enclave object ${enclaveObjectId} is not a shared object`,
      );
    }
    const keyServers = await fetchConfiguredKeyServers(args.network, client);
    console.log(
      `      sealed mode: ciphertext=${commitment.walrusBlobId} keyServers=${keyServers.length}`,
    );
    itemsField = {
      sealed_items: {
        walrus_blob_id: commitment.walrusBlobId,
        walrus_aggregator_url: walrus.aggregatorUrl,
        key_servers: keyServers.map((server) => ({
          object_id: server.objectId,
          url: server.url,
          pk_b64: server.pkB64,
        })),
        enclave_object: {
          object_id: enclaveObjectId,
          initial_shared_version: initialSharedVersion,
        },
      },
    };
  } else {
    const itemsJsonl = await readFile(args.set, "utf8");
    const verified = verifyPlaintextSetAgainstCommitment(
      itemsJsonl,
      commitment,
    );
    console.log(
      `      local set matches SealedEval: items=${verified.itemCount} sha256=${verified.sha256Plaintext}`,
    );
    itemsField = { items_jsonl: itemsJsonl };
  }

  console.log(`[1/3] Calling enclave /evaluate at ${args.enclave}...`);
  const res = await fetch(`${args.enclave}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sealed_eval_id: sealedEval,
      model_target: declaredModelTarget,
      endpoint: args.endpoint,
      model: dialedModel,
      model_provider: args.provider,
      api_key: args.apiKey,
      system: "Answer the question concisely.",
      ...itemsField,
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
      typeArguments: postScoreTypeArguments(postArgs.type_arg),
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
      : args.sealed
        ? "\nSealed pipeline complete ✓ — in-enclave decrypt, scored, trace archived + committed. Re-run with --execute to post on-chain."
        : "\nLocal plaintext pipeline complete ✓ — scored, trace archived + committed. Use --sealed for the production key-release path.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
