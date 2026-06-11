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
      <span className="tag inline-flex items-center gap-2 rounded-sm border border-amber/40 px-2.5 py-1 text-amber">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
        awaiting attested scores
      </span>
    );
  }
  const attested = scores.filter(
    (s) => attestationVerdict(s, registeredEnclavePk).status === "attested",
  ).length;
  return (
    <span className="stamp stamp-green rotate-[-3deg] text-[0.6rem]">
      {attested} attested honest run{attested === 1 ? "" : "s"} ✓
    </span>
  );
}
