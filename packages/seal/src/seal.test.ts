import { fileURLToPath } from "node:url";
import type { SealClient } from "@mysten/seal";
import { loadDeployment } from "@sealedbench/shared";
import { beforeAll, describe, expect, test } from "vitest";
import {
  createSealClient,
  decryptWithBackupKey,
  sealEncryptBytes,
  sealEncryptHeldoutSetFile,
  sha256Hex,
} from "./index.ts";

// encrypt() requires packageId to be a real on-chain package (the seal_approve
// namespace), so we use our published testnet package. The enclave-gated
// seal_approve policy lands in Phase 2; Phase 1 decrypts via the backup DEM
// key, which needs no key servers.
const IDENTITY = `0x${"22".repeat(16)}`;

const HELDOUT_PATH = fileURLToPath(
  new URL("../../../fixtures/heldout/sealedbench-v1.jsonl", import.meta.url),
);

// One client for the whole suite: it caches the key-server public keys after
// the first fetch, so the testnet RPC is hit once rather than per-test.
// Skipped when SEALEDBENCH_SKIP_NETWORK=1 (e.g. offline CI unit runs).
const skipNetwork = process.env.SEALEDBENCH_SKIP_NETWORK === "1";
let sealClient: SealClient;
let PACKAGE_ID: string;
beforeAll(async () => {
  if (skipNetwork) {
    return;
  }
  PACKAGE_ID = (await loadDeployment("testnet")).packageId;
  sealClient = createSealClient("testnet");
  await sealClient.getKeyServers();
}, 60_000);

describe.skipIf(skipNetwork)(
  "seal encrypt + offline backup-key round-trip (testnet key servers)",
  () => {
    test("decrypt(encrypt(x)) === x for raw bytes", async () => {
      const plaintext = new TextEncoder().encode(
        "sealedbench seal round-trip payload — held-out answers",
      );

      const result = await sealEncryptBytes(plaintext, {
        packageId: PACKAGE_ID,
        identity: IDENTITY,
        network: "testnet",
        sealClient,
      });

      expect(result.threshold).toBe(2);
      expect(result.keyServerObjectIds).toHaveLength(2);
      expect(result.sha256Plaintext).toBe(sha256Hex(plaintext));
      // ciphertext is opaque + different from plaintext
      expect(result.sha256Ciphertext).not.toBe(result.sha256Plaintext);

      const recovered = await decryptWithBackupKey(
        result.ciphertext,
        result.backupKey,
      );
      expect(new TextDecoder().decode(recovered)).toBe(
        new TextDecoder().decode(plaintext),
      );
    }, 60_000);

    test("sha256Plaintext matches the raw held-out file and the set round-trips", async () => {
      const result = await sealEncryptHeldoutSetFile(HELDOUT_PATH, {
        packageId: PACKAGE_ID,
        identity: IDENTITY,
        network: "testnet",
        sealClient,
      });

      expect(result.itemCount).toBe(50);

      const recovered = await decryptWithBackupKey(
        result.ciphertext,
        result.backupKey,
      );
      expect(sha256Hex(recovered)).toBe(result.sha256Plaintext);
    }, 60_000);

    test("a corrupted backup key fails to decrypt", async () => {
      const result = await sealEncryptBytes(
        new TextEncoder().encode("secret"),
        {
          packageId: PACKAGE_ID,
          identity: IDENTITY,
          network: "testnet",
          sealClient,
        },
      );

      const badKey = new Uint8Array(result.backupKey);
      badKey[0] = (badKey[0] ?? 0) ^ 0xff;

      await expect(
        decryptWithBackupKey(result.ciphertext, badKey),
      ).rejects.toThrow();
    }, 60_000);
  },
);
