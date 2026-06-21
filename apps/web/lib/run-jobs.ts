import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { RunJob } from "./types";

export type RunConfig = {
  network: "testnet" | "mainnet";
  enclaveUrl: string;
  enclaveObjectId: string;
  repoRoot: string;
  endpoint: string;
  model: string;
  provider: "openai";
};

export type RunConfigResult =
  | { ok: true; config: RunConfig }
  | { ok: false; error: string };

export type EvaluateCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export type RunJobStore = ReturnType<typeof createJobStore>;

type MutableRunJob = RunJob;

function now(): number {
  return Date.now();
}

export function createJobStore() {
  const jobs = new Map<string, MutableRunJob>();
  return {
    create(evalId: string): RunJob {
      const ts = now();
      const job: MutableRunJob = {
        id: randomUUID(),
        evalId,
        status: "queued",
        logs: [],
        createdAt: ts,
        updatedAt: ts,
      };
      jobs.set(job.id, job);
      return job;
    },
    get(id: string): RunJob | undefined {
      return jobs.get(id);
    },
    markRunning(id: string): void {
      const job = jobs.get(id);
      if (job) {
        job.status = "running";
        job.updatedAt = now();
      }
    },
    append(id: string, line: string): void {
      const job = jobs.get(id);
      if (job && line.trim().length > 0) {
        job.logs.push(line);
        job.updatedAt = now();
      }
    },
    complete(id: string, result: { scoreId?: string; digest?: string }): void {
      const job = jobs.get(id);
      if (job) {
        Object.assign(job, result, { status: "complete", updatedAt: now() });
      }
    },
    fail(id: string, error: string): void {
      const job = jobs.get(id);
      if (job) {
        Object.assign(job, { status: "failed", error, updatedAt: now() });
      }
    },
  };
}

function defaultRepoRoot(cwd = process.cwd()): string {
  const appSuffix = "/apps/web";
  return cwd.endsWith(appSuffix) ? cwd.slice(0, -appSuffix.length) : cwd;
}

function networkFromEnv(
  env: Record<string, string | undefined>,
): "testnet" | "mainnet" {
  return env.SUI_NETWORK === "mainnet" ||
    env.NEXT_PUBLIC_SUI_NETWORK === "mainnet"
    ? "mainnet"
    : "testnet";
}

export function resolveRunConfig(
  env: Record<string, string | undefined> = process.env,
): RunConfigResult {
  if (env.SEALEDBENCH_ENABLE_RUNS !== "true") {
    return { ok: false, error: "sealed runs are not enabled on this server" };
  }
  if (!env.SEALEDBENCH_ENCLAVE_URL || !env.SEALEDBENCH_ENCLAVE_OBJECT_ID) {
    return {
      ok: false,
      error:
        "sealed runs need SEALEDBENCH_ENCLAVE_URL and SEALEDBENCH_ENCLAVE_OBJECT_ID",
    };
  }
  return {
    ok: true,
    config: {
      network: networkFromEnv(env),
      enclaveUrl: env.SEALEDBENCH_ENCLAVE_URL,
      enclaveObjectId: env.SEALEDBENCH_ENCLAVE_OBJECT_ID,
      repoRoot: env.SEALEDBENCH_REPO_ROOT ?? defaultRepoRoot(),
      endpoint: env.SEALEDBENCH_MODEL_ENDPOINT ?? "http://127.0.0.1:8081",
      model: env.SEALEDBENCH_MODEL_ID ?? "smollm2-135m-instruct-q2_k",
      provider: "openai",
    },
  };
}

export function buildEvaluateCommand(
  evalId: string,
  config: RunConfig,
): EvaluateCommand {
  return {
    command: "pnpm",
    cwd: config.repoRoot,
    args: [
      "tsx",
      "scripts/evaluate-and-post.ts",
      "--network",
      config.network,
      "--sealed-eval",
      evalId,
      "--sealed",
      "--execute",
      "--enclave-object",
      config.enclaveObjectId,
      "--enclave",
      config.enclaveUrl,
      "--provider",
      config.provider,
      "--endpoint",
      config.endpoint,
      "--model",
      config.model,
    ],
  };
}

function appendChunk(store: RunJobStore, jobId: string, chunk: Buffer): void {
  for (const line of chunk.toString("utf8").split(/\r?\n/)) {
    store.append(jobId, line);
  }
}

function extractPostScoreResult(logs: string[]): {
  scoreId?: string;
  digest?: string;
} {
  const text = logs.join("\n");
  return {
    scoreId: /"scoreId":\s*"([^"]+)"/.exec(text)?.[1],
    digest: /"digest":\s*"([^"]+)"/.exec(text)?.[1],
  };
}

export function startSealedRun(
  job: RunJob,
  store: RunJobStore,
  config: RunConfig,
): void {
  const command = buildEvaluateCommand(job.evalId, config);
  store.markRunning(job.id);
  store.append(
    job.id,
    `$ ${command.command} ${command.args.join(" ")} (cwd ${command.cwd})`,
  );

  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => appendChunk(store, job.id, chunk));
  child.stderr.on("data", (chunk: Buffer) => appendChunk(store, job.id, chunk));
  child.on("error", (error) => store.fail(job.id, error.message));
  child.on("close", (code) => {
    if (code === 0) {
      store.complete(job.id, extractPostScoreResult(job.logs));
    } else {
      store.fail(job.id, `evaluate-and-post exited with code ${code}`);
    }
  });
}

const globalForJobs = globalThis as typeof globalThis & {
  __sealedbenchRunJobs?: RunJobStore;
};

export const runJobs = globalForJobs.__sealedbenchRunJobs ?? createJobStore();

globalForJobs.__sealedbenchRunJobs = runJobs;
