/**
 * Phase 2.6 verifier. Confirms an attested run trace on Walrus matches its
 * on-chain (or signed) items_hash commitment.
 *
 * Modes:
 *   tsx scripts/verify-trace.ts <attestedScoreObjectId> [--network testnet]
 *   tsx scripts/verify-trace.ts --blob <blobId> --items-hash <hex> [--network testnet]
 *
 * Exits 0 on match, non-zero on mismatch.
 */
import { sha256Hex } from "@sealedbench/seal";
import { getBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import { createSuiClient } from "./lib/sui.ts";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolve(
  argv: string[],
  network: "testnet" | "mainnet",
): Promise<{ blobId: string; itemsHash: string; source: string }> {
  const objectId = argv.find((a) => a.startsWith("0x"));
  if (objectId) {
    const client = createSuiClient(network);
    const res = await client.getObject({
      id: objectId,
      options: { showContent: true },
    });
    const content = res.data?.content;
    if (content?.dataType !== "moveObject") {
      throw new Error(`object ${objectId} has no Move content`);
    }
    const fields = content.fields as unknown as {
      items_hash: number[];
      trace_blob_id: string;
    };
    return {
      blobId: fields.trace_blob_id,
      itemsHash: bytesToHex(fields.items_hash),
      source: `on-chain AttestedScore ${objectId}`,
    };
  }
  const blobId = flag(argv, "--blob");
  const itemsHash = flag(argv, "--items-hash");
  if (!blobId || !itemsHash) {
    throw new Error(
      "usage: verify-trace.ts <attestedScoreId> | --blob <id> --items-hash <hex>",
    );
  }
  return { blobId, itemsHash: itemsHash.replace(/^0x/, ""), source: "flags" };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const network = (flag(argv, "--network") ?? "testnet") as
    | "testnet"
    | "mainnet";

  const { blobId, itemsHash, source } = await resolve(argv, network);
  const config = walrusConfigFromEnv({ ...process.env, SUI_NETWORK: network });
  const trace = await getBlob(blobId, { config, retries: 8 });
  const recomputed = sha256Hex(trace);

  console.log(`source:        ${source}`);
  console.log(`trace blobId:  ${blobId}`);
  console.log(`items_hash:    ${itemsHash}`);
  console.log(`sha256(trace): ${recomputed}`);
  if (recomputed === itemsHash) {
    console.log("MATCH ✓ — run trace matches its attestation commitment");
  } else {
    console.error("MISMATCH ✗ — trace does not match the committed items_hash");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
