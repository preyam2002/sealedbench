import { describe, expect, test } from "vitest";
import {
  parseRegisterEnclaveArgs,
  readPcrsFromObject,
} from "./lib/register-nautilus-enclave-args.ts";

describe("parseRegisterEnclaveArgs", () => {
  test("defaults to testnet and the SealedBench enclave type", () => {
    expect(parseRegisterEnclaveArgs([])).toMatchObject({
      network: "testnet",
      name: "SealedBench scorer",
    });
  });

  test("validates PCR hex length", () => {
    expect(() =>
      readPcrsFromObject({ pcr0: "00", pcr1: "00", pcr2: "00" }),
    ).toThrow(/48-byte SHA-384/);
  });
});
