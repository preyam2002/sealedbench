export type WalrusNetwork = "testnet" | "mainnet";

export type WalrusConfig = {
  network: WalrusNetwork;
  publisherUrl: string;
  aggregatorUrl: string;
  epochs: number;
};

// Public Walrus HTTP endpoints. `epochs` is mandatory on store; a testnet
// epoch is ~1 day, mainnet ~2 weeks.
const ENDPOINTS: Record<
  WalrusNetwork,
  { publisherUrl: string; aggregatorUrl: string }
> = {
  testnet: {
    publisherUrl: "https://publisher.walrus-testnet.walrus.space",
    aggregatorUrl: "https://aggregator.walrus-testnet.walrus.space",
  },
  mainnet: {
    publisherUrl: "https://publisher.walrus-mainnet.walrus.space",
    aggregatorUrl: "https://aggregator.walrus-mainnet.walrus.space",
  },
};

export function walrusConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WalrusConfig {
  const network: WalrusNetwork =
    env.SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const defaults = ENDPOINTS[network];
  const epochs = Number.parseInt(env.WALRUS_EPOCHS ?? "5", 10);

  return {
    network,
    publisherUrl: env.WALRUS_PUBLISHER_URL ?? defaults.publisherUrl,
    aggregatorUrl: env.WALRUS_AGGREGATOR_URL ?? defaults.aggregatorUrl,
    epochs: Number.isInteger(epochs) && epochs > 0 ? epochs : 5,
  };
}
