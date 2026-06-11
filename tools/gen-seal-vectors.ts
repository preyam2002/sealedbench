/**
 * Generates fixtures/seal-vectors.json: cross-language test vectors proving the
 * Rust in-enclave Seal client (enclave/src/seal_client.rs) is byte-compatible
 * with @mysten/seal 1.1.3 + @mysten/sui — the SDKs this repo seals with.
 *
 * Everything is deterministic (fixed seeds/scalars) except nothing: no mocks —
 * the encryptedObject vector is produced by the SDK's real encrypt() under
 * locally generated IBE master keys, and the Rust side decrypts it with user
 * secret keys extracted from those master keys (exactly what key servers do).
 *
 * Run: pnpm tsx tools/gen-seal-vectors.ts
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, toBase64 } from "@mysten/sui/utils";
// Internal Seal SDK modules (not in the package export map; reached by path on
// purpose — these are the exact implementations the vectors must match).
// @ts-expect-error no public type declarations for internal module paths
import {
  G2Element,
  Scalar,
} from "../node_modules/@mysten/seal/dist/bls12381.mjs";
// @ts-expect-error see above
import { AesGcm256 } from "../node_modules/@mysten/seal/dist/dem.mjs";
// @ts-expect-error see above
import {
  toPublicKey,
  toVerificationKey,
} from "../node_modules/@mysten/seal/dist/elgamal.mjs";
// @ts-expect-error see above
import {
  encrypt,
  KemType,
} from "../node_modules/@mysten/seal/dist/encrypt.mjs";
// @ts-expect-error see above
import { hashToG1 } from "../node_modules/@mysten/seal/dist/kdf.mjs";
// @ts-expect-error see above
import { createFullId } from "../node_modules/@mysten/seal/dist/utils.mjs";

function seed(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

/** A small, valid BLS scalar: 31 zero bytes then `byte` (big-endian). */
function scalarBytes(byte: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[31] = byte;
  return bytes;
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const sdkCertificateTime = (ms: number): string =>
  `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`;

async function main(): Promise<void> {
  const packageId = `0x${"ab".repeat(32)}`;

  // --- time format vectors ---
  const timeFormat = [0, 1718054445000, 1750000000123, 4102444799999].map(
    (ms) => ({ ms, expected: sdkCertificateTime(ms) }),
  );

  // --- sui address vector ---
  const userKeypair = Ed25519Keypair.fromSecretKey(seed(0x11));
  const address = {
    ed25519PkHex: Buffer.from(userKeypair.getPublicKey().toRawBytes()).toString(
      "hex",
    ),
    suiAddress: userKeypair.getPublicKey().toSuiAddress(),
  };

  // --- certificate vector (personal message + signature) ---
  const sessionKeypair = Ed25519Keypair.fromSecretKey(seed(0x22));
  const sessionVkB64 = toBase64(sessionKeypair.getPublicKey().toRawBytes());
  const creationTimeMs = 1750000000000;
  const ttlMin = 10;
  const message = `Accessing keys of package ${packageId} for ${ttlMin} mins from ${sdkCertificateTime(creationTimeMs)}, session key ${sessionVkB64}`;
  const { signature } = await userKeypair.signPersonalMessage(
    new TextEncoder().encode(message),
  );
  const certificate = {
    userSeedHex: Buffer.from(seed(0x11)).toString("hex"),
    packageId,
    ttlMin,
    creationTimeMs,
    sessionVkB64,
    message,
    signatureB64: signature,
  };

  // --- seal_approve PTB vector ---
  const innerIdHex = "cd".repeat(32);
  const enclaveObjectId = `0x${"ef".repeat(32)}`;
  const initialSharedVersion = 7_654_321;
  const timestampMs = 1750000000000;
  const approvalSig = new Uint8Array(64).fill(0x5a);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::seal_policy::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(innerIdHex))),
      tx.sharedObjectRef({
        objectId: enclaveObjectId,
        initialSharedVersion,
        mutable: false,
      }),
      tx.pure.u64(timestampMs),
      tx.pure.vector("u8", Array.from(approvalSig)),
    ],
  });
  const txKindBytes = await tx.build({ onlyTransactionKind: true });
  const ptbBytes = txKindBytes.slice(1);
  const ptb = {
    packageId,
    innerIdHex,
    enclaveObjectId,
    initialSharedVersion,
    timestampMs,
    signatureHex: Buffer.from(approvalSig).toString("hex"),
    expectedPtbB64: toBase64(ptbBytes),
  };

  // --- fetch_key request signature vector ---
  const elgamalSk = scalarBytes(0x07);
  const encKey = toPublicKey(elgamalSk);
  const encVerificationKey = toVerificationKey(elgamalSk);
  const RequestFormat = bcs.struct("RequestFormat", {
    ptb: bcs.byteVector(),
    encKey: bcs.byteVector(),
    encVerificationKey: bcs.byteVector(),
  });
  const msgToSign = RequestFormat.serialize({
    ptb: ptbBytes,
    encKey,
    encVerificationKey,
  }).toBytes();
  const request = {
    ptbB64: toBase64(ptbBytes),
    encKeyB64: toBase64(encKey),
    encVerificationKeyB64: toBase64(encVerificationKey),
    sessionSeedHex: Buffer.from(seed(0x22)).toString("hex"),
    expectedSignatureB64: toBase64(await sessionKeypair.sign(msgToSign)),
  };

  // --- TS-encrypted object vector (the production direction) ---
  const plaintext =
    '{"id":"a","question":"2+2?","answer":"4","rubric":"r"}\n' +
    '{"id":"b","question":"capital of France?","answer":"Paris","rubric":"r"}\n';
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const idHex = sha256Hex(plaintextBytes); // repo convention: id = sha256(plaintext)
  const masterScalars = [0x03, 0x05, 0x09].map((b) =>
    Scalar.fromBytes(scalarBytes(b)),
  );
  const serverPks = masterScalars.map((s) => G2Element.generator().multiply(s));
  const serverIds = [
    `0x${"11".repeat(32)}`,
    `0x${"22".repeat(32)}`,
    `0x${"33".repeat(32)}`,
  ];
  const keyServers = serverIds.map((objectId, i) => ({
    objectId,
    pk: serverPks[i].toBytes(),
  }));
  const threshold = 2;
  const { encryptedObject, key: demKey } = await encrypt({
    keyServers,
    kemType: KemType.BonehFranklinBLS12381DemCCA,
    threshold,
    packageId,
    id: idHex,
    encryptionInput: new AesGcm256(plaintextBytes, undefined),
  });
  const fullIdBytes = fromHex(createFullId(packageId, idHex));
  const usks = masterScalars.map((s) =>
    hashToG1(fullIdBytes).multiply(s).toBytes(),
  );
  const encryptedObjectVector = {
    plaintext,
    idHex,
    threshold,
    serverIds,
    serverPksB64: serverPks.map((pk) => toBase64(pk.toBytes())),
    usksB64: usks.map((usk) => toBase64(usk)),
    demKeyHex: Buffer.from(demKey).toString("hex"),
    encryptedObjectB64: toBase64(encryptedObject),
  };

  const vectors = {
    _comment:
      "Generated by tools/gen-seal-vectors.ts with @mysten/seal 1.1.3 — consumed by enclave/src/seal_client.rs tests.",
    timeFormat,
    address,
    certificate,
    ptb,
    request,
    encryptedObject: encryptedObjectVector,
  };
  await writeFile(
    "fixtures/seal-vectors.json",
    `${JSON.stringify(vectors, null, 2)}\n`,
  );
  console.log("wrote fixtures/seal-vectors.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
