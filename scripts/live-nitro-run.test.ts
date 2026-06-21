import { describe, expect, test } from "vitest";
import {
  assertLiveNitroApproval,
  buildLiveNitroPlan,
  extractRegisterResult,
  formatLiveCommand,
  parseLiveNitroRunArgs,
} from "./lib/live-nitro-run.ts";

describe("live Nitro run operator plan", () => {
  test("refuses a mutating run without explicit Aegis pause approval", () => {
    const args = parseLiveNitroRunArgs(["--sealed-eval", "0xabc"], {});
    expect(() => assertLiveNitroApproval(args, {})).toThrow(
      /SEALEDBENCH_ALLOW_AEGIS_STOP=true/,
    );
  });

  test("allows dry-run planning without approval", () => {
    const args = parseLiveNitroRunArgs(
      ["--dry-run", "--sealed-eval", "0xabc"],
      {},
    );
    expect(() => assertLiveNitroApproval(args, {})).not.toThrow();
  });

  test("parses frontend setup mode for browser-triggered runs", () => {
    const args = parseLiveNitroRunArgs(
      ["--dry-run", "--setup-frontend", "--sealed-eval", "0xabc"],
      {},
    );
    expect(args.mode).toBe("setup-frontend");
  });

  test("uses the guarded switchover helper and restores Aegis", () => {
    const args = parseLiveNitroRunArgs(
      ["--dry-run", "--sealed-eval", "0xabc", "--local-port", "3322"],
      {},
    );
    const plan = buildLiveNitroPlan(args);
    expect(plan.remoteStart.args.join(" ")).toContain(
      'cd "$HOME/sealedbench-nitro/enclave" && SEALEDBENCH_ALLOW_AEGIS_STOP=true ./shared-host-switchover.sh start-sealedbench',
    );
    expect(plan.remoteRestore?.args.join(" ")).toContain(
      "./shared-host-switchover.sh restore-aegis",
    );
    expect(plan.tunnel.args).toContain("3322:127.0.0.1:3001");
    expect(plan.evaluate.args).toContain("--sealed");
    expect(plan.evaluate.args).toContain("--execute");
  });

  test("extracts the registered enclave object from pretty JSON output", () => {
    const result = extractRegisterResult(`
{
  "step": "create_enclave_config",
  "digest": "111",
  "configId": "0xconfig"
}
{
  "step": "register_enclave",
  "digest": "222",
  "configId": "0xconfig",
  "enclaveId": "0xenclave"
}
`);
    expect(result).toEqual({
      configId: "0xconfig",
      digest: "222",
      enclaveId: "0xenclave",
    });
  });

  test("formats dry-run commands with shell-safe quoted args", () => {
    const args = parseLiveNitroRunArgs(
      ["--dry-run", "--sealed-eval", "0xabc"],
      {},
    );
    const plan = buildLiveNitroPlan(args);
    expect(formatLiveCommand(plan.remoteStart)).toContain(
      "'/Users/preyam/Documents/Private stuff/Aletheia.pem'",
    );
  });
});
