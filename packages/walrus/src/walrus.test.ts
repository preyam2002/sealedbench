import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { walrusConfigFromEnv } from "./config.ts";
import { getBlob, putBlob } from "./index.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("walrus config", () => {
  test("defaults to testnet endpoints with mandatory epochs", () => {
    const config = walrusConfigFromEnv({});
    expect(config.network).toBe("testnet");
    expect(config.publisherUrl).toContain("walrus-testnet");
    expect(config.epochs).toBe(53);
  });

  test("PUT uses durable permanent storage by default", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          newlyCreated: { blobObject: { blobId: "abc_DEF-123" } },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(putBlob(new Uint8Array([1, 2, 3]))).resolves.toMatchObject({
      blobId: "abc_DEF-123",
      alreadyCertified: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("epochs")).toBe("53");
    expect(url.searchParams.get("permanent")).toBe("true");
  });

  test("rejects non-positive epochs on store", async () => {
    await expect(putBlob(new Uint8Array([1]), { epochs: 0 })).rejects.toThrow(
      /epochs must be a positive integer/,
    );
  });
});

// Real round-trip against the live Walrus testnet publisher + aggregator.
// Skipped when SEALEDBENCH_SKIP_NETWORK=1 (e.g. offline CI unit runs).
const skipNetwork = process.env.SEALEDBENCH_SKIP_NETWORK === "1";
describe.skipIf(skipNetwork)("walrus round-trip (testnet)", () => {
  test("PUT then GET returns byte-identical blob", async () => {
    const payload = new Uint8Array(randomBytes(96));

    const { blobId } = await putBlob(payload, { epochs: 1 });
    expect(blobId).toMatch(/^[A-Za-z0-9_-]+$/);

    const read = await getBlob(blobId, { retries: 6, retryDelayMs: 2000 });
    expect(Buffer.from(read).equals(Buffer.from(payload))).toBe(true);
  }, 90_000);
});
