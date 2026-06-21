import { describe, expect, test } from "vitest";
import { MODEL_ARTIFACT, verifyModelArtifact } from "./fetch-oss-model.ts";

describe("OSS model artifact verifier", () => {
  test("pins the expected SmolLM2 artifact", () => {
    expect(MODEL_ARTIFACT.repo).toBe(
      "enacimie/SmolLM2-135M-Instruct-Q2_K-GGUF",
    );
    expect(MODEL_ARTIFACT.revision).toBe(
      "013b8f77eeab23a8bcaa34fb221e7d646879bc40",
    );
    expect(MODEL_ARTIFACT.file).toBe("smollm2-135m-instruct-q2_k.gguf");
    expect(MODEL_ARTIFACT.size).toBe(88202208);
    expect(MODEL_ARTIFACT.sha256).toBe(
      "f35d6de965cf283cf1fca70dd08aeb0a825e57c616092a257f15e78108c8326b",
    );
  });

  test("rejects size mismatch", () => {
    expect(() =>
      verifyModelArtifact({
        size: 1,
        sha256: MODEL_ARTIFACT.sha256,
      }),
    ).toThrow("model size mismatch");
  });

  test("rejects hash mismatch", () => {
    expect(() =>
      verifyModelArtifact({
        size: MODEL_ARTIFACT.size,
        sha256: "0".repeat(64),
      }),
    ).toThrow("model sha256 mismatch");
  });
});
