export type Network = "testnet" | "mainnet";

export function shortId(id: string, head = 6, tail = 4): string {
  if (id.length <= head + tail + 2) {
    return id;
  }
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatScore(num: number, den: number): string {
  if (den <= 0) {
    return "—";
  }
  const pct = Math.round((num / den) * 1000) / 10;
  return `${num}/${den} · ${pct}%`;
}

export function scorePercent(num: number, den: number): number {
  return den <= 0 ? 0 : (num / den) * 100;
}

export function formatDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "—";
  }
  return new Date(ms).toISOString().slice(0, 10);
}

export function suiscanObjectUrl(network: Network, id: string): string {
  return `https://suiscan.xyz/${network}/object/${id}`;
}

export function suiscanTxUrl(network: Network, digest: string): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

export function walrusBlobUrl(network: Network, blobId: string): string {
  const host =
    network === "mainnet"
      ? "aggregator.walrus-mainnet.walrus.space"
      : "aggregator.walrus-testnet.walrus.space";
  return `https://${host}/v1/blobs/${blobId}`;
}
