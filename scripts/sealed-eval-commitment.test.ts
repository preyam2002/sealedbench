import { describe, expect, test } from "vitest";
import {
  parseSealedEvalCommitmentFields,
  verifyPlaintextSetAgainstCommitment,
} from "./lib/sealed-eval-commitment.ts";

const oneItem = `${JSON.stringify({
  id: "a",
  question: "2+2?",
  answer: "4",
  rubric: "exact",
})}\n`;

describe("sealed eval commitment checks", () => {
  test("parses Move object fields into normalized commitments", () => {
    const fields = parseSealedEvalCommitmentFields({
      sha256_plaintext: [0xab, 0xcd],
      sha256_ciphertext: "0x0102",
      walrus_blob_id: "blob",
      model_target: "model",
      set_size: "1",
    });
    expect(fields).toEqual({
      sha256Plaintext: "abcd",
      sha256Ciphertext: "0102",
      walrusBlobId: "blob",
      modelTarget: "model",
      setSize: 1,
    });
  });

  test("accepts a local set matching the sealed plaintext hash and item count", () => {
    const hash =
      "2ea9bd744d1a8ffd80976ca92858af70abcd6acbf330f78716b5b89563c4bdc9";
    expect(
      verifyPlaintextSetAgainstCommitment(oneItem, {
        sha256Plaintext: hash,
        sha256Ciphertext: "00",
        walrusBlobId: "blob",
        modelTarget: "model",
        setSize: 1,
      }),
    ).toEqual({ sha256Plaintext: hash, itemCount: 1 });
  });

  test("rejects a local set whose plaintext hash differs from the sealed eval", () => {
    expect(() =>
      verifyPlaintextSetAgainstCommitment(oneItem, {
        sha256Plaintext: "00",
        sha256Ciphertext: "00",
        walrusBlobId: "blob",
        modelTarget: "model",
        setSize: 1,
      }),
    ).toThrow(/plaintext hash mismatch/);
  });

  test("rejects a local set whose item count differs from the sealed eval", () => {
    const hash =
      "2ea9bd744d1a8ffd80976ca92858af70abcd6acbf330f78716b5b89563c4bdc9";
    expect(() =>
      verifyPlaintextSetAgainstCommitment(oneItem, {
        sha256Plaintext: hash,
        sha256Ciphertext: "00",
        walrusBlobId: "blob",
        modelTarget: "model",
        setSize: 2,
      }),
    ).toThrow(/set size mismatch/);
  });
});
