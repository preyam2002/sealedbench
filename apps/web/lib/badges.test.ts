import { describe, expect, test } from "vitest";
import { attestationVerdict, bestScore, provenanceVerdict } from "./badges";
import { formatScore, scorePercent, shortId } from "./format";
import type { AttestedScore, SealedEval } from "./types";

const baseEval: SealedEval = {
  objectId: "0xeval",
  author: "0xauthor",
  sha256Plaintext: "aa",
  sha256Ciphertext: "bb",
  walrusBlobId: "blob",
  modelTarget: "m",
  setSize: 50,
  cutoffTsMs: 1_727_740_800_000,
  sealedAtMs: 1_780_614_147_218,
  sealPolicyId: "0xpolicy",
};

const baseScore: AttestedScore = {
  objectId: "0xscore",
  sealedEvalId: "0xeval",
  modelTarget: "m",
  scoreNum: 37,
  scoreDen: 50,
  itemsHash: "cc",
  traceBlobId: "trace",
  enclavePk: "0xABCD",
  postedAtMs: 1_780_000_000_000,
};

describe("provenanceVerdict", () => {
  test("model cutoff before seal is the strongest clean claim", () => {
    const v = provenanceVerdict(baseEval); // sealed 2026 > cutoff 2024
    expect(v.cutoffBeforeSeal).toBe(true);
    expect(v.sealedBeforeCutoff).toBe(false);
    expect(v.label).toContain("did not exist at cutoff");
  });

  test("sealed before cutoff is detected", () => {
    const v = provenanceVerdict({
      ...baseEval,
      sealedAtMs: 1_000,
      cutoffTsMs: 2_000,
    });
    expect(v.sealedBeforeCutoff).toBe(true);
    expect(v.cutoffBeforeSeal).toBe(false);
  });
});

describe("attestationVerdict", () => {
  test("attested by construction when no registry given", () => {
    expect(attestationVerdict(baseScore).status).toBe("attested");
  });

  test("matching registered enclave pk stays attested (case/0x-insensitive)", () => {
    expect(attestationVerdict(baseScore, "0xabcd").status).toBe("attested");
  });

  test("non-matching enclave pk is unverified", () => {
    expect(attestationVerdict(baseScore, "0xdead").status).toBe("unverified");
  });

  test("missing enclave pk is unverified", () => {
    expect(attestationVerdict({ ...baseScore, enclavePk: "" }).status).toBe(
      "unverified",
    );
  });
});

describe("bestScore + formatting", () => {
  test("bestScore picks the highest ratio", () => {
    const a = { ...baseScore, objectId: "a", scoreNum: 20, scoreDen: 50 };
    const b = { ...baseScore, objectId: "b", scoreNum: 45, scoreDen: 50 };
    expect(bestScore([a, b])?.objectId).toBe("b");
    expect(bestScore([])).toBeNull();
  });

  test("formatScore + scorePercent", () => {
    expect(formatScore(37, 50)).toBe("37/50 · 74%");
    expect(formatScore(0, 0)).toBe("—");
    expect(scorePercent(1, 4)).toBe(25);
  });

  test("shortId truncates", () => {
    expect(shortId("0x1234567890abcdef")).toBe("0x1234…cdef");
  });
});
