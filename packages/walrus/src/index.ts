import { type WalrusConfig, walrusConfigFromEnv } from "./config.ts";

export type { WalrusConfig, WalrusNetwork } from "./config.ts";
export { walrusConfigFromEnv };

export type PutBlobOptions = {
  config?: WalrusConfig;
  epochs?: number;
};

export type PutBlobResult = {
  blobId: string;
  /** true when Walrus already had an identical, still-certified blob. */
  alreadyCertified: boolean;
};

export type GetBlobOptions = {
  config?: WalrusConfig;
  /** Retry GET this many times to absorb post-store certification propagation. */
  retries?: number;
  retryDelayMs?: number;
};

type WalrusPutResponse = {
  newlyCreated?: { blobObject?: { blobId?: string } };
  alreadyCertified?: { blobId?: string };
};

/** Store `data` on Walrus and return its content-addressed blobId. */
export async function putBlob(
  data: Uint8Array,
  options: PutBlobOptions = {},
): Promise<PutBlobResult> {
  const config = options.config ?? walrusConfigFromEnv();
  const epochs = options.epochs ?? config.epochs;
  if (!Number.isInteger(epochs) || epochs < 1) {
    throw new Error(`walrus: epochs must be a positive integer, got ${epochs}`);
  }

  const url = `${config.publisherUrl}/v1/blobs?epochs=${epochs}`;
  const res = await fetch(url, {
    method: "PUT",
    body: data,
    headers: { "content-type": "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(
      `walrus put failed: HTTP ${res.status} ${await res.text()}`,
    );
  }

  const json = (await res.json()) as WalrusPutResponse;
  const newId = json.newlyCreated?.blobObject?.blobId;
  if (newId) {
    return { blobId: newId, alreadyCertified: false };
  }
  const existingId = json.alreadyCertified?.blobId;
  if (existingId) {
    return { blobId: existingId, alreadyCertified: true };
  }
  throw new Error(`walrus put: unexpected response ${JSON.stringify(json)}`);
}

/** Read a blob back from Walrus by blobId, returning the raw bytes. */
export async function getBlob(
  blobId: string,
  options: GetBlobOptions = {},
): Promise<Uint8Array> {
  const config = options.config ?? walrusConfigFromEnv();
  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const url = `${config.aggregatorUrl}/v1/blobs/${blobId}`;

  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      return new Uint8Array(await res.arrayBuffer());
    }
    lastError = `HTTP ${res.status}`;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`walrus get failed for ${blobId}: ${lastError}`);
}
