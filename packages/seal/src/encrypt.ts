import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DemType, EncryptedObject, SealClient } from "@mysten/seal";
import { validateHeldoutSetText } from "@sealedbench/shared";
import {
  createSuiClient,
  keyServerObjectIds,
  SEAL_KEY_SERVERS,
  type SealNetwork,
  type SuiRpcClient,
  sealNetworkFromEnv,
} from "./config.ts";

// Seal's DEM uses a fixed 96-bit-style IV (16 bytes) for AES-256-GCM; see
// `dem.ts` in @mysten/seal. We reproduce it to allow offline backup-key
// decryption of a real Seal EncryptedObject.
const SEAL_DEM_IV = new Uint8Array([
  138, 55, 153, 253, 198, 46, 121, 219, 160, 128, 89, 7, 214, 156, 148, 220,
]);

export type SealEncryptResult = {
  /** BCS-serialized Seal EncryptedObject — this is what goes to Walrus. */
  ciphertext: Uint8Array;
  /**
   * The 256-bit DEM key Seal derived for this object. It can decrypt the
   * ciphertext WITHOUT key servers, so it must never be persisted on-chain or
   * to Walrus. Used here only for offline round-trip verification + disaster
   * recovery.
   */
  backupKey: Uint8Array;
  sha256Plaintext: string;
  sha256Ciphertext: string;
  packageId: string;
  identity: string;
  threshold: number;
  keyServerObjectIds: string[];
};

export type SealEncryptOptions = {
  /** seal_approve namespace package id (hex). */
  packageId: string;
  /** IBE identity the policy gates on (hex). */
  identity: string;
  network?: SealNetwork;
  /** Defaults to the number of configured key servers. */
  threshold?: number;
  sealClient?: SealClient;
  suiClient?: SuiRpcClient;
  fullnodeUrl?: string;
};

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function createSealClient(
  network: SealNetwork,
  suiClient?: SuiRpcClient,
  fullnodeUrl?: string,
): SealClient {
  return new SealClient({
    suiClient: (suiClient ?? createSuiClient(network, fullnodeUrl)) as never,
    serverConfigs: SEAL_KEY_SERVERS[network],
    verifyKeyServers: false,
  });
}

/** Seal-encrypt raw bytes, returning the EncryptedObject + provenance hashes. */
export async function sealEncryptBytes(
  plaintext: Uint8Array,
  options: SealEncryptOptions,
): Promise<SealEncryptResult> {
  const network = options.network ?? sealNetworkFromEnv();
  const serverIds = keyServerObjectIds(network);
  const threshold = options.threshold ?? serverIds.length;
  if (threshold < 1 || threshold > serverIds.length) {
    throw new Error(
      `threshold ${threshold} must be between 1 and ${serverIds.length}`,
    );
  }

  const client =
    options.sealClient ??
    createSealClient(network, options.suiClient, options.fullnodeUrl);

  const { encryptedObject, key } = await client.encrypt({
    threshold,
    packageId: options.packageId,
    id: options.identity,
    data: plaintext,
    demType: DemType.AesGcm256,
  });

  return {
    ciphertext: encryptedObject,
    backupKey: key,
    sha256Plaintext: sha256Hex(plaintext),
    sha256Ciphertext: sha256Hex(encryptedObject),
    packageId: options.packageId,
    identity: options.identity,
    threshold,
    keyServerObjectIds: serverIds,
  };
}

export type SealEncryptHeldoutResult = SealEncryptResult & {
  itemCount: number;
};

/** Validate + Seal-encrypt a held-out JSONL set file. */
export async function sealEncryptHeldoutSetFile(
  path: string,
  options: SealEncryptOptions,
): Promise<SealEncryptHeldoutResult> {
  const text = await readFile(path, "utf8");
  const { items } = validateHeldoutSetText(text);
  const plaintext = new TextEncoder().encode(text);
  const result = await sealEncryptBytes(plaintext, options);
  return { ...result, itemCount: items.length };
}

/**
 * Decrypt a real Seal EncryptedObject offline using its backup DEM key.
 * This proves the ciphertext round-trips without invoking key servers; the
 * key-server-gated path (Phase 2, enclave-only) is exercised separately.
 */
export async function decryptWithBackupKey(
  ciphertext: Uint8Array,
  backupKey: Uint8Array,
): Promise<Uint8Array> {
  const parsed = EncryptedObject.parse(ciphertext) as {
    ciphertext: { Aes256Gcm?: { blob: number[]; aad?: number[] } };
  };
  const aes = parsed.ciphertext.Aes256Gcm;
  if (!aes) {
    throw new Error("decryptWithBackupKey: object is not AES-256-GCM DEM");
  }
  if (backupKey.length !== 32) {
    throw new Error("decryptWithBackupKey: key must be 32 bytes");
  }

  // Copy into a fresh ArrayBuffer-backed view to satisfy WebCrypto's BufferSource.
  const keyBytes = new Uint8Array(backupKey.length);
  keyBytes.set(backupKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: SEAL_DEM_IV,
      additionalData: new Uint8Array(aes.aad ?? []),
    },
    cryptoKey,
    new Uint8Array(aes.blob),
  );
  return new Uint8Array(plaintext);
}
