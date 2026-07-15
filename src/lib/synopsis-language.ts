function normalizeSynopsis(value: string | null | undefined): string | null {
  const normalized = value
    ?.replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return normalized || null;
}

/**
 * Chinese copy is Han-heavy and contains little or no kana. A small kana
 * allowance keeps Chinese introductions that mention a Japanese title from
 * being misclassified.
 */
export function isLikelyChineseSynopsis(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeSynopsis(value);
  if (!normalized) return false;
  const hanCount = normalized.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (hanCount === 0) return false;
  const kanaCount =
    normalized.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  return kanaCount <= 2 || hanCount >= kanaCount * 4;
}

/** Prefer the first Chinese synopsis, then preserve source order as fallback. */
export function selectPreferredSynopsis(
  ...candidates: Array<string | null | undefined>
): string | null {
  const normalized = candidates
    .map(normalizeSynopsis)
    .filter((value): value is string => value != null);
  return normalized.find(isLikelyChineseSynopsis) ?? normalized[0] ?? null;
}
