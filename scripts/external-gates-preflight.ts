import { access } from "node:fs/promises";
import { loadDeployment } from "@sealedbench/shared";
import {
  checkExternalGates,
  SEAL_CLIENT_SOURCE,
} from "./lib/external-gates-preflight.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const network =
    process.argv.includes("--mainnet") || process.env.SUI_NETWORK === "mainnet"
      ? "mainnet"
      : "testnet";
  const deployment = await loadDeployment(network);
  const candidatePaths = [
    process.env.SEALEDBENCH_PCRS_JSON ?? "enclave/out/pcr-values.json",
    process.env.SEALEDBENCH_ATTESTATION_PATH ?? "",
    process.env.SEALEDBENCH_LOCAL_MODEL_PATH ?? "",
    SEAL_CLIENT_SOURCE,
  ].filter(Boolean);
  const existingPaths = new Set<string>();
  await Promise.all(
    candidatePaths.map(async (path) => {
      if (await exists(path)) {
        existingPaths.add(path);
      }
    }),
  );

  const result = checkExternalGates({
    env: process.env,
    deployment,
    existingPaths,
  });
  console.log(JSON.stringify({ network, ...result }, null, 2));
  if (!result.ready) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
