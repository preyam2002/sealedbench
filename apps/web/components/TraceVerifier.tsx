"use client";

import { useState } from "react";
import { type Network, shortId, walrusBlobUrl } from "@/lib/format";
import type { AttestedScore } from "@/lib/types";
import { sha256Hex, verifyHash } from "@/lib/verify";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "match"; actual: string; bytes: number }
  | { status: "mismatch"; actual: string; bytes: number }
  | { status: "error"; message: string };

export function TraceVerifier({
  score,
  network,
}: {
  score: AttestedScore;
  network: Network;
}) {
  const [state, setState] = useState<VerifyState>({ status: "idle" });
  const checked = state.status === "match" || state.status === "mismatch";

  async function verify() {
    setState({ status: "checking" });
    try {
      const res = await fetch(walrusBlobUrl(network, score.traceBlobId), {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Walrus returned ${res.status}`);
      }
      const body = await res.arrayBuffer();
      const actual = await sha256Hex(body);
      const verdict = verifyHash(score.itemsHash, actual);
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

  return (
    <div className="mono mt-3 border-t border-line-soft pt-3 text-[0.72rem]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-muted">
          trace hash{" "}
          <span className="text-ink">
            {shortId(`0x${score.itemsHash}`, 8, 8)}
          </span>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={state.status === "checking" || !score.traceBlobId}
          className="tag rounded-[2px] border border-line bg-panel px-2.5 py-1 text-faint transition-colors hover:border-seal hover:text-seal disabled:cursor-wait disabled:opacity-60"
        >
          {state.status === "checking"
            ? "Hashing..."
            : checked
              ? "Verify again"
              : "Verify trace"}
        </button>
      </div>

      {checked ? (
        <div className="mt-2 leading-relaxed">
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
                style={{ ["--rot" as string]: "-3deg" }}
              >
                Verified
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-muted">
            recomputed {shortId(`0x${state.actual}`, 8, 8)}
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-2 leading-relaxed text-danger">{state.message}</div>
      ) : null}
    </div>
  );
}
