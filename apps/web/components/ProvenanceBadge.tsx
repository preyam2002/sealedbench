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
    <div className="rounded-sm border border-line bg-panel-2 px-3 py-2.5">
      <div className="tag text-stamp-blue">Provenance</div>
      <div className="mono mt-1.5 text-[0.72rem] text-muted">
        sealed {formatDate(evalObj.sealedAtMs)} · cutoff{" "}
        {formatDate(evalObj.cutoffTsMs)}
      </div>
      <div
        className={`mono mt-1.5 text-[0.78rem] font-medium ${clean ? "text-verified" : "text-danger"}`}
      >
        {clean ? "✓" : "✗"} {verdict.label}
      </div>
    </div>
  );
}
