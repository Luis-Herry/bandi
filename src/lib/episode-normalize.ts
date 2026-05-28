export function dedupeEpisodesByNumber<T extends { number: number }>(
  rows: T[],
): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    out.push(row);
  }
  return out;
}
