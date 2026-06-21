import { describe, expect, test } from "vitest";
import {
  defaultSelectedEvalId,
  rowById,
  sortRowsBySealDate,
} from "./eval-selection";

describe("eval explorer selection", () => {
  const rows = [
    { eval: { objectId: "old", sealedAtMs: 1 }, scores: [] },
    { eval: { objectId: "new", sealedAtMs: 3 }, scores: [] },
  ] as never;

  test("sorts newest sealed eval first", () => {
    expect(sortRowsBySealDate(rows).map((row) => row.eval.objectId)).toEqual([
      "new",
      "old",
    ]);
  });

  test("defaults to first sorted row", () => {
    expect(defaultSelectedEvalId(rows)).toBe("new");
    expect(defaultSelectedEvalId([])).toBe("");
  });

  test("finds rows case-insensitively", () => {
    expect(rowById(rows, "NEW")?.eval.objectId).toBe("new");
  });
});
