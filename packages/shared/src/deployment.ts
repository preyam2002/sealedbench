import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type DeploymentNetwork = "testnet" | "mainnet";

export type Deployment = {
  network: DeploymentNetwork;
  packageId: string;
  publishDigest: string;
  upgradeCapId: string | null;
  modules: string[];
  clockObjectId: string;
};

export function deploymentPath(network: DeploymentNetwork): string {
  return fileURLToPath(
    new URL(`../../../deployments/${network}.json`, import.meta.url),
  );
}

/** Load the recorded on-chain deployment for a network, or null if none. */
export async function tryLoadDeployment(
  network: DeploymentNetwork,
): Promise<Deployment | null> {
  try {
    const raw = await readFile(deploymentPath(network), "utf8");
    return JSON.parse(raw) as Deployment;
  } catch {
    return null;
  }
}

export async function loadDeployment(
  network: DeploymentNetwork,
): Promise<Deployment> {
  const deployment = await tryLoadDeployment(network);
  if (!deployment) {
    throw new Error(
      `no deployment recorded for ${network} (expected ${deploymentPath(network)})`,
    );
  }
  return deployment;
}
