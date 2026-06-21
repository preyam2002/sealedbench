import { describe, expect, test } from "vitest";
import { bytesToHex, normalizeHash, verifyHash } from "./verify";

describe("Walrus hash verification", () => {
  test("normalizes 0x-prefixed hashes before comparing", () => {
    expect(verifyHash("0xABCD", "abcd")).toEqual({
      matched: true,
      expected: "abcd",
      actual: "abcd",
    });
  });

  test("reports mismatches with normalized hashes", () => {
    expect(verifyHash("0xaaaa", "0xbbbb")).toEqual({
      matched: false,
      expected: "aaaa",
      actual: "bbbb",
    });
  });

  test("formats bytes as lower-case hex", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });

  test("normalizes whitespace and casing", () => {
    expect(normalizeHash("  0xA0b1  ")).toBe("a0b1");
  });
});
