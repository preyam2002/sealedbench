import { describe, expect, test } from "vitest";
import {
  buildEvaluateCommand,
  createJobStore,
  resolveRunConfig,
} from "./run-jobs";

describe("run job store", () => {
  test("creates and updates a job", () => {
    const store = createJobStore();
    const job = store.create("0xeval");

    expect(job.status).toBe("queued");
    store.markRunning(job.id);
    store.append(job.id, "started");
    store.complete(job.id, { scoreId: "0xscore", digest: "abc" });

    expect(store.get(job.id)?.status).toBe("complete");
    expect(store.get(job.id)?.logs).toContain("started");
    expect(store.get(job.id)?.scoreId).toBe("0xscore");
  });

  test("records failure", () => {
    const store = createJobStore();
    const job = store.create("0xeval");

    store.fail(job.id, "boom");

    expect(store.get(job.id)?.status).toBe("failed");
    expect(store.get(job.id)?.error).toBe("boom");
  });
});

describe("run config", () => {
  test("refuses disabled sealed runs", () => {
    expect(resolveRunConfig({}).ok).toBe(false);
  });

  test("builds the sealed evaluate-and-post command", () => {
    const config = resolveRunConfig({
      SEALEDBENCH_ENABLE_RUNS: "true",
      SEALEDBENCH_ENCLAVE_URL: "http://127.0.0.1:3321",
      SEALEDBENCH_ENCLAVE_OBJECT_ID: "0xenclave",
      SEALEDBENCH_REPO_ROOT: "/repo/sealedbench",
    });

    expect(config.ok).toBe(true);
    if (!config.ok) {
      throw new Error(config.error);
    }

    const command = buildEvaluateCommand("0xeval", config.config);

    expect(command.cwd).toBe("/repo/sealedbench");
    expect(command.command).toBe("pnpm");
    expect(command.args).toEqual([
      "tsx",
      "scripts/evaluate-and-post.ts",
      "--network",
      "testnet",
      "--sealed-eval",
      "0xeval",
      "--sealed",
      "--execute",
      "--enclave-object",
      "0xenclave",
      "--enclave",
      "http://127.0.0.1:3321",
      "--provider",
      "openai",
      "--endpoint",
      "http://127.0.0.1:8081",
      "--model",
      "smollm2-135m-instruct-q2_k",
    ]);
  });
});
