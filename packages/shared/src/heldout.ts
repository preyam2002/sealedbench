import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REQUIRED_KEYS = ["id", "question", "answer", "rubric"] as const;

export type HeldoutItem = {
  id: string;
  question: string;
  answer: string;
  rubric: string;
};

export type HeldoutValidationOptions = {
  minItems?: number;
};

export type HeldoutValidationResult = {
  items: HeldoutItem[];
  sha256: string;
};

export function validateHeldoutSetText(
  text: string,
  options: HeldoutValidationOptions = {},
): HeldoutValidationResult {
  const sha256 = createHash("sha256").update(text).digest("hex");
  const lines = splitJsonl(text);
  const items: HeldoutItem[] = [];
  const seenIds = new Set<string>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      throw new Error(`line ${lineNumber} is empty`);
    }

    const parsed = parseJsonLine(line, lineNumber);
    const item = readHeldoutItem(parsed, lineNumber);

    if (seenIds.has(item.id)) {
      throw new Error(`duplicate id "${item.id}"`);
    }

    seenIds.add(item.id);
    items.push(item);
  });

  const minItems = options.minItems ?? 50;
  if (items.length < minItems) {
    throw new Error(
      `expected at least ${minItems} items, found ${items.length}`,
    );
  }

  return { items, sha256 };
}

export async function validateHeldoutSetFile(
  path: string,
  options: HeldoutValidationOptions = {},
): Promise<HeldoutValidationResult> {
  return validateHeldoutSetText(await readFile(path, "utf8"), options);
}

function splitJsonl(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") {
    return lines.slice(0, -1);
  }

  return lines;
}

function parseJsonLine(line: string, lineNumber: number): unknown {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`line ${lineNumber} is not valid JSON`);
  }
}

function readHeldoutItem(value: unknown, lineNumber: number): HeldoutItem {
  if (!isRecord(value)) {
    throw new Error(`line ${lineNumber} must be a JSON object`);
  }

  const item: Partial<HeldoutItem> = {};
  for (const key of REQUIRED_KEYS) {
    if (!(key in value)) {
      throw new Error(`line ${lineNumber} missing required key "${key}"`);
    }

    const field = value[key];
    if (typeof field !== "string" || field.trim().length === 0) {
      throw new Error(
        `line ${lineNumber} key "${key}" must be a non-empty string`,
      );
    }

    item[key] = field;
  }

  return item as HeldoutItem;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
