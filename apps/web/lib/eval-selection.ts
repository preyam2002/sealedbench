import type { LeaderboardRow } from "./types";

export function sortRowsBySealDate(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => b.eval.sealedAtMs - a.eval.sealedAtMs);
}

export function defaultSelectedEvalId(rows: LeaderboardRow[]): string {
  return sortRowsBySealDate(rows)[0]?.eval.objectId ?? "";
}

export function rowById(
  rows: LeaderboardRow[],
  id: string,
): LeaderboardRow | undefined {
  return rows.find(
    (row) => row.eval.objectId.toLowerCase() === id.toLowerCase(),
  );
}
