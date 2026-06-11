export type VerifyProvenanceArgs = {
  objectId: string | undefined;
  network: "testnet" | "mainnet";
  tamper: boolean;
};

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseVerifyProvenanceArgs(
  argv: string[],
): VerifyProvenanceArgs {
  return {
    objectId: argv.find((arg) => arg.startsWith("0x")),
    network: (flagValue(argv, "--network") ?? "testnet") as
      | "testnet"
      | "mainnet",
    tamper: argv.includes("--tamper-test"),
  };
}
