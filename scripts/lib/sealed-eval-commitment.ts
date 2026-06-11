import { sha256Hex } from "@sealedbench/seal";
import { validateHeldoutSetText } from "@sealedbench/shared";

export type SealedEvalCommitment = {
  sha256Plaintext: string;
  sha256Ciphertext: string;
  walrusBlobId: string;
  modelTarget: string;
  setSize: number;
};

function bytesToHex(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
  if (typeof value === "string") {
    if (/^0x?[0-9a-fA-F]+$/.test(value)) {
      return value.replace(/^0x/, "").toLowerCase();
    }
    return Buffer.from(value, "base64").toString("hex");
  }
  throw new Error("expected vector<u8> as number[] or string");
}

export function parseSealedEvalCommitmentFields(
  fields: Record<string, unknown>,
): SealedEvalCommitment {
  return {
    sha256Plaintext: bytesToHex(fields.sha256_plaintext),
    sha256Ciphertext: bytesToHex(fields.sha256_ciphertext),
    walrusBlobId: String(fields.walrus_blob_id),
    modelTarget: String(fields.model_target),
    setSize: Number(fields.set_size),
  };
}

export function verifyPlaintextSetAgainstCommitment(
  itemsJsonl: string,
  commitment: SealedEvalCommitment,
): { sha256Plaintext: string; itemCount: number } {
  const { items } = validateHeldoutSetText(itemsJsonl, { minItems: 1 });
  const sha256Plaintext = sha256Hex(new TextEncoder().encode(itemsJsonl));
  if (sha256Plaintext !== commitment.sha256Plaintext) {
    throw new Error(
      `plaintext hash mismatch: local ${sha256Plaintext} != sealed ${commitment.sha256Plaintext}`,
    );
  }
  if (items.length !== commitment.setSize) {
    throw new Error(
      `set size mismatch: local ${items.length} != sealed ${commitment.setSize}`,
    );
  }
  return { sha256Plaintext, itemCount: items.length };
}
