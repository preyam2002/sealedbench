/**
 * OpenAI-compatible /v1/chat/completions server for keyless demos and e2e runs.
 * Serves a deterministic "model" that knows a fixed fraction of the held-out
 * answers — the two-model contamination demo is two instances of this:
 *   model A ("contaminated"): --knows 1.0   (memorized the leaked set)
 *   model B ("clean"):        --knows 0.7   (genuine partial ability)
 *
 * It speaks the real wire protocol; the enclave's HTTP client cannot tell it
 * from any other OpenAI-compatible endpoint. Stand-in for G1 until a real
 * model API key is configured.
 *
 * Usage: pnpm tsx tools/demo-model-server.ts [--port 3930] [--knows 0.8]
 *        [--set fixtures/heldout/sealedbench-v1.jsonl]
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type ChatRequest = {
  messages?: { role: string; content: string }[];
};

async function main(): Promise<void> {
  const port = Number(flag("--port") ?? 3930);
  const knows = Number(flag("--knows") ?? 0.8);
  const setPath = flag("--set") ?? "fixtures/heldout/sealedbench-v1.jsonl";

  const answers = new Map<string, { id: string; answer: string }>();
  for (const line of (await readFile(setPath, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as {
      id: string;
      question: string;
      answer: string;
    };
    answers.set(item.question, { id: item.id, answer: item.answer });
  }

  // Deterministic per-item knowledge: same id -> same verdict on every run,
  // so the attested score is reproducible.
  const knowsItem = (id: string): boolean =>
    createHash("sha256").update(`know:${id}`).digest()[0] / 255 < knows;

  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body) as ChatRequest;
      const question =
        parsed.messages?.findLast((m) => m.role === "user")?.content ?? "";
      const known = answers.get(question);
      const content =
        known && knowsItem(known.id) ? known.answer : "I don't know.";
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content } }],
        }),
      );
    });
  });
  server.listen(port, () => {
    console.log(
      `demo model on http://127.0.0.1:${port} — knows ${Math.round(knows * 100)}% of ${answers.size} items`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
