import { spawn } from "node:child_process";
import {
  assertLiveNitroApproval,
  buildLiveNitroPlan,
  extractRegisterResult,
  formatLiveCommand,
  type LiveCommand,
  parseLiveNitroRunArgs,
} from "./lib/live-nitro-run.ts";
import { loadEnv } from "./lib/load-env.ts";

type CommandResult = {
  stdout: string;
  stderr: string;
};

type RegisteredEnclave = {
  configId: string;
  digest: string;
  enclaveId: string;
};

function printable(command: LiveCommand): string {
  return formatLiveCommand(command);
}

async function runCommand(
  command: LiveCommand,
  options: { cwd?: string; inherit?: boolean } = {},
): Promise<CommandResult> {
  console.log(`\n# ${command.label}`);
  console.log(`$ ${printable(command)}`);
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command.command, command.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: options.inherit
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command.label} exited with code ${code}`));
      }
    });
  });
}

async function waitForEnclave(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health_check`);
      if (res.ok) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${url}/health_check: ${lastError}`);
}

function waitForStop(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

function frontendEnv(
  args: ReturnType<typeof parseLiveNitroRunArgs>,
  registered: RegisteredEnclave,
) {
  return {
    SEALEDBENCH_ENABLE_RUNS: "true",
    SEALEDBENCH_ENCLAVE_URL: args.localEnclaveUrl,
    SEALEDBENCH_ENCLAVE_OBJECT_ID: registered.enclaveId,
    SEALEDBENCH_REPO_ROOT: args.repoRoot,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseLiveNitroRunArgs(process.argv.slice(2));
  assertLiveNitroApproval(args);
  const plan = buildLiveNitroPlan(args);

  if (args.dryRun) {
    const entries = Object.entries(plan).filter(
      ([key]) => args.mode === "post-score" || key !== "evaluate",
    );
    console.log(
      JSON.stringify(
        Object.fromEntries(
          entries.map(([key, command]) => [
            key,
            command ? printable(command) : null,
          ]),
        ),
        null,
        2,
      ),
    );
    return;
  }

  let startAttempted = false;
  let tunnel: ReturnType<typeof spawn> | undefined;
  try {
    startAttempted = true;
    await runCommand(plan.remoteStart);
    await runCommand(plan.copyAttestation);
    await runCommand(plan.copyPcrs);

    const registered = extractRegisterResult(
      (await runCommand(plan.register, { cwd: args.repoRoot })).stdout,
    );
    const livePlan = buildLiveNitroPlan(args, registered.enclaveId);

    console.log(`\n# ${livePlan.tunnel.label}`);
    console.log(`$ ${printable(livePlan.tunnel)}`);
    tunnel = spawn(livePlan.tunnel.command, livePlan.tunnel.args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    tunnel.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    await waitForEnclave(args.localEnclaveUrl);

    await runCommand(livePlan.assert, { cwd: args.repoRoot });
    if (args.mode === "setup-frontend") {
      const env = frontendEnv(args, registered);
      console.log(
        JSON.stringify(
          {
            status: "frontend_ready",
            enclaveId: registered.enclaveId,
            configId: registered.configId,
            registerDigest: registered.digest,
            env,
            note: "Leave this process running while testing the frontend. Ctrl-C restores Aegis.",
          },
          null,
          2,
        ),
      );
      await waitForStop();
      return;
    }

    await runCommand(livePlan.evaluate, { cwd: args.repoRoot, inherit: true });
    console.log(
      JSON.stringify(
        {
          status: "posted",
          enclaveId: registered.enclaveId,
          configId: registered.configId,
          registerDigest: registered.digest,
        },
        null,
        2,
      ),
    );
  } finally {
    tunnel?.kill("SIGTERM");
    if (startAttempted && plan.remoteRestore) {
      await runCommand(plan.remoteRestore).catch((error) => {
        console.error(`restore failed: ${error}`);
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
