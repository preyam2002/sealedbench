import { describe, expect, test } from "vitest";
import { parseVerifyProvenanceArgs } from "./lib/verify-provenance-args.ts";

describe("parseVerifyProvenanceArgs", () => {
  test("defaults to testnet when --network is omitted", () => {
    expect(
      parseVerifyProvenanceArgs([
        "0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945",
      ]),
    ).toEqual({
      objectId:
        "0x75939409330882d86f54607e697557bdd5fbd596fb345467fd6ba483e1a0d945",
      network: "testnet",
      tamper: false,
    });
  });

  test("reads an explicit network flag", () => {
    expect(
      parseVerifyProvenanceArgs([
        "0xabc",
        "--network",
        "mainnet",
        "--tamper-test",
      ]),
    ).toEqual({
      objectId: "0xabc",
      network: "mainnet",
      tamper: true,
    });
  });
});
