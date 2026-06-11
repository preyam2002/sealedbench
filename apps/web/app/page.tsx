import { Leaderboard } from "@/components/Leaderboard";
import { SealMark } from "@/components/SealMark";
import { NETWORK, PACKAGE_ID, REGISTERED_ENCLAVE_PK } from "@/lib/config";
import { shortId, suiscanObjectUrl } from "@/lib/format";
import { fetchLeaderboard } from "@/lib/queries";
import type { LeaderboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let rows: LeaderboardRow[] = [];
  let error: string | null = null;
  try {
    rows = await fetchLeaderboard();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const sealedCount = rows.length;
  const scoreCount = rows.reduce((n, r) => n + r.scores.length, 0);
  const fileNo = `SB-${NETWORK.slice(0, 3).toUpperCase()}-${String(
    sealedCount,
  ).padStart(4, "0")}`;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
      {/* Case-file masthead band */}
      <div className="rise mb-8 flex flex-wrap items-center justify-between gap-3 border-y border-line py-2.5">
        <div className="tag flex flex-wrap items-center gap-x-3 gap-y-1 text-faint">
          <span className="text-seal">CASE FILE</span>
          <span className="mono text-ink">{fileNo}</span>
          <span className="text-line">/</span>
          <span>CLASSIFICATION: SEALED</span>
        </div>
        <div className="tag flex items-center gap-3 text-faint">
          <span className="hidden sm:inline">DECLASSIFIED LEDGER</span>
          <span className="stamp stamp-blue text-[0.6rem]">NO. {fileNo}</span>
        </div>
      </div>

      <header className="rise flex flex-col items-start gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="tag text-seal">Sui · Walrus · Seal · Nautilus</div>
          <h1 className="display mt-3 text-6xl leading-[0.92] tracking-tight text-ink sm:text-7xl">
            Sealed<span className="italic text-seal">Bench</span>
          </h1>
          <p className="font-body mt-5 max-w-xl text-[1.05rem] leading-relaxed text-muted">
            A locked exam vault for AI benchmarks. Every posted score is tied to
            a test set{" "}
            <span className="font-medium italic text-ink">
              provably sealed before the model existed
            </span>{" "}
            and an{" "}
            <span className="font-medium italic text-ink">
              attested enclave signature
            </span>{" "}
            nobody could forge. Two independent lies —{" "}
            <span className="redact">contamination</span> and{" "}
            <span className="redact">dishonest grading</span> — both closed.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span
              className="stamp stamp-press text-[0.62rem]"
              style={{ ["--rot" as string]: "-5deg" }}
            >
              Sealed
            </span>
            <span
              className="stamp stamp-green stamp-press text-[0.62rem]"
              style={{ ["--rot" as string]: "3deg", animationDelay: "0.12s" }}
            >
              Attested
            </span>
            <span
              className="stamp stamp-blue stamp-press text-[0.62rem]"
              style={{ ["--rot" as string]: "-2deg", animationDelay: "0.24s" }}
            >
              On-Chain
            </span>
          </div>
        </div>
        <div
          className="shrink-0"
          style={{ animation: "seal-pulse 6s ease-in-out infinite" }}
        >
          <SealMark size={132} />
        </div>
      </header>

      {/* Evidence register — the dossier intake summary */}
      <section className="rise mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          { k: "Network", v: NETWORK },
          { k: "Sealed benchmarks", v: String(sealedCount) },
          { k: "Attested scores", v: String(scoreCount) },
          { k: "Package", v: shortId(PACKAGE_ID) },
        ].map((s) => (
          <div key={s.k} className="bg-panel px-4 py-4">
            <div className="tag text-faint">{s.k}</div>
            <div className="mono mt-1 truncate text-base text-ink">{s.v}</div>
          </div>
        ))}
      </section>

      <div className="mt-14 flex items-baseline justify-between border-b border-line pb-2">
        <h2 className="display text-3xl text-ink">
          The <span className="italic text-seal">ledger</span>
        </h2>
        <a
          href={suiscanObjectUrl(NETWORK, PACKAGE_ID)}
          target="_blank"
          rel="noreferrer"
          className="tag text-faint transition-colors hover:text-seal"
        >
          on-chain package↗
        </a>
      </div>

      {error ? (
        <div className="panel mono mt-4 rounded-md p-6 text-sm text-amber">
          Could not reach the {NETWORK} fullnode: {error}
        </div>
      ) : (
        <div className="mt-5">
          <Leaderboard
            rows={rows}
            network={NETWORK}
            registeredEnclavePk={REGISTERED_ENCLAVE_PK || undefined}
          />
        </div>
      )}

      <section className="rise mt-16 grid gap-5 sm:grid-cols-2">
        <div className="panel relative overflow-hidden rounded-md p-6">
          <span className="stamp text-[0.58rem] absolute right-4 top-4 rotate-[8deg]">
            Exhibit A
          </span>
          <div className="tag text-seal">What the seal proves</div>
          <p className="font-body mt-3 text-[0.98rem] leading-relaxed text-muted">
            A specific test set (by SHA-256) was committed on-chain at a
            specific time, before a stated cutoff, and never released in
            plaintext.{" "}
            <span className="text-ink">
              It does not prove the content is a good benchmark, nor that the
              author kept no private copy.
            </span>
          </p>
        </div>
        <div className="panel relative overflow-hidden rounded-md p-6">
          <span className="stamp stamp-green text-[0.58rem] absolute right-4 top-4 rotate-[8deg]">
            Exhibit B
          </span>
          <div className="tag text-verified">What the TEE proves</div>
          <p className="font-body mt-3 text-[0.98rem] leading-relaxed text-muted">
            The posted score came from the exact attested code, on the exact
            decrypted set, against the exact endpoint, with no cherry-picking —
            the run was honest.{" "}
            <span className="text-ink">
              It does not prove the endpoint served the same weights as a public
              release.
            </span>
          </p>
        </div>
      </section>

      <footer className="mt-16 pt-6">
        <div className="perf h-3 bg-line" aria-hidden />
        <p className="mono mt-5 text-xs leading-relaxed text-faint">
          SealedBench · provenance is a property of timestamps and hashes;
          honesty is a property of remote attestation. Live ids resolve
          on-chain; remaining gates are explicit.
        </p>
      </footer>
    </main>
  );
}
