export type LiveNitroRunArgs = {
  mode: "post-score" | "setup-frontend";
  network: "testnet" | "mainnet";
  sealedEval: string | undefined;
  sshKey: string;
  host: string;
  user: string;
  remotePath: string;
  localPort: string;
  localEnclaveUrl: string;
  attestationPath: string;
  pcrsJson: string;
  restoreAegis: boolean;
  dryRun: boolean;
  endpoint: string;
  model: string;
  repoRoot: string;
};

export type LiveCommand = {
  label: string;
  command: string;
  args: string[];
};

export type LiveNitroPlan = {
  remoteStart: LiveCommand;
  copyAttestation: LiveCommand;
  copyPcrs: LiveCommand;
  register: LiveCommand;
  tunnel: LiveCommand;
  assert: LiveCommand;
  evaluate: LiveCommand;
  remoteRestore: LiveCommand | undefined;
};

export type RegisterResult = {
  configId: string;
  digest: string;
  enclaveId: string;
};

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function doubleQuote(value: string): string {
  return `"${value.replace(/(["\\`])/g, "\\$1")}"`;
}

function remoteCdPath(value: string): string {
  if (value === "~") {
    return "$HOME";
  }
  if (value.startsWith("~/")) {
    return doubleQuote(`$HOME/${value.slice(2)}`);
  }
  return shQuote(value);
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(value) ? value : shQuote(value);
}

export function formatLiveCommand(command: LiveCommand): string {
  return [command.command, ...command.args.map(shellArg)].join(" ");
}

function remoteTarget(args: LiveNitroRunArgs): string {
  return `${args.user}@${args.host}`;
}

export function parseLiveNitroRunArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): LiveNitroRunArgs {
  const localPort =
    value(argv, "--local-port") ?? env.SEALEDBENCH_LOCAL_PORT ?? "3321";
  return {
    mode: argv.includes("--setup-frontend") ? "setup-frontend" : "post-score",
    network:
      (value(argv, "--network") as LiveNitroRunArgs["network"]) ??
      ((env.SUI_NETWORK as LiveNitroRunArgs["network"] | undefined) ||
        "testnet"),
    sealedEval: value(argv, "--sealed-eval"),
    sshKey:
      value(argv, "--ssh-key") ??
      env.SEALEDBENCH_NITRO_SSH_KEY ??
      "/Users/preyam/Documents/Private stuff/Aletheia.pem",
    host:
      value(argv, "--host") ??
      env.SEALEDBENCH_NITRO_HOST ??
      "ec2-13-51-174-115.eu-north-1.compute.amazonaws.com",
    user: value(argv, "--user") ?? env.SEALEDBENCH_NITRO_USER ?? "ec2-user",
    remotePath:
      value(argv, "--remote-path") ??
      env.SEALEDBENCH_REMOTE_ENCLAVE_PATH ??
      "~/sealedbench-nitro/enclave",
    localPort,
    localEnclaveUrl:
      value(argv, "--enclave") ??
      env.SEALEDBENCH_ENCLAVE_URL ??
      `http://127.0.0.1:${localPort}`,
    attestationPath:
      value(argv, "--attestation-path") ??
      env.SEALEDBENCH_ATTESTATION_PATH ??
      "enclave/attestation.json",
    pcrsJson:
      value(argv, "--pcrs-json") ??
      env.SEALEDBENCH_PCRS_JSON ??
      "enclave/out/pcr-values.json",
    restoreAegis: !argv.includes("--no-restore-aegis"),
    dryRun: argv.includes("--dry-run"),
    endpoint:
      value(argv, "--endpoint") ??
      env.SEALEDBENCH_MODEL_ENDPOINT ??
      "http://127.0.0.1:8081",
    model:
      value(argv, "--model") ??
      env.SEALEDBENCH_MODEL_ID ??
      "smollm2-135m-instruct-q2_k",
    repoRoot:
      value(argv, "--repo-root") ?? env.SEALEDBENCH_REPO_ROOT ?? process.cwd(),
  };
}

