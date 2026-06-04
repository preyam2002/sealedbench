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

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-14 sm:px-8">
      <header className="rise flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <div className="tag text-seal">Sui · Walrus · Seal · Nautilus</div>
          <h1 className="display mt-3 text-5xl leading-[0.95] text-ink sm:text-6xl">
            Sealed<span className="italic text-seal">Bench</span>
          </h1>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted">
            A locked exam vault for AI benchmarks. Every score is run on a test
            set{" "}
            <span className="text-ink">
              provably sealed before the model existed
            </span>{" "}
            and{" "}
            <span className="text-ink">scored inside an attested enclave</span>{" "}
            nobody could tamper with. Two independent lies — contamination and
            dishonest grading — both closed.
          </p>
        </div>
        <div style={{ animation: "seal-pulse 6s ease-in-out infinite" }}>
          <SealMark size={120} />
        </div>
      </header>

      <section className="rise mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          { k: "Network", v: NETWORK },
          { k: "Sealed benchmarks", v: String(sealedCount) },
          { k: "Attested scores", v: String(scoreCount) },
          { k: "Package", v: shortId(PACKAGE_ID) },
        ].map((s) => (
          <div key={s.k} className="bg-panel px-4 py-4">
            <div className="tag text-faint">{s.k}</div>
            <div className="mono mt-1 truncate text-sm text-ink">{s.v}</div>
          </div>
        ))}
      </section>

      <div className="mt-12 flex items-baseline justify-between">
        <h2 className="display text-2xl text-ink">The ledger</h2>
        <a
          href={suiscanObjectUrl(NETWORK, PACKAGE_ID)}
          target="_blank"
          rel="noreferrer"
          className="tag text-faint hover:text-seal"
        >
          on-chain package↗
        </a>
      </div>

      {error ? (
        <div className="panel mono mt-4 rounded-md p-6 text-sm text-amber">
          Could not reach the {NETWORK} fullnode: {error}
        </div>
      ) : (
        <div className="mt-4">
          <Leaderboard
            rows={rows}
            network={NETWORK}
            registeredEnclavePk={REGISTERED_ENCLAVE_PK || undefined}
          />
        </div>
      )}

      <section className="rise mt-16 grid gap-5 sm:grid-cols-2">
        <div className="panel rounded-md p-5">
          <div className="tag text-seal">What the seal proves</div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A specific test set (by SHA-256) was committed on-chain at a
            specific time, before a stated cutoff, and never released in
            plaintext. It does not prove the content is a good benchmark, nor
            that the author kept no private copy.
          </p>
        </div>
        <div className="panel rounded-md p-5">
          <div className="tag text-verified">What the TEE proves</div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The posted score came from the exact attested code, on the exact
            decrypted set, against the exact endpoint, with no cherry-picking —
            the run was honest. It does not prove the endpoint served the same
            weights as a public release.
          </p>
        </div>
      </section>

      <footer className="mt-16 border-t border-line pt-6">
        <p className="mono text-xs text-faint">
          SealedBench · provenance is a property of timestamps and hashes;
          honesty is a property of remote attestation. No mocks — every id
          resolves on-chain.
        </p>
      </footer>
    </main>
  );
}
