import { describe, expect, test } from "vitest";
import { parseAssertEnclavePkArgs } from "./lib/assert-enclave-pk-args.ts";

describe("parseAssertEnclavePkArgs", () => {
  test("requires an enclave object id", () => {
    expect(() => parseAssertEnclavePkArgs([])).toThrow(/--enclave-object/);
  });

  test("defaults to local enclave URL and testnet", () => {
    expect(
      parseAssertEnclavePkArgs(["--enclave-object", "0xabc"]),
    ).toMatchObject({
      enclaveObject: "0xabc",
      enclaveUrl: "http://127.0.0.1:3000",
      network: "testnet",
    });
  });
});
