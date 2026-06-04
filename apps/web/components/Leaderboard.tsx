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
    <div className="flex items-center gap-3 py-2">
      <div className="w-40 shrink-0 truncate text-sm">{score.modelTarget}</div>
      <div className="relative h-2 grow overflow-hidden rounded-full bg-panel-2">
        <div
          className="score-bar absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(2, scorePercent(score.scoreNum, score.scoreDen))}%`,
          }}
        />
      </div>
      <div
        className={`mono w-28 shrink-0 text-right text-sm ${leader ? "text-verified" : "text-ink"}`}
      >
        {formatScore(score.scoreNum, score.scoreDen)}
      </div>
      <a
        href={suiscanObjectUrl(network, score.objectId)}
        target="_blank"
        rel="noreferrer"
        className="tag w-16 shrink-0 text-faint hover:text-seal"
      >
        score↗
      </a>
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
      className="panel rise rounded-md p-5 sm:p-6"
      style={{ animationDelay: `${0.08 * index + 0.1}s` }}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="tag text-faint">Sealed benchmark</div>
          <h2 className="display mt-1 text-2xl text-ink">
            {evalObj.modelTarget}
          </h2>
          <div className="mono mt-1 text-xs text-muted">
            {evalObj.setSize} held-out items · sha256{" "}
            {shortId(`0x${evalObj.sha256Plaintext}`, 6, 6)}
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
            <div className="mono rounded-sm border border-dashed border-line px-3 py-4 text-sm text-faint">
              No attested scores yet. The Nautilus enclave decrypts the sealed
              set in-memory and posts a signed score here.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-line)]">
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

      <footer className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <a
          href={suiscanObjectUrl(network, evalObj.objectId)}
          target="_blank"
          rel="noreferrer"
          className="tag text-faint hover:text-seal"
        >
          SealedEval↗
        </a>
        <a
          href={walrusBlobUrl(network, evalObj.walrusBlobId)}
          target="_blank"
          rel="noreferrer"
          className="tag text-faint hover:text-seal"
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
