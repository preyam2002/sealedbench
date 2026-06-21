import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { FULLNODE_URL, FULLNODE_URLS, NETWORK } from "./config";

const fetchWithRetry: typeof fetch = async (input, init) => {
  let delayMs = 600;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 && res.status < 500) {
      return res;
    }
    if (attempt === 5) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 2, 6000);
  }
  return fetch(input, init);
};

function clientFor(url: string): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: NETWORK,
    transport: new JsonRpcHTTPTransport({
      url,
      fetch: fetchWithRetry,
    }),
  });
}

export function suiClient(): SuiJsonRpcClient {
  return clientFor(FULLNODE_URL);
}

// Run an RPC call against each configured fullnode in order, returning the first
// success. queryEvents needs an archival node (publicnode prunes tx history), so
// the list degrades from archival → liveness fallback rather than failing hard.
export async function withRpcFallback<T>(
  call: (client: SuiJsonRpcClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const url of FULLNODE_URLS) {
    try {
      return await call(clientFor(url));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
