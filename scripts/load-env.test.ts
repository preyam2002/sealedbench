import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadEnv } from "./lib/load-env.ts";

const added: string[] = [];
afterEach(() => {
  for (const key of added.splice(0)) {
    delete process.env[key];
  }
});

function envFile(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "sb-env-")), ".env");
  writeFileSync(path, body, "utf8");
  return path;
}

test("loads unset KEY=VALUE pairs, skipping comments and stripping quotes", () => {
  added.push("SB_TEST_PLAIN", "SB_TEST_QUOTED");
  loadEnv(envFile('# comment\nSB_TEST_PLAIN=abc\nSB_TEST_QUOTED="d e f"\n\n'));
  expect(process.env.SB_TEST_PLAIN).toBe("abc");
  expect(process.env.SB_TEST_QUOTED).toBe("d e f");
});

test("does not override an already-set variable", () => {
  added.push("SB_TEST_EXISTING");
  process.env.SB_TEST_EXISTING = "from-shell";
  loadEnv(envFile("SB_TEST_EXISTING=from-file\n"));
  expect(process.env.SB_TEST_EXISTING).toBe("from-shell");
});

test("is a no-op when the file is absent", () => {
  expect(() =>
    loadEnv(join(tmpdir(), "sb-nope", "does-not-exist.env")),
  ).not.toThrow();
});
