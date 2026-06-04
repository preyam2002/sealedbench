import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { createSuiClient, type SealNetwork } from "@sealedbench/seal";

export type { SealNetwork };
export { createSuiClient };

const SUI_CONFIG_DIR = join(homedir(), ".sui", "sui_config");

/**
 * Load a signing keypair, preferring SUI_PRIVATE_KEY (a `suiprivkey1...`
 * string) and falling back to the local CLI keystore's active address.
 */
export async function loadKeypair(): Promise<Ed25519Keypair> {
  const envKey = process.env.SUI_PRIVATE_KEY;
  if (envKey) {
    const { secretKey } = decodeSuiPrivateKey(envKey.trim());
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  const activeAddress = await readActiveAddress();
  const keystore = JSON.parse(
    await readFile(join(SUI_CONFIG_DIR, "sui.keystore"), "utf8"),
  ) as string[];

  for (const entry of keystore) {
    const bytes = Buffer.from(entry, "base64");
    // Legacy keystore entries are [scheme_flag, ...secret]; 0x00 = ed25519.
    if (bytes[0] !== 0x00) {
      continue;
    }
    const keypair = Ed25519Keypair.fromSecretKey(
      new Uint8Array(bytes.subarray(1)),
    );
    if (keypair.getPublicKey().toSuiAddress() === activeAddress) {
      return keypair;
    }
  }

  throw new Error(
    `no ed25519 key in ${SUI_CONFIG_DIR}/sui.keystore matches active address ${activeAddress}; set SUI_PRIVATE_KEY instead`,
  );
}

async function readActiveAddress(): Promise<string> {
  const clientYaml = await readFile(
    join(SUI_CONFIG_DIR, "client.yaml"),
    "utf8",
  );
  const match = clientYaml.match(/active_address:\s*"?(0x[0-9a-fA-F]+)"?/);
  if (!match?.[1]) {
    throw new Error("could not read active_address from client.yaml");
  }
  return match[1];
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error(`odd-length hex: ${hex}`);
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
