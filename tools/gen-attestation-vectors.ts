/**
 * Generate reproducible ed25519 test vectors for the Move attestation tests.
 * Uses a fixed secret key so the printed pk/signatures match what's embedded in
 * move/sealedbench/tests/*.move. The BCS layout here MUST mirror the Move
 * IntentMessage<T> wrapping and the ScorePayload / SealApproval structs.
 *
 * Run: pnpm tsx tools/gen-attestation-vectors.ts
 */
import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const SECRET = new Uint8Array(32);
for (let i = 0; i < 32; i++) {
  SECRET[i] = i + 1;
}
const keypair = Ed25519Keypair.fromSecretKey(SECRET);
const pk = keypair.getPublicKey().toRawBytes();

const ScoreIntentMessage = bcs.struct("ScoreIntentMessage", {
  intent: bcs.u8(),
  timestamp_ms: bcs.u64(),
  payload: bcs.struct("ScorePayload", {
    sealed_eval_id: bcs.Address,
    model_target: bcs.string(),
    score_num: bcs.u64(),
    score_den: bcs.u64(),
    items_hash: bcs.vector(bcs.u8()),
    trace_blob_id: bcs.string(),
  }),
});

const SealIntentMessage = bcs.struct("SealIntentMessage", {
  intent: bcs.u8(),
  timestamp_ms: bcs.u64(),
  payload: bcs.struct("SealApproval", { id: bcs.vector(bcs.u8()) }),
});

const toHex = (b: Uint8Array) =>
  `x"${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}"`;

const SCORE_INTENT = 1;
const SEAL_INTENT = 2;
const TIMESTAMP = 1744038900000n;

const sealedEvalId = `0x${"ab".repeat(32)}`;
const itemsHash = new Uint8Array(32).fill(7);

// --- score vector ---
const scorePayload = {
  sealed_eval_id: sealedEvalId,
  model_target: "demo/clean-open-model-2024-10",
  score_num: 37n,
  score_den: 50n,
  items_hash: [...itemsHash],
  trace_blob_id: "trace-blob-xyz",
};
const scoreMsg = ScoreIntentMessage.serialize({
  intent: SCORE_INTENT,
  timestamp_ms: TIMESTAMP,
  payload: scorePayload,
}).toBytes();
const scoreSig = await keypair.sign(scoreMsg);

// --- seal vector ---
const sealId = [...new Uint8Array(16).fill(0x22)];
const sealMsg = SealIntentMessage.serialize({
  intent: SEAL_INTENT,
  timestamp_ms: TIMESTAMP,
  payload: { id: sealId },
}).toBytes();
const sealSig = await keypair.sign(sealMsg);

console.log("// enclave pk:");
console.log(toHex(pk));
console.log(`timestamp_ms = ${TIMESTAMP}`);
console.log("\n// --- SCORE ---");
console.log(`sealed_eval_id = ${sealedEvalId}`);
console.log(`items_hash = ${toHex(itemsHash)}`);
console.log("score signature:");
console.log(toHex(scoreSig));
console.log("\n// --- SEAL ---");
console.log(`seal id = ${toHex(new Uint8Array(sealId))}`);
console.log("seal signature:");
console.log(toHex(sealSig));
