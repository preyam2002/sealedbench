import { attestationVerdict } from "@/lib/badges";
import type { AttestedScore } from "@/lib/types";

export function AttestationBadge({
  scores,
  registeredEnclavePk,
}: {
  scores: AttestedScore[];
  registeredEnclavePk?: string;
}) {
  if (scores.length === 0) {
    return (
      <span className="tag inline-flex items-center gap-2 text-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        awaiting attested scores
      </span>
    );
  }
  const attested = scores.filter(
    (s) => attestationVerdict(s, registeredEnclavePk).status === "attested",
  ).length;
  return (
    <span className="tag inline-flex items-center gap-2 text-verified">
      <span className="h-1.5 w-1.5 rounded-full bg-verified" />
      {attested} attested honest run{attested === 1 ? "" : "s"} ✓
    </span>
  );
}
