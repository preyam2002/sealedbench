/**
 * Generate the enclave outbound-proxy manifest.
 *
 * A Nitro enclave has no network of its own — every outbound HTTPS call crosses
 * the vsock to the parent EC2 instance. This resolves the *real* set of hosts
 * the SealedBench enclave dials and assigns each one a loopback IP + vsock port,
 * shared by both sides of the tunnel:
 *   - in-enclave  (run.sh):              socat TCP-LISTEN:443,bind=<lo> -> VSOCK-CONNECT:3:<vport>
 *   - host        (setup-network-proxy): socat VSOCK-LISTEN:<vport>     -> TCP:<host>:443
 *
 * The hosts: Walrus aggregator (fetch ciphertext) + publisher (archive trace),
 * the configured Seal key servers (fetch_key), and the baked model endpoint.
 * The enclave never calls Sui RPC directly — the key servers run seal_approve.
 *
 * The manifest is baked into the measured image (so the PCRs attest exactly
 * which destinations the enclave can reach). Re-run before every build-enclave.
 *
 * Usage:
 *   pnpm tsx tools/gen-enclave-proxy-manifest.ts --model-endpoint https://api.anthropic.com \
 *     [--network testnet] [--out enclave/out/proxy-manifest.txt]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchConfiguredKeyServers } from "@sealedbench/seal";
import { walrusConfigFromEnv } from "@sealedbench/walrus";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export type Dest = { label: string; host: string; port: number };

export type AssignedDest = Dest & {
  vport: number;
  lo: string;
  labels: string[];
};

export function hostPort(rawUrl: string, label: string): Dest {
  const url = new URL(rawUrl);
  const port = url.port
    ? Number(url.port)
    : url.protocol === "http:"
      ? 80
      : 443;
  return { label, host: url.hostname, port };
}

export function assignProxyDestinations(
  dests: Dest[],
  baseVport: number,
): AssignedDest[] {
  const seen = new Map<string, AssignedDest>();
  let next = 0;
  for (const dest of dests) {
    const key = `${dest.host}:${dest.port}`;
    const existing = seen.get(key);
    if (existing) {
      existing.labels.push(dest.label);
      continue;
    }
    seen.set(key, {
      ...dest,
      vport: baseVport + next,
      lo: `127.0.0.${4 + next}`,
      labels: [dest.label],
    });
    next += 1;
  }
  return [...seen.values()];
}

async function main(): Promise<void> {
  const network = (flag("--network") ?? "testnet") as "testnet" | "mainnet";
  const modelEndpoint = flag("--model-endpoint");
  const localModel = process.argv.includes("--local-model");
  const baseVport = Number(flag("--base-vsock-port") ?? "8103");
  const out = flag("--out") ?? "enclave/out/proxy-manifest.txt";

  const walrus = walrusConfigFromEnv({ ...process.env, SUI_NETWORK: network });
  const keyServers = await fetchConfiguredKeyServers(network);

  const dests: Dest[] = [
    hostPort(walrus.aggregatorUrl, "walrus-aggregator"),
    hostPort(walrus.publisherUrl, "walrus-publisher"),
    ...keyServers.map((server, i) =>
      hostPort(server.url, `seal-key-server-${i + 1}`),
    ),
  ];
  if (modelEndpoint && !localModel) {
    dests.push(hostPort(modelEndpoint, "model-endpoint"));
  } else if (!localModel) {
    console.warn(
      "⚠ no --model-endpoint: manifest omits the model host. The enclave cannot\n" +
        "  reach the model without it — re-run with --model-endpoint before build-enclave.",
    );
  }

  // Dedupe by host:port; assign sequential loopback IPs and vsock ports so both
  // tunnel sides agree.
  const assigned = assignProxyDestinations(dests, baseVport);

  const lines = [
    "# SealedBench enclave outbound-proxy manifest — generated, do not edit by hand.",
    `# network=${network}  generated for ${
      localModel ? "local-model" : `model-endpoint=${modelEndpoint ?? "<none>"}`
    }`,
    "# columns: HOST PORT VSOCK_PORT LOOPBACK_IP  (# label)",
  ];
  for (const dest of assigned) {
    lines.push(
      `${dest.host} ${dest.port} ${dest.vport} ${dest.lo}  # ${dest.labels.join(",")}`,
    );
  }
  const body = `${lines.join("\n")}\n`;

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, body, "utf8");
  process.stdout.write(body);
  console.error(`\nwrote ${assigned.length} destinations -> ${out}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
