import { bestScore } from "@/lib/badges";
import {
  formatScore,
  type Network,
  scorePercent,
  shortId,
  suiscanObjectUrl,
  walrusBlobUrl,
} from "@/lib/format";
import type { AttestedScore, LeaderboardRow } from "@/lib/types";
import { AttestationBadge } from "./AttestationBadge";
import { ProvenanceBadge } from "./ProvenanceBadge";

function ScoreRow({
  score,
  network,
  leader,
}: {
  score: AttestedScore;
  network: Network;
  leader: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="mono w-40 shrink-0 truncate text-[0.82rem] text-ink">
        {score.modelTarget}
      </div>
      <div className="relative h-2.5 grow overflow-hidden rounded-[2px] border border-line bg-panel-2">
        <div
          className="score-bar absolute inset-y-0 left-0 rounded-[1px]"
          style={{
            width: `${Math.max(2, scorePercent(score.scoreNum, score.scoreDen))}%`,
          }}
        />
      </div>
      <div
        className={`mono w-28 shrink-0 text-right text-sm font-medium ${leader ? "text-verified" : "text-ink"}`}
      >
        {formatScore(score.scoreNum, score.scoreDen)}
      </div>
      <a
        href={suiscanObjectUrl(network, score.objectId)}
        target="_blank"
        rel="noreferrer"
        className="tag w-16 shrink-0 text-faint transition-colors hover:text-seal"
      >
        score↗
      </a>
      {score.traceBlobId ? (
        <a
          href={walrusBlobUrl(network, score.traceBlobId)}
          target="_blank"
          rel="noreferrer"
          className="tag w-14 shrink-0 text-faint transition-colors hover:text-seal"
        >
          trace↗
        </a>
      ) : null}
    </div>
  );
}

function BenchmarkCard({
  row,
  index,
  network,
  registeredEnclavePk,
}: {
  row: LeaderboardRow;
  index: number;
  network: Network;
  registeredEnclavePk?: string;
}) {
  const { eval: evalObj, scores } = row;
  const leader = bestScore(scores);
  return (
    <article
      className="panel rise relative rounded-md p-5 sm:p-6"
      style={{ animationDelay: `${0.08 * index + 0.1}s` }}
    >
      {/* file tab + record index */}
      <div className="mono absolute -top-px right-5 -translate-y-full rounded-t-sm border border-b-0 border-line bg-panel px-3 py-1 text-[0.62rem] tracking-[0.18em] text-faint">
        REC-{String(index + 1).padStart(3, "0")}
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="tag text-seal">Sealed benchmark</div>
          <h2 className="display mt-1.5 text-2xl text-ink">
            {evalObj.modelTarget}
          </h2>
          <div className="mono mt-1.5 text-xs text-muted">
            {evalObj.setSize} held-out items · sha256{" "}
            <span className="text-ink">
              {shortId(`0x${evalObj.sha256Plaintext}`, 6, 6)}
            </span>
          </div>
        </div>
        <AttestationBadge
          scores={scores}
          registeredEnclavePk={registeredEnclavePk}
        />
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          {scores.length === 0 ? (
            <div className="mono rounded-sm border border-dashed border-line bg-panel-2 px-3 py-4 text-sm text-faint">
              No attested scores yet. Once the registered Nautilus enclave
              decrypts the sealed set, signed scores appear here.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-line-soft)]">
              {scores.map((s) => (
                <ScoreRow
                  key={s.objectId}
                  score={s}
                  network={network}
                  leader={leader?.objectId === s.objectId}
                />
              ))}
            </div>
          )}
        </div>
        <ProvenanceBadge evalObj={evalObj} network={network} />
      </div>

      <footer className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-soft pt-3 text-xs">
        <span className="tag text-faint">Evidence →</span>
        <a
          href={suiscanObjectUrl(network, evalObj.objectId)}
          target="_blank"
          rel="noreferrer"
          className="tag text-muted transition-colors hover:text-seal"
        >
          SealedEval↗
        </a>
        <a
          href={walrusBlobUrl(network, evalObj.walrusBlobId)}
          target="_blank"
          rel="noreferrer"
          className="tag text-muted transition-colors hover:text-seal"
        >
          Walrus ciphertext↗
        </a>
      </footer>
    </article>
  );
}

export function Leaderboard({
  rows,
  network,
  registeredEnclavePk,
}: {
  rows: LeaderboardRow[];
  network: Network;
  registeredEnclavePk?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel mono rounded-md p-8 text-center text-muted">
        <div className="stamp mx-auto mb-3 w-fit rotate-[-4deg] text-[0.6rem]">
          Empty File
        </div>
        No sealed benchmarks found on {network}.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {rows.map((row, i) => (
        <BenchmarkCard
          key={row.eval.objectId}
          row={row}
          index={i}
          network={network}
          registeredEnclavePk={registeredEnclavePk}
        />
      ))}
    </div>
  );
}
