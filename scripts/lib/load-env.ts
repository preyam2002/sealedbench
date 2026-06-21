import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load a `.env` file (repo root by default) into `process.env` so orchestrator
 * scripts pick up secrets (model key, SUI_PRIVATE_KEY) and overrides without an
 * explicit shell `export`. Already-set variables win — a real `export` or inline
 * env always overrides the file. No dependency; simple KEY=VALUE lines, `#`
 * comments, and surrounding quotes are handled.
 */
export function loadEnv(path: string = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) {
    return;
  }
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
