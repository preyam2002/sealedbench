export type AssertEnclavePkArgs = {
  enclaveObject: string;
  enclaveUrl: string;
  network: "testnet" | "mainnet";
};

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseAssertEnclavePkArgs(argv: string[]): AssertEnclavePkArgs {
  const enclaveObject = value(argv, "--enclave-object");
  if (!enclaveObject) {
    throw new Error("--enclave-object <id> is required");
  }
  return {
    enclaveObject,
    enclaveUrl: value(argv, "--enclave") ?? "http://127.0.0.1:3000",
    network:
      (value(argv, "--network") as AssertEnclavePkArgs["network"]) ?? "testnet",
  };
}
