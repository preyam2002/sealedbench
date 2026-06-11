export type UpgradePackageArgs = {
  network: "testnet" | "mainnet";
  dryRun: boolean;
  publishNew: boolean;
};

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseUpgradePackageArgs(argv: string[]): UpgradePackageArgs {
  return {
    network:
      (value(argv, "--network") as UpgradePackageArgs["network"]) ?? "testnet",
    dryRun: argv.includes("--dry-run"),
    publishNew: argv.includes("--publish-new"),
  };
}
