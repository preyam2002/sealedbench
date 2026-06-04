/**
 * Phase 1 provenance verifier. Given a SealedEval object id:
 *  1. re-fetch the object from Sui,
 *  2. re-download the ciphertext from Walrus by its on-chain blobId,
 *  3. recompute SHA-256 and assert it equals the on-chain sha256_ciphertext,
 *  4. print sealed_at_ms vs cutoff_ts_ms.
 *
 * Exits 0 when the ciphertext matches its on-chain commitment, non-zero
 * otherwise. `--tamper-test` flips a byte to prove the check catches tampering.
 *
 * Usage: tsx scripts/verify-provenance.ts <objectId> [--network testnet] [--tamper-test]
 */
import { sha256Hex } from "@sealedbench/seal";
import { getBlob, walrusConfigFromEnv } from "@sealedbench/walrus";
import { createSuiClient } from "./lib/sui.ts";

type Fields = {
  sha256_plaintext: number[];
  sha256_ciphertext: number[];
  walrus_blob_id: string;
  cutoff_ts_ms: string;
  sealed_at_ms: string;
  model_target: string;
  revealed: boolean;
  plaintext_blob_id: string | null;
};

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const objectId = argv.find((a) => a.startsWith("0x"));
  const network = (argv[argv.indexOf("--network") + 1] ?? "testnet") as
    | "testnet"
    | "mainnet";
  const tamper = argv.includes("--tamper-test");
  if (!objectId) {
    console.error("usage: tsx scripts/verify-provenance.ts <objectId>");
    process.exit(2);
  }

  const client = createSuiClient(network);
  const res = await client.getObject({
    id: objectId,
    options: { showContent: true, showPreviousTransaction: true },
  });
  const content = res.data?.content;
  if (content?.dataType !== "moveObject") {
    throw new Error(`object ${objectId} has no Move content`);
  }
  const fields = content.fields as unknown as Fields;

  const onchainCiphertextHash = bytesToHex(fields.sha256_ciphertext);
  const onchainPlaintextHash = bytesToHex(fields.sha256_plaintext);
  const blobId = fields.walrus_blob_id;
  const sealedAt = Number(fields.sealed_at_ms);
  const cutoff = Number(fields.cutoff_ts_ms);

  const config = walrusConfigFromEnv({ ...process.env, SUI_NETWORK: network });
  let ciphertext = await getBlob(blobId, { config, retries: 6 });
  if (tamper) {
    ciphertext = new Uint8Array(ciphertext);
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
  }
  const recomputed = sha256Hex(ciphertext);
  const ciphertextOk = recomputed === onchainCiphertextHash;

  const iso = (ms: number) => new Date(ms).toISOString();
  console.log("=== SealedBench provenance ===");
  console.log(`object:        ${objectId}`);
  console.log(`createdTx:     ${res.data?.previousTransaction}`);
  console.log(`model_target:  ${fields.model_target}`);
  console.log(`walrus blobId: ${blobId}`);
  console.log(`sha256(plaintext) [committed]:  ${onchainPlaintextHash}`);
  console.log(`sha256(ciphertext) [on-chain]:  ${onchainCiphertextHash}`);
  console.log(`sha256(ciphertext) [recomputed]: ${recomputed}`);
  console.log(
    `ciphertext integrity:           ${ciphertextOk ? "MATCH ✓" : "MISMATCH ✗"}`,
  );
  console.log(`sealed_at_ms:  ${sealedAt} (${iso(sealedAt)})`);
  console.log(`cutoff_ts_ms:  ${cutoff} (${iso(cutoff)})`);
  console.log(
    sealedAt < cutoff
      ? "sealed BEFORE the model cutoff ✓ (commitment predates cutoff)"
      : "sealed AFTER the model cutoff — model cutoff predates the seal " +
          "(strongest clean claim: the set did not exist at the model's cutoff)",
  );

  if (fields.revealed && fields.plaintext_blob_id) {
    const plaintext = await getBlob(fields.plaintext_blob_id, {
      config,
      retries: 6,
    });
    const ptOk = sha256Hex(plaintext) === onchainPlaintextHash;
    console.log(
      `plaintext integrity (revealed): ${ptOk ? "MATCH ✓" : "MISMATCH ✗"}`,
    );
    if (!ptOk) {
      process.exit(1);
    }
  } else {
    console.log("plaintext: sealed (not revealed) — hash committed on-chain");
  }

  if (!ciphertextOk) {
    console.error(
      tamper
        ? "\nTamper detected as expected: recomputed hash != on-chain commitment."
        : "\nProvenance FAILED: ciphertext does not match its on-chain commitment.",
    );
    process.exit(1);
  }
  console.log("\nProvenance verified ✓");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
