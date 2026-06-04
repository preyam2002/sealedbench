import type { AttestedScore, SealedEval } from "./types";

export type ProvenanceVerdict = {
  /** true if the on-chain seal timestamp is strictly before the model cutoff. */
  sealedBeforeCutoff: boolean;
  /** true if the model's cutoff precedes the seal (strongest clean claim). */
  cutoffBeforeSeal: boolean;
  gapMs: number;
  label: string;
};

export function provenanceVerdict(evalObj: SealedEval): ProvenanceVerdict {
  const { sealedAtMs, cutoffTsMs } = evalObj;
  const sealedBeforeCutoff = sealedAtMs < cutoffTsMs;
  const cutoffBeforeSeal = cutoffTsMs < sealedAtMs;
  return {
    sealedBeforeCutoff,
    cutoffBeforeSeal,
    gapMs: Math.abs(sealedAtMs - cutoffTsMs),
    label: cutoffBeforeSeal
      ? "model cutoff precedes seal — set did not exist at cutoff"
      : sealedBeforeCutoff
        ? "sealed before model cutoff"
        : "sealed at the model cutoff",
  };
}

export type AttestationStatus = "attested" | "unverified";

export type AttestationVerdict = {
  status: AttestationStatus;
  label: string;
};

/**
 * An AttestedScore can only exist on-chain if `post_score` verified the
 * enclave signature, so it is "attested" by construction. If a registered
 * enclave pk is known, a mismatch downgrades it to "unverified".
 */
export function attestationVerdict(
  score: AttestedScore,
  registeredEnclavePk?: string,
): AttestationVerdict {
  if (!score.enclavePk) {
    return { status: "unverified", label: "no enclave key" };
  }
  if (
    registeredEnclavePk &&
    normalizeHex(registeredEnclavePk) !== normalizeHex(score.enclavePk)
  ) {
    return { status: "unverified", label: "enclave key not recognized" };
  }
  return { status: "attested", label: "attested honest run" };
}

function normalizeHex(value: string): string {
  return value.toLowerCase().replace(/^0x/, "");
}

/** Best (highest) score for a leaderboard row, or null if none. */
export function bestScore(scores: AttestedScore[]): AttestedScore | null {
  let best: AttestedScore | null = null;
  for (const score of scores) {
    if (score.scoreDen <= 0) {
      continue;
    }
    if (
      !best ||
      score.scoreNum / score.scoreDen > best.scoreNum / best.scoreDen
    ) {
      best = score;
    }
  }
  return best;
}
