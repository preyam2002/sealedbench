"use client";

import { useState } from "react";
import { provenanceVerdict } from "@/lib/badges";
import { formatDate, type Network, shortId, walrusBlobUrl } from "@/lib/format";
import type { SealedEval } from "@/lib/types";
import { sha256Hex, verifyHash } from "@/lib/verify";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "match"; actual: string; bytes: number }
  | { status: "mismatch"; actual: string; bytes: number }
  | { status: "error"; message: string };

export function WalrusVerifier({
  evalObj,
  network,
}: {
  evalObj: SealedEval;
  network: Network;
}) {
  const [state, setState] = useState<VerifyState>({ status: "idle" });
  const url = walrusBlobUrl(network, evalObj.walrusBlobId);
  const provenance = provenanceVerdict(evalObj);

  async function verify() {
    setState({ status: "checking" });
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Walrus returned ${res.status}`);
      }
      const body = await res.arrayBuffer();
      const actual = await sha256Hex(body);
      const verdict = verifyHash(evalObj.sha256Ciphertext, actual);
      setState({
        status: verdict.matched ? "match" : "mismatch",
        actual,
        bytes: body.byteLength,
      });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const checked = state.status === "match" || state.status === "mismatch";

  return (
    <div className="rounded-sm border border-line bg-panel-2 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="tag text-stamp-blue">Walrus verify</div>
        <button
          type="button"
          onClick={verify}
          disabled={state.status === "checking"}
          className="tag rounded-[2px] border border-line bg-panel px-2.5 py-1 text-faint transition-colors hover:border-seal hover:text-seal disabled:cursor-wait disabled:opacity-60"
        >
          {state.status === "checking"
            ? "Hashing..."
            : checked
              ? "Verify again"
              : "Verify blob"}
        </button>
      </div>

      <div className="mono mt-3 grid gap-1.5 text-[0.72rem] text-muted">
        <div className="flex items-center justify-between gap-3">
          <span>on-chain</span>
          <span className="truncate text-ink">
            {shortId(`0x${evalObj.sha256Ciphertext}`, 8, 8)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>model cutoff</span>
          <span className="text-ink">{formatDate(evalObj.cutoffTsMs)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>sealed</span>
          <span className="text-ink">{formatDate(evalObj.sealedAtMs)}</span>
        </div>
      </div>

      {state.status === "idle" ? (
        <div className="mono mt-3 border-t border-line-soft pt-2 text-[0.72rem] leading-relaxed text-faint">
          Fetches the ciphertext from Walrus and checks its SHA-256 against Sui.
        </div>
      ) : null}

      {checked ? (
        <div className="mono mt-3 border-t border-line-soft pt-2 text-[0.72rem] leading-relaxed">
          <div className="flex items-center justify-between gap-2">
            <span
              className={
                state.status === "match"
                  ? "font-medium text-verified"
                  : "font-medium text-danger"
              }
            >
              {state.status === "match" ? "MATCH" : "MISMATCH"} ·{" "}
              {state.bytes.toLocaleString()} bytes
            </span>
            {state.status === "match" ? (
              <span
                className="stamp stamp-green stamp-press text-[0.5rem]"
                style={{ ["--rot" as string]: "-4deg" }}
              >
                Verified
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-muted">
            recomputed {shortId(`0x${state.actual}`, 8, 8)}
          </div>
          <div className="mt-1 text-muted">{provenance.label}</div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mono mt-3 border-t border-line-soft pt-2 text-[0.72rem] leading-relaxed text-danger">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
