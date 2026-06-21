import testnetDeployment from "../../../deployments/testnet.json";
import type { Network } from "./format";

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) ?? "testnet";

// The published sealedbench package (testnet). Override via env for mainnet.
export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_SEALEDBENCH_PACKAGE_ID ?? testnetDeployment.packageId;

const configuredActiveEvalIds =
  process.env.NEXT_PUBLIC_SEALEDBENCH_ACTIVE_EVAL_IDS;

const defaultActiveEvalIds =
  testnetDeployment.activeSealedEvalIds?.length > 0
    ? testnetDeployment.activeSealedEvalIds
    : testnetDeployment.seedSealedEvalId
      ? [testnetDeployment.seedSealedEvalId]
      : [];

export const ACTIVE_SEALED_EVAL_IDS = configuredActiveEvalIds
  ? configuredActiveEvalIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  : defaultActiveEvalIds;

// Optional: the registered enclave public key, used to downgrade scores from an
// unrecognized enclave to "unverified" on the leaderboard.
export const REGISTERED_ENCLAVE_PK =
  process.env.NEXT_PUBLIC_ENCLAVE_PK ??
  testnetDeployment.registeredEnclavePk ??
  "";

// RPC endpoints, tried in order. The leaderboard reads historical Move events
// (queryEvents), which require an archival node — publicnode prunes transaction
// history and returns "Could not find the referenced transaction events", so the
// archival official fullnode goes first and publicnode is a liveness fallback.
// An explicit SUI_FULLNODE_URL override is tried before either.
export const FULLNODE_URLS: string[] = (() => {
  const defaults =
    NETWORK === "mainnet"
      ? [
          "https://fullnode.mainnet.sui.io:443",
          "https://sui-mainnet-rpc.publicnode.com",
        ]
      : [
          "https://fullnode.testnet.sui.io:443",
          "https://sui-testnet-rpc.publicnode.com",
        ];
  const override = process.env.SUI_FULLNODE_URL;
  return override
    ? [override, ...defaults.filter((url) => url !== override)]
    : defaults;
})();

// Primary endpoint (first in the fallback list); kept for single-client callers.
export const FULLNODE_URL = FULLNODE_URLS[0];
