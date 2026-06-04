import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { walrusConfigFromEnv } from "./config.ts";
import { getBlob, putBlob } from "./index.ts";

describe("walrus config", () => {
  test("defaults to testnet endpoints with mandatory epochs", () => {
    const config = walrusConfigFromEnv({});
    expect(config.network).toBe("testnet");
    expect(config.publisherUrl).toContain("walrus-testnet");
    expect(config.epochs).toBeGreaterThan(0);
  });

  test("rejects non-positive epochs on store", async () => {
    await expect(putBlob(new Uint8Array([1]), { epochs: 0 })).rejects.toThrow(
      /epochs must be a positive integer/,
    );
  });
});

// Real round-trip against the live Walrus testnet publisher + aggregator.
describe("walrus round-trip (testnet)", () => {
  test("PUT then GET returns byte-identical blob", async () => {
    const payload = new Uint8Array(randomBytes(96));

    const { blobId } = await putBlob(payload, { epochs: 1 });
    expect(blobId).toMatch(/^[A-Za-z0-9_-]+$/);

    const read = await getBlob(blobId, { retries: 6, retryDelayMs: 2000 });
    expect(Buffer.from(read).equals(Buffer.from(payload))).toBe(true);
  }, 90_000);
});
