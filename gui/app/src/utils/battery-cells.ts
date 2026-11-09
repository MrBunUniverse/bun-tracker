/** Battery percent clamped to 0..100 and rounded, or null when unknown. */
export function batteryLevel(pct: number | null | undefined): number | null {
  if (pct == null || Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * How red a tracker card's motion rim turns, 0-1. None at 50% and above; below 50% it jumps to a visible 0.3 tint,
 * then deepens to full red at 10% and below. Unknown is 0.
 */
export function batteryRedness(pct: number | null | undefined): number {
  const level = batteryLevel(pct);
  if (level == null || level >= 50) return 0;
  return 0.3 + 0.7 * Math.min(1, (50 - level) / 40);
}
