import { describe, expect, test } from "vitest";
import { checkExternalGates } from "./lib/external-gates-preflight.ts";

const deployment = {
  packageId: "0xpackage",
  clockObjectId: "0x6",
  enclaveCapId: "0xcap",
  seedSealedEvalId: "0xeval",
};

describe("checkExternalGates", () => {
  test("reports missing model and Nitro inputs", () => {
    const result = checkExternalGates({
      env: {},
      deployment,
      existingPaths: new Set(),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("model_api_key");
    expect(result.blockers).toContain("nitro_pcrs");
    expect(result.blockers).toContain("nitro_attestation");
  });

  test("still blocks when in-enclave Seal decrypt is not ready", () => {
    const result = checkExternalGates({
      env: {
        ANTHROPIC_API_KEY: "sk-ant",
        SEALEDBENCH_ATTESTATION_PATH: "attestation.json",
      },
      deployment,
      existingPaths: new Set([
        "enclave/out/pcr-values.json",
        "attestation.json",
      ]),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(["in_enclave_seal_decrypt"]);
  });

  test("passes when all external and code gates are present", () => {
    const result = checkExternalGates({
      env: {
        ANTHROPIC_API_KEY: "sk-ant",
        SEALEDBENCH_ATTESTATION_PATH: "attestation.json",
      },
      deployment,
      existingPaths: new Set([
        "enclave/out/pcr-values.json",
        "attestation.json",
        "enclave/src/seal_client.rs",
      ]),
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  test("local oss model artifact satisfies model gate", () => {
    const result = checkExternalGates({
      env: {
        SEALEDBENCH_LOCAL_MODEL_PATH:
          "enclave/models/smollm2-135m-instruct-q2_k.gguf",
        SEALEDBENCH_ATTESTATION_PATH: "attestation.json",
      },
      deployment,
      existingPaths: new Set([
        "enclave/models/smollm2-135m-instruct-q2_k.gguf",
        "enclave/out/pcr-values.json",
        "attestation.json",
        "enclave/src/seal_client.rs",
      ]),
    });

    expect(result.ready).toBe(true);
    expect(result.checks.model_api_key).toBe(true);
  });

  test("accepts PCR and attestation values from env", () => {
    const pcr = "a".repeat(96);
    const result = checkExternalGates({
      env: {
        OPENAI_API_KEY: "sk-openai",
        SEALEDBENCH_PCR0: pcr,
        SEALEDBENCH_PCR1: pcr,
        SEALEDBENCH_PCR2: pcr,
        SEALEDBENCH_ATTESTATION_BASE64: "Zm9v",
      },
      deployment,
      existingPaths: new Set(["enclave/src/seal_client.rs"]),
    });

    expect(result.ready).toBe(true);
  });
});
