/**
 * Phase 1 end-to-end: Seal-encrypt a held-out set -> store ciphertext on Walrus
 * -> create a SealedEval object on Sui notarizing both SHA-256 hashes, the real
 * Walrus blobId, the author-supplied training cutoff, and the model target.
 *
 * Usage:
 *   tsx scripts/seal-and-notarize.ts --model <target> --cutoff <unix-ms>
 *        [--set <jsonl>] [--network testnet] [--seal-policy <id>] [--dry-run]
 */
import { Transaction } from "@mysten/sui/transactions";
import { sealEncryptHeldoutSetFile } from "@sealedbench/seal";
import { loadDeployment } from "@sealedbench/shared";
import { putBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import { loadEnv } from "./lib/load-env.ts";
import { createSuiClient, hexToBytes, loadKeypair } from "./lib/sui.ts";

type Args = {
  set: string;
  network: "testnet" | "mainnet";
  model: string;
  cutoff: number;
  sealPolicy: string | undefined;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const network = (get("--network") ?? "testnet") as Args["network"];
  // The model target and training cutoff define the contamination claim, so the
  // author must state them explicitly — there is no default model or cutoff.
  const model = get("--model");
  const cutoff = get("--cutoff");
  if (!model) {
    throw new Error("--model <target> is required (the model this set is for)");
  }
  if (!cutoff || !Number.isFinite(Number(cutoff))) {
    throw new Error(
      "--cutoff <unix-ms> is required (the model's training cutoff)",
    );
  }
  return {
    set: get("--set") ?? "fixtures/heldout/sealedbench-v1.jsonl",
    network,
    model,
    cutoff: Number.parseInt(cutoff, 10),
    sealPolicy: get("--seal-policy"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const deployment = await loadDeployment(args.network);
  const packageId = deployment.packageId;

  // Per-set IBE identity = sha256(plaintext): seal once to learn that hash, then
  // re-seal under it, so the identity the key servers gate on is bound to the
  // exact plaintext (the enclave re-checks id == sha256(plaintext) after decrypt).
  console.log(`[1/3] Seal-encrypting ${args.set} (network=${args.network})...`);
  const provisionalIdentity = `0x${"00".repeat(16)}`;
  const sealed = await sealEncryptHeldoutSetFile(args.set, {
    packageId,
    identity: provisionalIdentity,
    network: args.network,
  });
  // Re-derive a stable identity from the plaintext hash and re-encrypt under it.
  const identity = `0x${sealed.sha256Plaintext}`;
  const result = await sealEncryptHeldoutSetFile(args.set, {
    packageId,
    identity,
    network: args.network,
  });
  console.log(
    `      items=${result.itemCount} sha256(plaintext)=${result.sha256Plaintext}`,
  );
  console.log(`      sha256(ciphertext)=${result.sha256Ciphertext}`);

  let blobId = "DRY_RUN_BLOB";
  if (!args.dryRun) {
    console.log("[2/3] Storing ciphertext on Walrus...");
    const config = walrusConfigFromEnv({
      ...process.env,
      SUI_NETWORK: args.network,
    });
    const put = await putBlob(result.ciphertext, {
      config,
      retries: 4,
      retryDelayMs: 3000,
    });
    blobId = put.blobId;
    console.log(
      `      blobId=${blobId} (${put.alreadyCertified ? "already-certified" : "newly-created"})`,
    );
  } else {
    console.log("[2/3] (dry-run) skipping Walrus PUT");
  }

  console.log("[3/3] Building create(SealedEval) PTB...");
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::sealed_eval::create`,
    arguments: [
      tx.pure.vector("u8", Array.from(hexToBytes(result.sha256Plaintext))),
      tx.pure.vector("u8", Array.from(hexToBytes(result.sha256Ciphertext))),
      tx.pure.string(blobId),
      // The release-policy object recorded on the SealedEval. Defaults to the
      // package (the seal_policy module that gates release); pass --seal-policy
      // <id> to bind the registered Enclave object once G2 is live.
      tx.pure.id(args.sealPolicy ?? packageId),
      tx.pure.string(args.model),
      tx.pure.u64(BigInt(result.itemCount)),
      tx.pure.u64(BigInt(args.cutoff)),
      tx.object("0x6"),
    ],
  });

  if (args.dryRun) {
    const built = await tx.toJSON();
    console.log("      PTB built (dry-run, not executed):");
    console.log(built);
    return;
  }

  const keypair = await loadKeypair();
  const client = createSuiClient(args.network);
  const sender = keypair.getPublicKey().toSuiAddress();
  console.log(`      sender=${sender}`);

  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  const status = res.effects?.status?.status;
  if (status !== "success") {
    throw new Error(`tx failed: ${JSON.stringify(res.effects?.status)}`);
  }

  const created = (res.objectChanges ?? []).find(
    (c) =>
      c.type === "created" &&
      c.objectType.endsWith("::sealed_eval::SealedEval"),
  );
  const objectId =
    created && "objectId" in created ? created.objectId : undefined;

  console.log("\n=== SealedEval created ===");
  console.log(`objectId:   ${objectId}`);
  console.log(`txDigest:   ${res.digest}`);
  console.log(`walrusBlob: ${blobId}`);
  console.log(`model:      ${args.model}`);
  console.log(`cutoffMs:   ${args.cutoff}`);
  console.log(
    JSON.stringify({ objectId, digest: res.digest, blobId, identity }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
