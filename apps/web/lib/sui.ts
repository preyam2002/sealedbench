import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { FULLNODE_URL, NETWORK } from "./config";

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

export function suiClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: NETWORK,
    transport: new JsonRpcHTTPTransport({
      url: FULLNODE_URL,
      fetch: fetchWithRetry,
    }),
  });
}
