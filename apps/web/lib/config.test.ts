import { expect, test } from "vitest";
import testnetDeployment from "../../../deployments/testnet.json";
import { PACKAGE_ID } from "./config";

test("defaults to the recorded testnet package", () => {
  expect(PACKAGE_ID).toBe(testnetDeployment.packageId);
});
