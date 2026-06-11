import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Transaction } from "@mysten/sui/transactions";
import { deploymentPath, loadDeployment } from "@sealedbench/shared";
import { createSuiClient, loadKeypair } from "./lib/sui.ts";
import { parseUpgradePackageArgs } from "./lib/upgrade-package-args.ts";

const execFileAsync = promisify(execFile);
const COMPATIBLE_UPGRADE_POLICY = 0;
const UPGRADE_GAS_BUDGET = 1_000_000_000;

type BuildOutput = {
  modules: string[];
  dependencies: string[];
  digest: number[];
};

async function buildPackage(): Promise<BuildOutput> {
  let stdout = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      ({ stdout } = await execFileAsync(
        "sui",
        [
          "move",
          "build",
          "--path",
          "move/sealedbench",
          "--dump-bytecode-as-base64",
          "--with-unpublished-dependencies",
        ],
        {
          env: {
            ...process.env,
            MOVE_HOME:
              process.env.MOVE_HOME ?? "/private/tmp/sealedbench-move-home",
          },
          maxBuffer: 20 * 1024 * 1024,
        },
      ));
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 3) {
        throw lastError;
      }
    }
  }
  const jsonLine = stdout
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith('{"modules"'));
  if (!jsonLine) {
    throw new Error("sui move build did not print bytecode JSON");
  }
  return JSON.parse(jsonLine) as BuildOutput;
}

function findCreatedCap(
  changes: unknown[] | null | undefined,
): string | undefined {
  const created = (changes ?? []).find(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      "type" in change &&
      change.type === "created" &&
      "objectType" in change &&
      typeof change.objectType === "string" &&
      change.objectType.includes("::enclave::Cap<") &&
      change.objectType.includes("::attestation::SEALEDBENCH") &&
      "objectId" in change,
  ) as { objectId?: string } | undefined;
  return created?.objectId;
}

function findCreatedUpgradeCap(
  changes: unknown[] | null | undefined,
): string | undefined {
  const created = (changes ?? []).find(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      "type" in change &&
      change.type === "created" &&
      "objectType" in change &&
      change.objectType === "0x2::package::UpgradeCap" &&
      "objectId" in change,
  ) as { objectId?: string } | undefined;
  return created?.objectId;
}

function findPublishedPackage(
  changes: unknown[] | null | undefined,
): string | undefined {
  const published = (changes ?? []).find(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      "type" in change &&
      change.type === "published" &&
      "packageId" in change,
  ) as { packageId?: string } | undefined;
  return published?.packageId;
}

async function updateDeployment(
  network: "testnet" | "mainnet",
  patch: Record<string, unknown>,
): Promise<void> {
  const path = deploymentPath(network);
  const deployment = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    path,
    `${JSON.stringify({ ...deployment, ...patch }, null, 2)}\n`,
  );
}

async function publishFreshPackage(
  network: "testnet" | "mainnet",
  build: BuildOutput,
): Promise<void> {
  const keypair = await loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const tx = new Transaction();
  const upgradeCap = tx.publish({
    modules: build.modules,
    dependencies: build.dependencies,
  });
  tx.transferObjects([upgradeCap], tx.pure.address(sender));
  tx.setGasBudget(UPGRADE_GAS_BUDGET);

  const client = createSuiClient(network);
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (result.effects?.status?.status !== "success") {
    throw new Error(
      `publish failed (${result.digest}): ${JSON.stringify(result.effects?.status)}`,
    );
  }
  const packageId = findPublishedPackage(result.objectChanges);
  if (!packageId) {
    throw new Error(`could not find published package in ${result.digest}`);
  }
  const upgradeCapId = findCreatedUpgradeCap(result.objectChanges);
  const enclaveCapId = findCreatedCap(result.objectChanges);
  await updateDeployment(network, {
    packageId,
    publishDigest: result.digest,
    upgradeCapId: upgradeCapId ?? null,
    modules: [
      "enclave",
      "attestation",
      "sealed_eval",
      "attested_score",
      "seal_policy",
    ],
    enclavePackageId: packageId,
    seedSealedEvalId: undefined,
    seedWalrusBlobId: undefined,
    seedCreateDigest: undefined,
    seedPlaintextHash: undefined,
    ...(enclaveCapId ? { enclaveCapId } : {}),
  });
  console.log(
    JSON.stringify(
      {
        step: "publish_package",
        digest: result.digest,
        packageId,
        upgradeCapId,
        enclaveCapId,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseUpgradePackageArgs(process.argv.slice(2));
  const deployment = await loadDeployment(args.network);
  const build = await buildPackage();
  const summary = {
    network: args.network,
    mode: args.publishNew ? "publish_new" : "upgrade",
    packageId: deployment.packageId,
    modules: build.modules.length,
    dependencies: build.dependencies,
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }
  if (args.publishNew) {
    await publishFreshPackage(args.network, build);
    return;
  }
  if (!deployment.upgradeCapId) {
    throw new Error(`deployment ${args.network} has no upgradeCapId`);
  }

  const tx = new Transaction();
  const cap = tx.object(deployment.upgradeCapId);
  const ticket = tx.moveCall({
    target: "0x2::package::authorize_upgrade",
    arguments: [
      cap,
      tx.pure.u8(COMPATIBLE_UPGRADE_POLICY),
      tx.pure.vector("u8", build.digest),
    ],
  });
  const receipt = tx.upgrade({
    modules: build.modules,
    dependencies: build.dependencies,
    package: deployment.packageId,
    ticket,
  });
  tx.moveCall({
    target: "0x2::package::commit_upgrade",
    arguments: [cap, receipt],
  });
  tx.setGasBudget(UPGRADE_GAS_BUDGET);

  const keypair = await loadKeypair();
  const client = createSuiClient(args.network);
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (result.effects?.status?.status !== "success") {
    throw new Error(
      `upgrade failed (${result.digest}): ${JSON.stringify(result.effects?.status)}`,
    );
  }
  const enclaveCapId = findCreatedCap(result.objectChanges);
  await updateDeployment(args.network, {
    upgradeDigest: result.digest,
    modules: [
      "enclave",
      "attestation",
      "sealed_eval",
      "attested_score",
      "seal_policy",
    ],
    enclavePackageId: deployment.packageId,
    ...(enclaveCapId ? { enclaveCapId } : {}),
  });
  console.log(
    JSON.stringify(
      {
        step: "upgrade_package",
        digest: result.digest,
        packageId: deployment.packageId,
        enclaveCapId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
