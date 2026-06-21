export type ExternalGateDeployment = {
  packageId?: string;
  clockObjectId?: string;
  enclaveCapId?: string;
  seedSealedEvalId?: string;
};

export type ExternalGateCheckInput = {
  env: Record<string, string | undefined>;
  deployment: ExternalGateDeployment;
  existingPaths: Set<string>;
};

/** The in-enclave Seal client implementation (G3). */
export const SEAL_CLIENT_SOURCE = "enclave/src/seal_client.rs";

export type ExternalGateCheck = {
  ready: boolean;
  blockers: string[];
  checks: Record<string, boolean>;
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function hasPcrEnv(env: Record<string, string | undefined>): boolean {
  return (
    hasValue(env.SEALEDBENCH_PCR0) &&
    hasValue(env.SEALEDBENCH_PCR1) &&
    hasValue(env.SEALEDBENCH_PCR2)
  );
}

function hasModelAccess(
  env: Record<string, string | undefined>,
  existingPaths: Set<string>,
): boolean {
  return (
    hasValue(env.ANTHROPIC_API_KEY) ||
    hasValue(env.OPENAI_API_KEY) ||
    hasValue(env.OPENAI_COMPAT_BASE_URL) ||
    existingEnvPath(env, existingPaths, "SEALEDBENCH_LOCAL_MODEL_PATH")
  );
}

function existingEnvPath(
  env: Record<string, string | undefined>,
  existingPaths: Set<string>,
  name: string,
): boolean {
  const path = env[name];
  if (!path || path.trim().length === 0) {
    return false;
  }
  return existingPaths.has(path);
}

export function checkExternalGates(
  input: ExternalGateCheckInput,
): ExternalGateCheck {
  const { env, deployment, existingPaths } = input;
  const checks = {
    deployment_package: hasValue(deployment.packageId),
    deployment_seed_eval: hasValue(deployment.seedSealedEvalId),
    deployment_enclave_cap: hasValue(deployment.enclaveCapId),
    deployment_clock: hasValue(deployment.clockObjectId),
    model_api_key: hasModelAccess(env, existingPaths),
    nitro_pcrs:
      hasPcrEnv(env) ||
      existingPaths.has(
        env.SEALEDBENCH_PCRS_JSON ?? "enclave/out/pcr-values.json",
      ),
    nitro_attestation:
      hasValue(env.SEALEDBENCH_ATTESTATION_BASE64) ||
      existingEnvPath(env, existingPaths, "SEALEDBENCH_ATTESTATION_PATH"),
    in_enclave_seal_decrypt: existingPaths.has(SEAL_CLIENT_SOURCE),
  };
  const blockers = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return { ready: blockers.length === 0, blockers, checks };
}
