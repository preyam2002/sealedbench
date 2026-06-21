"use client";

import { useMemo, useState } from "react";
import { bestScore } from "@/lib/badges";
import {
  defaultSelectedEvalId,
  rowById,
  sortRowsBySealDate,
} from "@/lib/eval-selection";
import {
  formatDate,
  formatScore,
  type Network,
  scorePercent,
  shortId,
  suiscanObjectUrl,
  walrusBlobUrl,
} from "@/lib/format";
import type { RunReadiness } from "@/lib/run-readiness";
import type { AttestedScore, LeaderboardRow } from "@/lib/types";
import { AttestationBadge } from "./AttestationBadge";
import { EvalRunPanel } from "./EvalRunPanel";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { TraceVerifier } from "./TraceVerifier";
import { WalrusVerifier } from "./WalrusVerifier";

function ScoreCard({
  score,
  network,
  leader,
}: {
  score: AttestedScore;
  network: Network;
  leader: boolean;
}) {
  return (
    <div className="rounded-sm border border-line bg-panel-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="mono min-w-0 truncate text-[0.82rem] text-ink">
          {score.modelTarget}
        </div>
        <div
          className={`mono text-sm font-medium ${leader ? "text-verified" : "text-ink"}`}
        >
          {formatScore(score.scoreNum, score.scoreDen)}
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-[2px] border border-line bg-panel">
        <div
          className="score-bar h-full rounded-[1px]"
          style={{
            width: `${Math.max(2, scorePercent(score.scoreNum, score.scoreDen))}%`,
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <a
          href={suiscanObjectUrl(network, score.objectId)}
          target="_blank"
          rel="noreferrer"
          className="tag text-muted transition-colors hover:text-seal"
        >
          score↗
        </a>
        {score.traceBlobId ? (
          <a
            href={walrusBlobUrl(network, score.traceBlobId)}
            target="_blank"
            rel="noreferrer"
            className="tag text-muted transition-colors hover:text-seal"
          >
            trace↗
          </a>
        ) : null}
        <span className="tag text-faint">
          posted {formatDate(score.postedAtMs)}
        </span>
      </div>
      {score.traceBlobId ? (
        <TraceVerifier score={score} network={network} />
      ) : null}
    </div>
  );
}

export function EvalExplorer({
  rows,
  network,
  registeredEnclavePk,
  runReadiness,
}: {
  rows: LeaderboardRow[];
  network: Network;
  registeredEnclavePk?: string;
  runReadiness: RunReadiness;
}) {
  const sortedRows = useMemo(() => sortRowsBySealDate(rows), [rows]);
  const [selectedId, setSelectedId] = useState(defaultSelectedEvalId(rows));
  const selected = rowById(sortedRows, selectedId) ?? sortedRows[0];

  if (!selected) {
    return (
      <div className="panel mono rounded-md p-8 text-center text-muted">
        <div className="stamp mx-auto mb-3 w-fit rotate-[-4deg] text-[0.6rem]">
          Empty File
        </div>
        No sealed benchmarks found on {network}.
      </div>
    );
  }

  const leader = bestScore(selected.scores);

  return (
    <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="panel rounded-md p-3">
        <div className="tag px-1 pb-3 text-seal">Eval files</div>
        <div className="grid gap-2">
          {sortedRows.map((row, index) => {
            const active = row.eval.objectId === selected.eval.objectId;
            return (
              <button
                type="button"
                key={row.eval.objectId}
                onClick={() => setSelectedId(row.eval.objectId)}
                className={`w-full rounded-sm border px-3 py-3 text-left transition-colors ${
                  active
                    ? "border-seal bg-panel-2"
                    : "border-line bg-panel hover:border-seal/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tag text-faint">
                    Eval-{String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mono text-[0.68rem] text-muted">
                    {row.scores.length} score
                    {row.scores.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mono mt-2 truncate text-[0.8rem] text-ink">
                  {row.eval.modelTarget}
                </div>
                <div className="mono mt-1 text-[0.68rem] text-muted">
                  {row.eval.setSize} items · sealed{" "}
                  {formatDate(row.eval.sealedAtMs)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <article className="panel rise relative rounded-md p-5 sm:p-6">
        <div className="mono absolute -top-px right-5 -translate-y-full rounded-t-sm border border-b-0 border-line bg-panel px-3 py-1 text-[0.62rem] tracking-[0.18em] text-faint">
          {shortId(selected.eval.objectId, 8, 6)}
        </div>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="tag text-seal">Selected sealed benchmark</div>
            <h2 className="display mt-1.5 break-words text-2xl text-ink">
              {selected.eval.modelTarget}
            </h2>
            <div className="mono mt-1.5 text-xs text-muted">
              {selected.eval.setSize} held-out items · sha256{" "}
              <span className="text-ink">
                {shortId(`0x${selected.eval.sha256Plaintext}`, 6, 6)}
              </span>
            </div>
          </div>
          <AttestationBadge
            scores={selected.scores}
            registeredEnclavePk={registeredEnclavePk}
          />
        </header>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            {selected.scores.length === 0 ? (
              <div className="mono rounded-sm border border-dashed border-line bg-panel-2 px-3 py-4 text-sm text-faint">
                No attested scores yet. Once the registered SealedBench Nitro
                enclave decrypts this eval, signed scores appear here.
              </div>
            ) : (
              <div className="grid gap-3">
                {selected.scores.map((score) => (
                  <ScoreCard
                    key={score.objectId}
                    score={score}
                    network={network}
                    leader={leader?.objectId === score.objectId}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="grid content-start gap-3">
            <ProvenanceBadge evalObj={selected.eval} network={network} />
            <WalrusVerifier evalObj={selected.eval} network={network} />
            <EvalRunPanel
              evalId={selected.eval.objectId}
              network={network}
              readiness={runReadiness}
            />
          </aside>
        </div>

        <footer className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-soft pt-3 text-xs">
          <span className="tag text-faint">Evidence →</span>
          <a
            href={suiscanObjectUrl(network, selected.eval.objectId)}
            target="_blank"
            rel="noreferrer"
            className="tag text-muted transition-colors hover:text-seal"
          >
            SealedEval↗
          </a>
          <a
            href={walrusBlobUrl(network, selected.eval.walrusBlobId)}
            target="_blank"
            rel="noreferrer"
            className="tag text-muted transition-colors hover:text-seal"
          >
            Walrus ciphertext↗
          </a>
        </footer>
      </article>
    </section>
  );
}
