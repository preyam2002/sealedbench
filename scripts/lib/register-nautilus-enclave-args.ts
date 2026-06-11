export type RegisterEnclaveArgs = {
  network: "testnet" | "mainnet";
  name: string;
  capId: string | undefined;
  configId: string | undefined;
  pcrsJson: string | undefined;
  attestationPath: string | undefined;
  attestationBase64: string | undefined;
  typeArg: string | undefined;
};

export type Pcrs = {
  pcr0: string;
  pcr1: string;
  pcr2: string;
};

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseRegisterEnclaveArgs(argv: string[]): RegisterEnclaveArgs {
  return {
    network:
      (value(argv, "--network") as RegisterEnclaveArgs["network"]) ?? "testnet",
    name: value(argv, "--name") ?? "SealedBench scorer",
    capId: value(argv, "--cap-id") ?? process.env.SEALEDBENCH_ENCLAVE_CAP_ID,
    configId:
      value(argv, "--config-id") ?? process.env.SEALEDBENCH_ENCLAVE_CONFIG_ID,
    pcrsJson: value(argv, "--pcrs-json") ?? process.env.SEALEDBENCH_PCRS_JSON,
    attestationPath:
      value(argv, "--attestation-path") ??
      process.env.SEALEDBENCH_ATTESTATION_PATH,
    attestationBase64:
      value(argv, "--attestation-base64") ??
      process.env.SEALEDBENCH_ATTESTATION_BASE64,
    typeArg: value(argv, "--type-arg") ?? process.env.SEALEDBENCH_ENCLAVE_TYPE,
  };
}

export function readPcrsFromObject(value: {
  pcr0?: string;
  pcr1?: string;
  pcr2?: string;
}): Pcrs {
  return {
    pcr0: assertPcr(value.pcr0, "pcr0"),
    pcr1: assertPcr(value.pcr1, "pcr1"),
    pcr2: assertPcr(value.pcr2, "pcr2"),
  };
}

export function assertPcr(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  const normalized = value.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{96}$/.test(normalized)) {
    throw new Error(`${label} must be a 48-byte SHA-384 hex PCR`);
  }
  return normalized.toLowerCase();
}
