import { describe, expect, test } from "vitest";
import { filterActiveSealedEvals, parseAttestedScoreEvent } from "./queries";

describe("parseAttestedScoreEvent", () => {
  test("maps trace commitment fields from AttestedScorePosted events", () => {
    expect(
      parseAttestedScoreEvent({
        score_id: "0xscore",
        sealed_eval_id: "0xeval",
        model_target: "model-a",
        score_num: "37",
        score_den: "50",
        items_hash: Array.from({ length: 32 }, () => 7),
        trace_blob_id: "trace-blob",
        enclave_pk: [0xab, 0xcd],
        posted_at_ms: "1780000000000",
      }),
    ).toMatchObject({
      objectId: "0xscore",
      sealedEvalId: "0xeval",
      modelTarget: "model-a",
      scoreNum: 37,
      scoreDen: 50,
      itemsHash:
        "0707070707070707070707070707070707070707070707070707070707070707",
      traceBlobId: "trace-blob",
      enclavePk: "0xabcd",
      postedAtMs: 1780000000000,
    });
  });
});

describe("filterActiveSealedEvals", () => {
  test("keeps only active deployment records when configured", () => {
    const evals = [
      { objectId: "0xold", walrusBlobId: "expired" },
      { objectId: "0xactive", walrusBlobId: "live" },
    ];

    expect(
      filterActiveSealedEvals(evals as never, ["0xactive"]).map(
        (evalObj) => evalObj.objectId,
      ),
    ).toEqual(["0xactive"]);
  });
});
