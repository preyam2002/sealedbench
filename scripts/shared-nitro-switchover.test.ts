import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const script = readFileSync("enclave/shared-host-switchover.sh", "utf8");
const makefile = readFileSync("enclave/Makefile", "utf8");

describe("shared Nitro host switchover helper", () => {
  test("requires explicit approval before stopping Aegis", () => {
    expect(script).toContain("SEALEDBENCH_ALLOW_AEGIS_STOP");
    expect(script).toContain("Refusing to stop Aegis");
  });

  test("terminates only the named Aegis enclave, never all enclaves", () => {
    expect(script).toContain("aegis-enclave");
    expect(script).toContain("terminate-enclave --enclave-id");
    expect(script).not.toContain("terminate-enclave --all");
    expect(makefile).toContain("ENCLAVE_NAME ?= sealedbench-enclave");
    expect(makefile).toContain("terminate-enclave --enclave-id");
    expect(makefile).not.toContain("terminate-enclave --all");
  });

  test("restores the Aegis inbound bridge on its original localhost port", () => {
    expect(script).toContain("aegis-inbound-proxy.service");
    expect(script).toContain("TCP-LISTEN:3000,bind=127.0.0.1");
    expect(script).toContain("VSOCK-CONNECT:16:3000");
  });
});
