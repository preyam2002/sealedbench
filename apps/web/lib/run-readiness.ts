export type RunReadiness =
  | { enabled: true }
  | {
      enabled: false;
      reason: string;
      setupCommand: string;
    };

export function formatSetupCommand(evalId: string): string {
  return `pnpm live:nitro-run --setup-frontend --sealed-eval ${evalId}`;
}

export function resolveRunReadiness(
  env: Record<string, string | undefined> = process.env,
): RunReadiness {
  const setupCommand =
    "pnpm live:nitro-run --setup-frontend --sealed-eval <selected-eval-id>";
  if (env.SEALEDBENCH_ENABLE_RUNS !== "true") {
    return {
      enabled: false,
      reason: "sealed runs are not enabled on this server",
      setupCommand,
    };
  }
  if (!env.SEALEDBENCH_ENCLAVE_URL || !env.SEALEDBENCH_ENCLAVE_OBJECT_ID) {
    return {
      enabled: false,
      reason:
        "sealed runs need SEALEDBENCH_ENCLAVE_URL and SEALEDBENCH_ENCLAVE_OBJECT_ID",
      setupCommand,
    };
  }
  return { enabled: true };
}
