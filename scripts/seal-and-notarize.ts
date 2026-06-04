/**
 * Phase 1 end-to-end: Seal-encrypt a held-out set -> store ciphertext on Walrus
 * -> create a SealedEval object on Sui notarizing both SHA-256 hashes, the real
 * Walrus blobId, the author-supplied training cutoff, and the model target.
 *
 * Usage:
 *   tsx scripts/seal-and-notarize.ts --set <jsonl> [--network testnet]
 *        [--model <target>] [--cutoff <ms>] [--dry-run]
 */
import { Transaction } from "@mysten/sui/transactions";
import { sealEncryptHeldoutSetFile } from "@sealedbench/seal";
import { loadDeployment } from "@sealedbench/shared";
import { putBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import { createSuiClient, hexToBytes, loadKeypair } from "./lib/sui.ts";

type Args = {
  set: string;
  network: "testnet" | "mainnet";
  model: string;
  cutoff: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const network = (get("--network") ?? "testnet") as Args["network"];
  return {
    set: get("--set") ?? "fixtures/heldout/sealedbench-v1.jsonl",
    network,
    model: get("--model") ?? "demo/clean-open-model-2024-10",
    cutoff: Number.parseInt(get("--cutoff") ?? "1727740800000", 10),
    dryRun: argv.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const deployment = await loadDeployment(args.network);
  const packageId = deployment.packageId;

  // Per-set IBE identity (the seal_approve gate, finalized in Phase 2). We use a
  // deterministic identity derived from the set so re-sealing is reproducible.
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
    const put = await putBlob(result.ciphertext, { config });
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
      // Phase 1 placeholder policy id (packageId); Phase 2 binds the Enclave.
      tx.pure.id(packageId),
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
