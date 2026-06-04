import { PACKAGE_ID } from "./config";
import { suiClient } from "./sui";
import type { AttestedScore, LeaderboardRow, SealedEval } from "./types";

// Move vector<u8> in event JSON can arrive as a number[] or a base64 string.
function toHex(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
  if (typeof value === "string") {
    if (/^0x?[0-9a-fA-F]+$/.test(value)) {
      return value.replace(/^0x/, "").toLowerCase();
    }
    try {
      return Buffer.from(value, "base64").toString("hex");
    } catch {
      return value;
    }
  }
  return "";
}

export async function fetchSealedEvals(): Promise<SealedEval[]> {
  const client = suiClient();
  const events = await client.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::sealed_eval::SealedEvalCreated` },
    limit: 50,
    order: "descending",
  });
  return events.data.map((event) => {
    const j = event.parsedJson as Record<string, unknown>;
    return {
      objectId: String(j.eval_id),
      author: String(j.author),
      sha256Plaintext: toHex(j.sha256_plaintext),
      sha256Ciphertext: toHex(j.sha256_ciphertext),
      walrusBlobId: String(j.walrus_blob_id),
      modelTarget: String(j.model_target),
      setSize: Number(j.set_size),
      cutoffTsMs: Number(j.cutoff_ts_ms),
      sealedAtMs: Number(j.sealed_at_ms),
      sealPolicyId: String(j.seal_policy_id),
    };
  });
}

export async function fetchAttestedScores(): Promise<AttestedScore[]> {
  const client = suiClient();
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PACKAGE_ID}::attested_score::AttestedScorePosted`,
    },
    limit: 200,
    order: "descending",
  });
  return events.data.map((event) => {
    const j = event.parsedJson as Record<string, unknown>;
    return {
      objectId: String(j.score_id),
      sealedEvalId: String(j.sealed_eval_id),
      modelTarget: String(j.model_target),
      scoreNum: Number(j.score_num),
      scoreDen: Number(j.score_den),
      itemsHash: "",
      traceBlobId: "",
      enclavePk: `0x${toHex(j.enclave_pk)}`,
      postedAtMs: Number(j.posted_at_ms),
    };
  });
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const [evals, scores] = await Promise.all([
    fetchSealedEvals(),
    fetchAttestedScores(),
  ]);
  return evals.map((evalObj) => ({
    eval: evalObj,
    scores: scores.filter((s) => s.sealedEvalId === evalObj.objectId),
  }));
}
