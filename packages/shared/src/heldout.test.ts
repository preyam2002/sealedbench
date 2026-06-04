import { describe, expect, test } from "vitest";
import { validateHeldoutSetText } from "./heldout.ts";

const validLine = (id: string) =>
  JSON.stringify({
    id,
    question: `Question ${id}?`,
    answer: `Answer ${id}.`,
    rubric: `Credit exact answer ${id}.`,
  });

describe("validateHeldoutSetText", () => {
  test("accepts valid JSONL and returns a SHA-256 digest", () => {
    const result = validateHeldoutSetText(
      `${validLine("q1")}\n${validLine("q2")}\n`,
      {
        minItems: 2,
      },
    );

    expect(result.items).toHaveLength(2);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rejects missing required fields with the JSONL line number", () => {
    const text = JSON.stringify({
      id: "q1",
      question: "Question?",
      answer: "Answer.",
    });

    expect(() => validateHeldoutSetText(text, { minItems: 1 })).toThrow(
      'line 1 missing required key "rubric"',
    );
  });

  test("rejects duplicate ids", () => {
    expect(() =>
      validateHeldoutSetText(`${validLine("q1")}\n${validLine("q1")}`, {
        minItems: 2,
      }),
    ).toThrow('duplicate id "q1"');
  });

  test("requires the configured minimum number of items", () => {
    expect(() =>
      validateHeldoutSetText(validLine("q1"), { minItems: 2 }),
    ).toThrow("expected at least 2 items, found 1");
  });
});
