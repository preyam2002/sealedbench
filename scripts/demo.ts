/**
 * Demo runner for docs/demo-script.md. Walks the verifiable story end-to-end:
 *   1. print the recorded on-chain artifacts (deployment + seal record),
 *   2. run verify-provenance.ts live against the seed SealedEval,
 *   3. run verify-trace.ts when an AttestedScore exists (else explain the gate).
 *
 * Usage:
 *   pnpm demo [--network testnet] [--attested-score <objectId>]
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadDeployment } from "@sealedbench/shared";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function step(title: string): void {
  console.log(`\n━━━ ${title} ━━━`);
}

function run(script: string, args: string[]): void {
  const result = spawnSync("node_modules/.bin/tsx", [script, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${script} exited with status ${result.status}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const network = (flag(argv, "--network") ?? "testnet") as
    | "testnet"
    | "mainnet";
  const attestedScore = flag(argv, "--attested-score");

  const deployment = await loadDeployment(network);
  const sealRecord = JSON.parse(
    await readFile(`deployments/seals/${network}-v1.json`, "utf8"),
  ) as { modelTarget?: string; cutoffTsMs?: number; setSize?: number };

  step("1/3 · Sealed benchmark artifacts on-chain");
  console.log(`network:        ${network}`);
  console.log(`package:        ${deployment.packageId}`);
  console.log(`SealedEval:     ${deployment.seedSealedEvalId}`);
  console.log(`Walrus blobId:  ${deployment.seedWalrusBlobId}`);
  console.log(`model target:   ${sealRecord.modelTarget}`);
  console.log(`set size:       ${sealRecord.setSize}`);
  console.log(
    `cutoff:         ${sealRecord.cutoffTsMs ? new Date(sealRecord.cutoffTsMs).toISOString() : "n/a"}`,
  );

  step("2/3 · Provenance: ciphertext on Walrus matches the on-chain seal");
  run("scripts/verify-provenance.ts", ["--network", network]);

  step("3/3 · Attested run trace matches its signed items_hash");
  if (attestedScore) {
    run("scripts/verify-trace.ts", [attestedScore, "--network", network]);
  } else {
    console.log(
      "no AttestedScore yet — posting one is gated on Nitro enclave registration",
    );
    console.log(
      "(pnpm preflight:gates shows the remaining blockers; pass --attested-score <id> once posted)",
    );
  }

  console.log("\ndemo complete ✓");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
