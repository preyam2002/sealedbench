export type EvaluateAndPostArgs = {
  sealedEval: string | undefined;
  enclave: string;
  endpoint: string;
  model: string;
  provider: "openai" | "anthropic";
  apiKey: string;
  set: string;
  network: "testnet" | "mainnet";
  execute: boolean;
  enclaveObject: string | undefined;
  typeArg: string | undefined;
  allowPlaintextItems: boolean;
};

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseEvaluateAndPostArgs(argv: string[]): EvaluateAndPostArgs {
  const sealedEval = value(argv, "--sealed-eval");
  return {
    sealedEval,
    enclave: value(argv, "--enclave") ?? "http://127.0.0.1:3000",
    endpoint: value(argv, "--endpoint") ?? "http://127.0.0.1:3930",
    model: value(argv, "--model") ?? "demo",
    provider: (value(argv, "--provider") ?? "openai") as "openai" | "anthropic",
    apiKey:
      value(argv, "--api-key") ??
      process.env.ANTHROPIC_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "",
    set: value(argv, "--set") ?? "fixtures/heldout/sealedbench-v1.jsonl",
    network:
      (value(argv, "--network") as EvaluateAndPostArgs["network"]) ?? "testnet",
    execute: argv.includes("--execute"),
    enclaveObject: value(argv, "--enclave-object"),
    typeArg: value(argv, "--type-arg"),
    allowPlaintextItems: argv.includes("--allow-plaintext-items"),
  };
}

export function assertEvaluateAndPostMode(args: EvaluateAndPostArgs): void {
  if (args.execute) {
    throw new Error(
      "--execute is disabled until in-enclave Seal decrypt is implemented; the current local pipeline uses plaintext items_jsonl",
    );
  }
  if (!args.allowPlaintextItems) {
    throw new Error(
      "local evaluation sends decrypted items_jsonl to /evaluate; pass --allow-plaintext-items to acknowledge this is not the production Seal key-release path",
    );
  }
}