export function assertLiveNitroApproval(
  args: LiveNitroRunArgs,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!args.dryRun && env.SEALEDBENCH_ALLOW_AEGIS_STOP !== "true") {
    throw new Error(
      "refusing to pause Aegis without SEALEDBENCH_ALLOW_AEGIS_STOP=true",
    );
  }
}

export function buildLiveNitroPlan(
  args: LiveNitroRunArgs,
  enclaveId = "<registered-enclave-id>",
): LiveNitroPlan {
  const remote = remoteTarget(args);
  const sshBase = ["-i", args.sshKey, remote];
  const scpBase = ["-i", args.sshKey];
  const remoteStart = `cd ${remoteCdPath(args.remotePath)} && SEALEDBENCH_ALLOW_AEGIS_STOP=true ./shared-host-switchover.sh start-sealedbench`;
  const remoteRestore = `cd ${remoteCdPath(args.remotePath)} && ./shared-host-switchover.sh restore-aegis`;

  return {
    remoteStart: {
      label: "start SealedBench on shared Nitro host",
      command: "ssh",
      args: [...sshBase, remoteStart],
    },
    copyAttestation: {
      label: "copy SealedBench attestation",
      command: "scp",
      args: [
        ...scpBase,
        `${remote}:/tmp/sealedbench-attestation.json`,
        args.attestationPath,
      ],
    },
    copyPcrs: {
      label: "copy SealedBench PCRs",
      command: "scp",
      args: [
        ...scpBase,
        `${remote}:${args.remotePath}/out/pcr-values.json`,
        args.pcrsJson,
      ],
    },
    register: {
      label: "register SealedBench enclave on-chain",
      command: "pnpm",
      args: [
        "register:enclave",
        "--network",
        args.network,
        "--pcrs-json",
        args.pcrsJson,
        "--attestation-path",
        args.attestationPath,
      ],
    },
    tunnel: {
      label: "tunnel local port to SealedBench ingress",
      command: "ssh",
      args: [
        "-N",
        "-L",
        `${args.localPort}:127.0.0.1:3001`,
        "-i",
        args.sshKey,
        remote,
      ],
    },
    assert: {
      label: "assert registered public key matches live enclave",
      command: "pnpm",
      args: [
        "assert:enclave",
        "--network",
        args.network,
        "--enclave-object",
        enclaveId,
        "--enclave",
        args.localEnclaveUrl,
      ],
    },
    evaluate: {
      label: "run selected sealed eval and post AttestedScore",
      command: "pnpm",
      args: [
        "tsx",
        "scripts/evaluate-and-post.ts",
        "--network",
        args.network,
        ...(args.sealedEval ? ["--sealed-eval", args.sealedEval] : []),
        "--sealed",
        "--execute",
        "--enclave-object",
        enclaveId,
        "--enclave",
        args.localEnclaveUrl,
        "--provider",
        "openai",
        "--endpoint",
        args.endpoint,
        "--model",
        args.model,
      ],
    },
    remoteRestore: args.restoreAegis
      ? {
          label: "restore Aegis on shared Nitro host",
          command: "ssh",
          args: [...sshBase, remoteRestore],
        }
      : undefined,
  };
}

function jsonObjects(text: string): unknown[] {
  const objects: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  return objects;
}

export function extractRegisterResult(output: string): RegisterResult {
  for (const value of jsonObjects(output)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "step" in value &&
      value.step === "register_enclave" &&
      "digest" in value &&
      typeof value.digest === "string" &&
      "configId" in value &&
      typeof value.configId === "string" &&
      "enclaveId" in value &&
      typeof value.enclaveId === "string"
    ) {
      return {
        configId: value.configId,
        digest: value.digest,
        enclaveId: value.enclaveId,
      };
    }
  }
  throw new Error("register:enclave output did not include enclaveId");
}
