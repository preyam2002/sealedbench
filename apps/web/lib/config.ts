import type { Network } from "./format";

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) ?? "testnet";

// The published sealedbench package (testnet). Override via env for mainnet.
export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_SEALEDBENCH_PACKAGE_ID ??
  "0x40cdf0833159ce9f688d33fa17c4b6256042c9babbc807e8600bd3c7f0fa0448";

// Optional: the registered enclave public key, used to downgrade scores from an
// unrecognized enclave to "unverified" on the leaderboard.
export const REGISTERED_ENCLAVE_PK = process.env.NEXT_PUBLIC_ENCLAVE_PK ?? "";

export const FULLNODE_URL =
  process.env.SUI_FULLNODE_URL ??
  (NETWORK === "mainnet"
    ? "https://fullnode.mainnet.sui.io:443"
    : "https://sui-testnet-rpc.publicnode.com");
