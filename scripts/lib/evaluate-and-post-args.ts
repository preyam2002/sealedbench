export type EvaluateAndPostArgs = {
  sealedEval: string | undefined;
  enclave: string;
  endpoint: string;
  /** Model id to dial. Undefined -> fall back to the SealedEval's declared
   * model_target (read from chain); the baked enclave endpoint overrides this in
   * the attested path. */
  model: string | undefined;
  provider: "openai" | "anthropic";
  apiKey: string;
  set: string;
  network: "testnet" | "mainnet";
  execute: boolean;
  enclaveObject: string | undefined;
  typeArg: string | undefined;
  allowPlaintextItems: boolean;
  /** Production path: the enclave fetches Seal keys + decrypts in-enclave. */
  sealed: boolean;
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
    model: value(argv, "--model"),
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
    sealed: argv.includes("--sealed"),
  };
}

export function assertEvaluateAndPostMode(args: EvaluateAndPostArgs): void {
  if (args.sealed) {
    if (!args.enclaveObject) {
      throw new Error(
        "--sealed requires --enclave-object <registered Enclave object id> (seal_approve dry-runs against it)",
      );
    }
    if (args.allowPlaintextItems) {
      throw new Error(
        "--sealed and --allow-plaintext-items are mutually exclusive",
      );
    }
    return;
  }
  if (args.execute) {
    throw new Error(
      "--execute requires --sealed: only the in-enclave Seal decrypt path may post an attested score; the plaintext pipeline is local-only",
    );
  }
  if (!args.allowPlaintextItems) {
    throw new Error(
      "local evaluation sends decrypted items_jsonl to /evaluate; pass --allow-plaintext-items to acknowledge this is not the production Seal key-release path (or use --sealed)",
    );
  }
}

export function postScoreTypeArguments(_typeArg: string | undefined): string[] {
  return [];
}
