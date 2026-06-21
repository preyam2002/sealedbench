import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export const MODEL_ARTIFACT = {
  repo: "enacimie/SmolLM2-135M-Instruct-Q2_K-GGUF",
  revision: "013b8f77eeab23a8bcaa34fb221e7d646879bc40",
  file: "smollm2-135m-instruct-q2_k.gguf",
  size: 88202208,
  sha256: "f35d6de965cf283cf1fca70dd08aeb0a825e57c616092a257f15e78108c8326b",
  license: "apache-2.0",
} as const;

export function modelUrl(): string {
  return `https://huggingface.co/${MODEL_ARTIFACT.repo}/resolve/${MODEL_ARTIFACT.revision}/${MODEL_ARTIFACT.file}`;
}

export function verifyModelArtifact(actual: {
  size: number;
  sha256: string;
}): void {
  if (actual.size !== MODEL_ARTIFACT.size) {
    throw new Error(
      `model size mismatch: ${actual.size} != ${MODEL_ARTIFACT.size}`,
    );
  }
  if (actual.sha256 !== MODEL_ARTIFACT.sha256) {
    throw new Error(
      `model sha256 mismatch: ${actual.sha256} != ${MODEL_ARTIFACT.sha256}`,
    );
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const file = await import("node:fs").then((fs) => fs.createReadStream(path));
  for await (const chunk of file) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function main(): Promise<void> {
  const out = resolve(
    process.argv[2] ?? `enclave/models/${MODEL_ARTIFACT.file}`,
  );
  const tmp = `${out}.tmp`;
  await mkdir(dirname(out), { recursive: true });

  const res = await fetch(modelUrl());
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as NodeReadableStream<Uint8Array>),
    createWriteStream(tmp),
  );

  const size = (await stat(tmp)).size;
  const sha256 = await sha256File(tmp);
  verifyModelArtifact({ size, sha256 });

  await rename(tmp, out);
  console.log(JSON.stringify({ out, size, sha256 }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error) => {
    const out = resolve(
      process.argv[2] ?? `enclave/models/${MODEL_ARTIFACT.file}`,
    );
    await unlink(`${out}.tmp`).catch(() => {});
    console.error(error);
    process.exit(1);
  });
}
