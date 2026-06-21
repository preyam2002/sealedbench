import { describe, expect, test } from "vitest";
import { formatSetupCommand, resolveRunReadiness } from "./run-readiness";

describe("resolveRunReadiness", () => {
  test("reports setup required when sealed runs are disabled", () => {
    expect(resolveRunReadiness({})).toMatchObject({
      enabled: false,
      reason: "sealed runs are not enabled on this server",
    });
  });

  test("reports missing enclave config when runs are enabled partially", () => {
    expect(
      resolveRunReadiness({
        SEALEDBENCH_ENABLE_RUNS: "true",
        SEALEDBENCH_ENCLAVE_URL: "http://127.0.0.1:3321",
      }),
    ).toMatchObject({
      enabled: false,
      reason:
        "sealed runs need SEALEDBENCH_ENCLAVE_URL and SEALEDBENCH_ENCLAVE_OBJECT_ID",
    });
  });

  test("reports ready when the frontend has the registered enclave target", () => {
    expect(
      resolveRunReadiness({
        SEALEDBENCH_ENABLE_RUNS: "true",
        SEALEDBENCH_ENCLAVE_URL: "http://127.0.0.1:3321",
        SEALEDBENCH_ENCLAVE_OBJECT_ID: "0xabc",
      }),
    ).toEqual({ enabled: true });
  });

  test("renders the setup command for the selected eval", () => {
    expect(formatSetupCommand("0xabc")).toBe(
      "pnpm live:nitro-run --setup-frontend --sealed-eval 0xabc",
    );
  });
});
