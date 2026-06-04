import { provenanceVerdict } from "@/lib/badges";
import { formatDate, type Network } from "@/lib/format";
import type { SealedEval } from "@/lib/types";

export function ProvenanceBadge({
  evalObj,
}: {
  evalObj: SealedEval;
  network?: Network;
}) {
  const verdict = provenanceVerdict(evalObj);
  const clean = verdict.cutoffBeforeSeal || verdict.sealedBeforeCutoff;
  return (
    <div className="panel rounded-sm px-3 py-2">
      <div className="tag text-faint">Provenance</div>
      <div className="mono mt-1 text-[0.72rem] text-muted">
        sealed {formatDate(evalObj.sealedAtMs)} · cutoff{" "}
        {formatDate(evalObj.cutoffTsMs)}
      </div>
      <div
        className={`mt-1 text-[0.8rem] ${clean ? "text-verified" : "text-danger"}`}
      >
        {clean ? "✓" : "✗"} {verdict.label}
      </div>
    </div>
  );
}
