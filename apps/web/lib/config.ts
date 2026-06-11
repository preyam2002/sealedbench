import testnetDeployment from "../../../deployments/testnet.json";
import type { Network } from "./format";

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) ?? "testnet";

// The published sealedbench package (testnet). Override via env for mainnet.
export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_SEALEDBENCH_PACKAGE_ID ?? testnetDeployment.packageId;

// Optional: the registered enclave public key, used to downgrade scores from an
// unrecognized enclave to "unverified" on the leaderboard.
export const REGISTERED_ENCLAVE_PK = process.env.NEXT_PUBLIC_ENCLAVE_PK ?? "";

export const FULLNODE_URL =
  process.env.SUI_FULLNODE_URL ??
  (NETWORK === "mainnet"
    ? "https://fullnode.mainnet.sui.io:443"
    : "https://sui-testnet-rpc.publicnode.com");
