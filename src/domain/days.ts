import type { DayNumber } from './types';

const MS_PER_DAY = 86_400_000;

/**
 * Convert an instant to a local calendar day number. Scheduling works in whole
 * days: "due tomorrow" follows the user's wall clock rather than 24 hours after a review.
 */
export function toDayNumber(date: Date): DayNumber {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return Math.floor(localMs / MS_PER_DAY);
}

/** ISO date (YYYY-MM-DD) for a day number, used for chart labels and CSV-friendly output. */
export function dayToIsoDate(day: DayNumber): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Short human label such as "Oct 3" for chart axes. */
export function dayToShortLabel(day: DayNumber): string {
  return new Date(day * MS_PER_DAY).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
