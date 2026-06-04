import type { KeyServerConfig } from "@mysten/seal";
import {
  getJsonRpcFullnodeUrl,
  JsonRpcHTTPTransport,
  SuiJsonRpcClient,
} from "@mysten/sui/jsonRpc";

export type SealNetwork = "testnet" | "mainnet";
export type SuiRpcClient = SuiJsonRpcClient;

// The public Sui fullnodes aggressively rate-limit (HTTP 429). Retry with
// exponential backoff so reads survive transient throttling.
const fetchWithRetry: typeof fetch = async (input, init) => {
  const maxAttempts = 6;
  let delayMs = 800;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 && res.status < 500) {
      return res;
    }
    if (attempt >= maxAttempts) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 2, 8000);
  }
};

// Verified Mysten-operated key servers (Open mode), from
// https://seal-docs.wal.app/Pricing . The URL can change; the object ID is the
// stable on-chain source of truth, so we reference servers by object ID only.
export const SEAL_KEY_SERVERS: Record<SealNetwork, KeyServerConfig[]> = {
  testnet: [
    {
      objectId:
        "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
      weight: 1,
    },
    {
      objectId:
        "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
      weight: 1,
    },
  ],
  // Populate from the Pricing page's mainnet section before the mainnet cutover
  // (Phase 4). Left empty so a mistaken mainnet seal fails loudly rather than
  // silently using testnet servers.
  mainnet: [],
};

export function sealNetworkFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SealNetwork {
  return env.SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function keyServerObjectIds(network: SealNetwork): string[] {
  const servers = SEAL_KEY_SERVERS[network];
  if (servers.length === 0) {
    throw new Error(`no Seal key servers configured for network "${network}"`);
  }
  return servers.map((server) => server.objectId);
}

// The official fullnodes (getJsonRpcFullnodeUrl) are heavily rate-limited; use
// a reliable public node by default. Override with SUI_FULLNODE_URL.
function defaultRpcUrl(network: SealNetwork): string {
  if (network === "testnet") {
    return "https://sui-testnet-rpc.publicnode.com";
  }
  return getJsonRpcFullnodeUrl(network);
}

export function createSuiClient(
  network: SealNetwork,
  fullnodeUrl?: string,
): SuiRpcClient {
  const url =
    fullnodeUrl ?? process.env.SUI_FULLNODE_URL ?? defaultRpcUrl(network);
  return new SuiJsonRpcClient({
    network,
    transport: new JsonRpcHTTPTransport({ url, fetch: fetchWithRetry }),
  });
}
