import { validateHeldoutSetFile } from "../packages/shared/src/heldout.ts";

const setPath = process.argv[2];

if (!setPath) {
  console.error("usage: pnpm tsx tools/validate_set.ts <jsonl-file>");
  process.exit(1);
}

try {
  const result = await validateHeldoutSetFile(setPath);
  console.log(
    JSON.stringify(
      {
        itemCount: result.items.length,
        sha256: result.sha256,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
