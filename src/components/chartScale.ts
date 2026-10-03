/**
 * Round an axis maximum up to a "nice" even number (1, 2, 4, 6 or 8 × 10ⁿ, at least 4),
 * so the max and the midline gridline are both whole numbers: counts never get a "12.5" tick.
 */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 4, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value && candidate % 2 === 0) return candidate;
  }
  return 10 * magnitude;
}
