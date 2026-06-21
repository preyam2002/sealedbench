import type { Network } from "./format";

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) ?? "testnet";

// Recorded testnet deployment, inlined so the web app builds standalone without
// importing across the pnpm-workspace boundary (Vercel uploads only this package).
// `deployments/testnet.json` is the canonical source — config.test.ts asserts these
// constants stay in sync with it. Override any value via NEXT_PUBLIC_* env for mainnet.
const TESTNET = {
  packageId:
    "0x9f6c9b056485a707d6bb8f6b5d810104cf1c44752899eef5378b5e12167bae4f",
  activeSealedEvalIds: [
    "0x8a3852f8d57fd738d35589ca42f3f0a96e6d76b0ace49409efafe76943960222",
  ],
  registeredEnclavePk:
    "d94d6b4a41b7d083a5940709f3d04c672ed7e5cecdb4c45e7cfce76e8232ee2d",
} as const;

// The published sealedbench package (testnet). Override via env for mainnet.
export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_SEALEDBENCH_PACKAGE_ID ?? TESTNET.packageId;

const configuredActiveEvalIds =
  process.env.NEXT_PUBLIC_SEALEDBENCH_ACTIVE_EVAL_IDS;

export const ACTIVE_SEALED_EVAL_IDS = configuredActiveEvalIds
  ? configuredActiveEvalIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  : [...TESTNET.activeSealedEvalIds];

// Optional: the registered enclave public key, used to downgrade scores from an
// unrecognized enclave to "unverified" on the leaderboard.
export const REGISTERED_ENCLAVE_PK =
  process.env.NEXT_PUBLIC_ENCLAVE_PK ?? TESTNET.registeredEnclavePk;

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
