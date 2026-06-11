import { describe, expect, test } from "vitest";
import { parseUpgradePackageArgs } from "./lib/upgrade-package-args.ts";

describe("parseUpgradePackageArgs", () => {
  test("defaults to testnet", () => {
    expect(parseUpgradePackageArgs([])).toMatchObject({
      network: "testnet",
      dryRun: false,
      publishNew: false,
    });
  });

  test("supports dry-run mode", () => {
    expect(parseUpgradePackageArgs(["--dry-run"])).toMatchObject({
      dryRun: true,
    });
  });

  test("supports fresh publish mode", () => {
    expect(parseUpgradePackageArgs(["--publish-new"])).toMatchObject({
      publishNew: true,
    });
  });
});
