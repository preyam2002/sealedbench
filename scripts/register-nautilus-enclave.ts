import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { loadDeployment } from "@sealedbench/shared";
import {
  type Pcrs,
  parseRegisterEnclaveArgs,
  readPcrsFromObject,
} from "./lib/register-nautilus-enclave-args.ts";
import { createSuiClient, hexToBytes, loadKeypair } from "./lib/sui.ts";

async function loadPcrs(path: string | undefined): Promise<Pcrs> {
  if (
    process.env.SEALEDBENCH_PCR0 &&
    process.env.SEALEDBENCH_PCR1 &&
    process.env.SEALEDBENCH_PCR2
  ) {
    return readPcrsFromObject({
      pcr0: process.env.SEALEDBENCH_PCR0,
      pcr1: process.env.SEALEDBENCH_PCR1,
      pcr2: process.env.SEALEDBENCH_PCR2,
    });
  }
  const pcrPath = resolve(path ?? "enclave/out/pcr-values.json");
  const parsed = JSON.parse(await readFile(pcrPath, "utf8")) as {
    pcr0?: string;
    pcr1?: string;
    pcr2?: string;
  };
  return readPcrsFromObject(parsed);
}

async function loadAttestationBytes(
  base64: string | undefined,
  path: string | undefined,
): Promise<Uint8Array> {
  if (base64) {
    return fromBase64(base64);
  }
  if (path) {
    const parsed = JSON.parse(await readFile(resolve(path), "utf8")) as {
      attestation?: string;
    };
    if (!parsed.attestation) {
      throw new Error("--attestation-path JSON must contain attestation");
    }
    return fromBase64(parsed.attestation);
  }
  throw new Error(
    "set SEALEDBENCH_ATTESTATION_BASE64 or pass --attestation-path <json>",
  );
}

function findCreatedObject(
  changes: unknown[] | null | undefined,
  typeFragment: string,
): string | undefined {
  const created = (changes ?? []).find(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      "type" in change &&
      change.type === "created" &&
      "objectType" in change &&
      typeof change.objectType === "string" &&
      change.objectType.includes(typeFragment) &&
      "objectId" in change,
  ) as { objectId?: string } | undefined;
  return created?.objectId;
}

async function main(): Promise<void> {
  const args = parseRegisterEnclaveArgs(process.argv.slice(2));
  const deployment = await loadDeployment(args.network);
  const packageId = deployment.packageId;
  const enclavePackageId = deployment.enclavePackageId ?? packageId;
  const typeArg = args.typeArg ?? `${packageId}::attestation::SEALEDBENCH`;
  const pcrs = await loadPcrs(args.pcrsJson);
  const attestationBytes = await loadAttestationBytes(
    args.attestationBase64,
    args.attestationPath,
  );
  const keypair = await loadKeypair();
  const client = createSuiClient(args.network);

  let configId = args.configId;
  if (!configId) {
    const capId = args.capId ?? deployment.enclaveCapId;
    if (!capId) {
      throw new Error(
        "missing enclave Cap id; pass --cap-id or set deployment.enclaveCapId after publishing attestation::init",
      );
    }
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::attestation::create_enclave_config`,
      arguments: [
        tx.object(capId),
        tx.pure.string(args.name),
        tx.pure.vector("u8", Array.from(hexToBytes(pcrs.pcr0))),
        tx.pure.vector("u8", Array.from(hexToBytes(pcrs.pcr1))),
        tx.pure.vector("u8", Array.from(hexToBytes(pcrs.pcr2))),
      ],
    });
    const created = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });
    if (created.effects?.status?.status !== "success") {
      throw new Error(
        `create_enclave_config failed: ${JSON.stringify(created.effects?.status)}`,
      );
    }
    configId = findCreatedObject(
      created.objectChanges,
      "::enclave::EnclaveConfig<",
    );
    if (!configId) {
      throw new Error(
        `could not find created EnclaveConfig in ${created.digest}`,
      );
    }
    console.log(
      JSON.stringify(
        { step: "create_enclave_config", digest: created.digest, configId },
        null,
        2,
      ),
    );
  }

  const tx = new Transaction();
  const document = tx.moveCall({
    target: "0x2::nitro_attestation::load_nitro_attestation",
    arguments: [
      tx.pure.vector("u8", Array.from(attestationBytes)),
      tx.object(deployment.clockObjectId),
    ],
  });
  tx.moveCall({
    target: `${enclavePackageId}::enclave::register_enclave`,
    typeArguments: [typeArg],
    arguments: [tx.object(configId), document],
  });
  const registered = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (registered.effects?.status?.status !== "success") {
    throw new Error(
      `register_enclave failed: ${JSON.stringify(registered.effects?.status)}`,
    );
  }
  const enclaveId = findCreatedObject(
    registered.objectChanges,
    "::enclave::Enclave<",
  );
  console.log(
    JSON.stringify(
      {
        step: "register_enclave",
        digest: registered.digest,
        configId,
        enclaveId,
        typeArg,
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
