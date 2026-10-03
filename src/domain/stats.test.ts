import { describe, expect, it } from 'vitest';
import { countCards, dueForecast, retention, reviewsPerDay } from './stats';
import { TODAY, makeCard, makeLog } from '../test/factories';

describe('reviewsPerDay', () => {
  it('returns one bucket per day ending today, oldest first', () => {
    const logs = [makeLog({ day: TODAY }), makeLog({ day: TODAY }), makeLog({ day: TODAY - 2 })];
    expect(reviewsPerDay(logs, TODAY, 3)).toEqual([
      { day: TODAY - 2, count: 1 },
      { day: TODAY - 1, count: 0 },
      { day: TODAY, count: 2 },
    ]);
  });

  it('ignores reviews outside the window', () => {
    const logs = [makeLog({ day: TODAY - 30 }), makeLog({ day: TODAY + 1 })];
    expect(reviewsPerDay(logs, TODAY, 30).every((d) => d.count === 0)).toBe(true);
  });
});

describe('retention', () => {
  it('is null when no learned card has been reviewed', () => {
    expect(retention([makeLog({ wasLearned: false })], TODAY)).toEqual({ passed: 0, total: 0, rate: null });
  });

  it('counts Hard or better as recalled, and only for learned cards', () => {
    const logs = [
      makeLog({ grade: 1 }),
      makeLog({ grade: 2 }),
      makeLog({ grade: 3 }),
      makeLog({ grade: 4 }),
      makeLog({ grade: 1, wasLearned: false }),
    ];
    expect(retention(logs, TODAY)).toEqual({ passed: 3, total: 4, rate: 0.75 });
  });
});

describe('dueForecast', () => {
  it('counts overdue cards on today and drops cards beyond the horizon', () => {
    const cards = [
      makeCard({ id: 'a', schedule: { ...makeCard().schedule, dueDay: TODAY - 5 } }),
      makeCard({ id: 'b', schedule: { ...makeCard().schedule, dueDay: TODAY } }),
      makeCard({ id: 'c', schedule: { ...makeCard().schedule, dueDay: TODAY + 2 } }),
      makeCard({ id: 'd', schedule: { ...makeCard().schedule, dueDay: TODAY + 99 } }),
    ];
    expect(dueForecast(cards, TODAY, 3).map((d) => d.count)).toEqual([2, 0, 1]);
  });
});

describe('countCards', () => {
  it('classifies new, learning and mature cards and counts due ones', () => {
    const base = makeCard().schedule;
    const cards = [
      makeCard({ id: 'new' }),
      makeCard({
        id: 'learning',
        schedule: { ...base, lastReviewedDay: TODAY - 1, intervalDays: 6, dueDay: TODAY + 5 },
      }),
      makeCard({
        id: 'mature',
        schedule: { ...base, lastReviewedDay: TODAY - 1, intervalDays: 30, dueDay: TODAY - 1 },
      }),
    ];
    expect(countCards(cards, TODAY)).toEqual({ total: 3, newCards: 1, learning: 1, mature: 1, due: 2 });
  });
});
