import { parseAssertEnclavePkArgs } from "./lib/assert-enclave-pk-args.ts";
import { createSuiClient } from "./lib/sui.ts";

type EnclaveFields = {
  pk: number[];
};

function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const args = parseAssertEnclavePkArgs(process.argv.slice(2));
  const attestationRes = await fetch(`${args.enclaveUrl}/get_attestation`);
  if (!attestationRes.ok) {
    throw new Error(
      `/get_attestation failed: HTTP ${attestationRes.status} ${await attestationRes.text()}`,
    );
  }
  const attestation = (await attestationRes.json()) as { public_key?: string };
  if (!attestation.public_key) {
    throw new Error("/get_attestation response missing public_key");
  }

  const client = createSuiClient(args.network);
  const object = await client.getObject({
    id: args.enclaveObject,
    options: { showContent: true },
  });
  const content = object.data?.content;
  if (content?.dataType !== "moveObject") {
    throw new Error(`object ${args.enclaveObject} has no Move content`);
  }
  const fields = content.fields as unknown as EnclaveFields;
  const onchainPk = bytesToHex(fields.pk);
  const enclavePk = attestation.public_key.replace(/^0x/, "").toLowerCase();
  if (onchainPk !== enclavePk) {
    throw new Error(
      `enclave pk mismatch: on-chain ${onchainPk} != HTTP ${enclavePk}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        enclaveObject: args.enclaveObject,
        publicKey: onchainPk,
        status: "match",
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
