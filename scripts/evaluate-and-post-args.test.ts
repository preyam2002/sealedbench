import { describe, expect, test } from "vitest";
import {
  assertEvaluateAndPostMode,
  parseEvaluateAndPostArgs,
} from "./lib/evaluate-and-post-args.ts";

describe("parseEvaluateAndPostArgs", () => {
  test("defaults to the OpenAI-compatible provider", () => {
    expect(parseEvaluateAndPostArgs(["--sealed-eval", "0xabc"])).toMatchObject({
      sealedEval: "0xabc",
      provider: "openai",
    });
  });

  test("allows deployment seed fallback", () => {
    expect(parseEvaluateAndPostArgs([])).toMatchObject({
      sealedEval: undefined,
      provider: "openai",
    });
  });

  test("accepts the Anthropic provider", () => {
    expect(
      parseEvaluateAndPostArgs([
        "--sealed-eval",
        "0xabc",
        "--provider",
        "anthropic",
      ]),
    ).toMatchObject({
      sealedEval: "0xabc",
      provider: "anthropic",
    });
  });

  test("parses execute mode with an enclave object", () => {
    expect(
      parseEvaluateAndPostArgs([
        "--sealed-eval",
        "0xabc",
        "--execute",
        "--enclave-object",
        "0xdef",
      ]),
    ).toMatchObject({
      execute: true,
      enclaveObject: "0xdef",
    });
  });

  test("requires explicit plaintext mode for the local pipeline", () => {
    const args = parseEvaluateAndPostArgs(["--sealed-eval", "0xabc"]);
    expect(() => assertEvaluateAndPostMode(args)).toThrow(
      /--allow-plaintext-items/,
    );
  });

  test("blocks on-chain execution while plaintext items are used", () => {
    const args = parseEvaluateAndPostArgs([
      "--sealed-eval",
      "0xabc",
      "--allow-plaintext-items",
      "--execute",
      "--enclave-object",
      "0xdef",
    ]);
    expect(args).toMatchObject({ allowPlaintextItems: true, execute: true });
    expect(() => assertEvaluateAndPostMode(args)).toThrow(/--execute/);
  });

  test("allows explicit local plaintext evaluation without execute", () => {
    const args = parseEvaluateAndPostArgs([
      "--sealed-eval",
      "0xabc",
      "--allow-plaintext-items",
    ]);
    expect(args).toMatchObject({ allowPlaintextItems: true, execute: false });
    expect(() => assertEvaluateAndPostMode(args)).not.toThrow();
  });
});
