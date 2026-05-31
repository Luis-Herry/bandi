export const RATING_STEPS = [
  0.5,
  1,
  1.5,
  2,
  2.5,
  3,
  3.5,
  4,
  4.5,
  5,
] as const;

export type RatingValue = (typeof RATING_STEPS)[number];

export function normalizeRatingInput(value: unknown): RatingValue | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 2) / 2;
  const clamped = Math.max(0.5, Math.min(5, rounded));
  return clamped as RatingValue;
}

export function formatRatingScore(value: number | null | undefined): string {
  if (value == null || value <= 0) return "--";
  const normalized = normalizeRatingInput(value);
  if (normalized == null) return "--";
  return (normalized * 2).toFixed(1);
}

export function getStarFillPercent(starIndex: number, rating: number): 0 | 50 | 100 {
  if (!Number.isFinite(rating) || rating <= starIndex - 1) return 0;
  if (rating >= starIndex) return 100;
  return rating >= starIndex - 0.5 ? 50 : 0;
}

export function formatStarRatingLabel(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} 星`;
}
