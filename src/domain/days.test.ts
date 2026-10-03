import { describe, expect, it } from 'vitest';
import { dayToIsoDate, dayToShortLabel, toDayNumber } from './days';

describe('days', () => {
  it('maps a local date to a day number and back to an ISO date', () => {
    const day = toDayNumber(new Date(2026, 9, 3, 23, 59)); // 3 Oct 2026, local time
    expect(dayToIsoDate(day)).toBe('2026-10-03');
    expect(dayToShortLabel(day)).toBe('Oct 3');
  });

  it('keeps every moment of one local day on the same day number', () => {
    expect(toDayNumber(new Date(2026, 0, 1, 0, 0))).toBe(toDayNumber(new Date(2026, 0, 1, 23, 59, 59)));
    expect(toDayNumber(new Date(2026, 0, 2, 0, 0)) - toDayNumber(new Date(2026, 0, 1, 12, 0))).toBe(1);
  });
});
