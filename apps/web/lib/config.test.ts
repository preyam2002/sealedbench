import { expect, test } from "vitest";
import testnetDeployment from "../../../deployments/testnet.json";
import {
  ACTIVE_SEALED_EVAL_IDS,
  PACKAGE_ID,
  REGISTERED_ENCLAVE_PK,
} from "./config";

test("defaults to the recorded testnet package", () => {
  expect(PACKAGE_ID).toBe(testnetDeployment.packageId);
});

test("defaults to the recorded active eval catalog", () => {
  expect(ACTIVE_SEALED_EVAL_IDS).toEqual(testnetDeployment.activeSealedEvalIds);
});

test("defaults to the recorded registered enclave public key", () => {
  expect(REGISTERED_ENCLAVE_PK).toBe(testnetDeployment.registeredEnclavePk);
});
