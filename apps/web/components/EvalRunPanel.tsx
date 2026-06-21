"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Network, suiscanObjectUrl, suiscanTxUrl } from "@/lib/format";
import type { RunReadiness } from "@/lib/run-readiness";
import type { RunJob } from "@/lib/types";

type StartState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "error"; message: string };

function isActive(job: RunJob | null): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function EvalRunPanel({
  evalId,
  network,
  readiness,
}: {
  evalId: string;
  network: Network;
  readiness: RunReadiness;
}) {
  const router = useRouter();
  const [state, setState] = useState<StartState>({ status: "idle" });
  const [job, setJob] = useState<RunJob | null>(null);
  const refreshedJob = useRef<string | null>(null);

  async function startRun() {
    setState({ status: "starting" });
    try {
      const res = await fetch("/api/evaluations/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evalId }),
      });
      const body = (await res.json()) as { job?: RunJob; error?: string };
      if (!res.ok || !body.job) {
        throw new Error(body.error ?? `run failed: HTTP ${res.status}`);
      }
      setJob(body.job);
      setState({ status: "idle" });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  useEffect(() => {
    if (!job || !isActive(job)) {
      return;
    }
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/evaluations/jobs/${job.id}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { job?: RunJob };
      if (body.job) {
        setJob(body.job);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (job?.status === "complete" && refreshedJob.current !== job.id) {
      refreshedJob.current = job.id;
      router.refresh();
    }
  }, [job, router]);

  // Scoring is an operator action that needs a reachable enclave, so runs are
  // only enabled on the operator's local machine. On the public/serverless
  // deployment they're off — hide the panel entirely rather than show a dead
  // "not enabled" button, which reads as broken to anyone browsing the demo.
  if (!readiness.enabled) {
    return null;
  }

  const disabled = state.status === "starting" || isActive(job);

  return (
    <div className="rounded-sm border border-line bg-panel-2 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="tag text-verified">Run control</div>
        <button
          type="button"
          onClick={startRun}
          disabled={disabled}
          className="tag rounded-[2px] border border-line bg-panel px-2.5 py-1 text-faint transition-colors hover:border-seal hover:text-seal disabled:cursor-wait disabled:opacity-60"
        >
          {state.status === "starting"
            ? "Starting..."
            : isActive(job)
              ? "Running..."
              : "Run in enclave"}
        </button>
      </div>

      <div className="mono mt-3 text-[0.72rem] leading-relaxed text-muted">
        Starts the sealed Nitro scorer for this eval. The browser receives job
        logs and final proof links, not plaintext benchmark items.
      </div>

      {state.status === "error" ? (
        <div className="mono mt-3 border-t border-line-soft pt-2 text-[0.72rem] leading-relaxed text-danger">
          {state.message}
        </div>
      ) : null}

      {job ? (
        <div className="mt-3 border-t border-line-soft pt-3">
          <div className="mono flex items-center justify-between gap-3 text-[0.72rem]">
            <span className="text-muted">job</span>
            <span className="text-ink">{job.status}</span>
          </div>

          {job.error ? (
            <div className="mono mt-2 text-[0.72rem] leading-relaxed text-danger">
              {job.error}
            </div>
          ) : null}

          {job.digest || job.scoreId ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {job.digest ? (
                <a
                  href={suiscanTxUrl(network, job.digest)}
                  target="_blank"
                  rel="noreferrer"
                  className="tag text-muted transition-colors hover:text-seal"
                >
                  post_score tx↗
                </a>
              ) : null}
              {job.scoreId ? (
                <a
                  href={suiscanObjectUrl(network, job.scoreId)}
                  target="_blank"
                  rel="noreferrer"
                  className="tag text-muted transition-colors hover:text-seal"
                >
                  AttestedScore↗
                </a>
              ) : null}
            </div>
          ) : null}

          <pre className="mono mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-panel px-2.5 py-2 text-[0.68rem] leading-relaxed text-faint">
            {job.logs.length > 0 ? job.logs.join("\n") : "queued"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
