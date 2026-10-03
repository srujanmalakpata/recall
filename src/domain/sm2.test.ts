import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Grade, Schedule } from './types';
import {
  FIRST_INTERVAL,
  INITIAL_EASE,
  MAX_INTERVAL,
  MIN_EASE,
  SECOND_INTERVAL,
  formatInterval,
  gradeToQuality,
  isDue,
  isPassingGrade,
  newSchedule,
  nextEase,
  previewIntervals,
  review,
} from './sm2';

const DAY = 20_000;

describe('newSchedule', () => {
  it('starts with the SM-2 defaults and is due immediately', () => {
    expect(newSchedule(DAY)).toEqual({
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      lapses: 0,
      dueDay: DAY,
      lastReviewedDay: null,
    });
    expect(isDue(newSchedule(DAY), DAY)).toBe(true);
  });
});

describe('grade mapping', () => {
  it('maps the four buttons to SM-2 qualities 1, 3, 4, 5', () => {
    expect([1, 2, 3, 4].map((g) => gradeToQuality(g as Grade))).toEqual([1, 3, 4, 5]);
  });

  it('treats only Again as a failed recall', () => {
    expect([1, 2, 3, 4].map((g) => isPassingGrade(g as Grade))).toEqual([false, true, true, true]);
  });
});

describe('nextEase', () => {
  it.each<[Grade, number]>([
    [1, 2.5 - 0.54],
    [2, 2.5 - 0.14],
    [3, 2.5],
    [4, 2.6],
  ])('grade %i from 2.5 gives %f (SM-2 formula)', (grade, expected) => {
    expect(nextEase(INITIAL_EASE, grade)).toBeCloseTo(expected, 10);
  });

  it('never drops below 1.3', () => {
    expect(nextEase(1.3, 1)).toBe(MIN_EASE);
    expect(nextEase(1.5, 1)).toBe(MIN_EASE);
  });
});

describe('review', () => {
  it('follows the classic 1 → 6 → 6×EF progression on Good', () => {
    let s = newSchedule(DAY);
    s = review(s, 3, DAY);
    expect(s).toMatchObject({ repetitions: 1, intervalDays: FIRST_INTERVAL, dueDay: DAY + 1 });
    s = review(s, 3, DAY + 1);
    expect(s).toMatchObject({ repetitions: 2, intervalDays: SECOND_INTERVAL, dueDay: DAY + 7 });
    s = review(s, 3, DAY + 7);
    expect(s).toMatchObject({ repetitions: 3, intervalDays: 15, dueDay: DAY + 22 }); // 6 × 2.5 (Good keeps EF)
  });

  it('grows the interval by the ease factor updated by this answer', () => {
    const s: Schedule = { ...newSchedule(DAY), repetitions: 2, intervalDays: 10, easeFactor: 2.0 };
    const after = review(s, 4, DAY);
    expect(after.easeFactor).toBeCloseTo(2.1, 10);
    expect(after.intervalDays).toBe(21); // 10 × 2.1
  });

  it('never shrinks the interval even when Hard pushes the ease to its floor', () => {
    const s: Schedule = { ...newSchedule(DAY), repetitions: 5, intervalDays: 2, easeFactor: 1.3 };
    expect(review(s, 2, DAY).intervalDays).toBe(3); // round(2 × 1.3) = 3, and at least 2 + 1
  });

  it('resets a forgotten learned card and counts a lapse', () => {
    const learned: Schedule = {
      repetitions: 4,
      easeFactor: 2.5,
      intervalDays: 40,
      lapses: 1,
      dueDay: DAY,
      lastReviewedDay: DAY - 40,
    };
    expect(review(learned, 1, DAY)).toEqual({
      repetitions: 0,
      easeFactor: 1.96,
      intervalDays: 1,
      lapses: 2,
      dueDay: DAY + 1,
      lastReviewedDay: DAY,
    });
  });

  it('changes the ease only on the first failure of the day, not on same-day repeats', () => {
    const learned: Schedule = {
      ...newSchedule(DAY - 6),
      repetitions: 2,
      intervalDays: 6,
      lastReviewedDay: DAY - 6,
    };
    let s = review(learned, 1, DAY); // first failure today: EF 2.5 → 1.96
    expect(s.easeFactor).toBeCloseTo(1.96, 10);
    s = review(s, 1, DAY); // repeats in the same session leave EF alone
    s = review(s, 1, DAY);
    expect(s.easeFactor).toBeCloseTo(1.96, 10);
    expect(s.lapses).toBe(1);
    s = review(s, 4, DAY); // passing the repeat (even with Easy) does not raise it either
    expect(s).toMatchObject({ easeFactor: 1.96, repetitions: 1, intervalDays: 1 });
    expect(review(s, 1, DAY + 1).easeFactor).toBeCloseTo(1.42, 10); // a new day counts again
  });

  it('does not count a lapse for a card that was never learned', () => {
    expect(review(newSchedule(DAY), 1, DAY).lapses).toBe(0);
  });

  it('caps intervals at MAX_INTERVAL', () => {
    const s: Schedule = { ...newSchedule(DAY), repetitions: 9, intervalDays: 30_000, easeFactor: 3 };
    expect(review(s, 4, DAY).intervalDays).toBe(MAX_INTERVAL);
  });

  it('does not mutate its input', () => {
    const s = Object.freeze(newSchedule(DAY));
    expect(() => review(s, 4, DAY)).not.toThrow();
    expect(s.repetitions).toBe(0);
  });
});

describe('previewIntervals', () => {
  it('reports what each button would schedule', () => {
    const s: Schedule = { ...newSchedule(DAY), repetitions: 2, intervalDays: 6, lastReviewedDay: DAY - 6 };
    // Hard: 6 × 2.36 = 14.16 → 14, Good: 6 × 2.5 = 15, Easy: 6 × 2.6 = 15.6 → 16
    expect(previewIntervals(s, DAY)).toEqual({ 1: 1, 2: 14, 3: 15, 4: 16 });
  });
});

describe('formatInterval', () => {
  it.each([
    [0, 'today'],
    [1, '1 day'],
    [6, '6 days'],
    [45, '2 mo'],
    [400, '1.1 yr'],
  ])('%i → %s', (days, text) => {
    expect(formatInterval(days)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests: invariants that must hold for any sequence of answers.
// ---------------------------------------------------------------------------

const gradeArb = fc.constantFrom<Grade>(1, 2, 3, 4);
const passingGradeArb = fc.constantFrom<Grade>(2, 3, 4);

/** Any schedule reachable by the algorithm: start new and apply random answers on random days. */
const reachableSchedule = fc
  .tuple(fc.integer({ min: 0, max: 40_000 }), fc.array(fc.tuple(gradeArb, fc.nat(400)), { maxLength: 30 }))
  .map(([start, answers]) => {
    let day = start;
    let s = newSchedule(day);
    for (const [grade, wait] of answers) {
      day += wait;
      s = review(s, grade, day);
    }
    return { schedule: s, day };
  });

describe('SM-2 invariants (fast-check)', () => {
  it('ease factor never falls below 1.3', () => {
    fc.assert(
      fc.property(reachableSchedule, gradeArb, ({ schedule, day }, grade) => {
        expect(review(schedule, grade, day).easeFactor).toBeGreaterThanOrEqual(MIN_EASE);
      }),
    );
  });

  it('a successful review never shortens the interval', () => {
    fc.assert(
      fc.property(reachableSchedule, passingGradeArb, ({ schedule, day }, grade) => {
        const next = review(schedule, grade, day);
        expect(next.intervalDays).toBeGreaterThanOrEqual(schedule.intervalDays);
        expect(next.intervalDays).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it('intervals strictly grow along any run of successful reviews (until the cap)', () => {
    fc.assert(
      fc.property(fc.array(passingGradeArb, { minLength: 2, maxLength: 25 }), (grades) => {
        let day = 0;
        let s = newSchedule(day);
        const intervals: number[] = [];
        for (const g of grades) {
          s = review(s, g, day);
          intervals.push(s.intervalDays);
          day = s.dueDay;
        }
        for (let i = 1; i < intervals.length; i += 1) {
          const prev = intervals[i - 1] ?? 0;
          const cur = intervals[i] ?? 0;
          expect(cur > prev || cur === MAX_INTERVAL).toBe(true);
        }
      }),
    );
  });

  it('Again always resets repetitions and schedules for tomorrow', () => {
    fc.assert(
      fc.property(reachableSchedule, ({ schedule, day }) => {
        const next = review(schedule, 1, day);
        expect(next.repetitions).toBe(0);
        expect(next.intervalDays).toBe(1);
        expect(next.dueDay).toBe(day + 1);
      }),
    );
  });

  it('due day is always the review day plus the interval, and the interval is a whole number in range', () => {
    fc.assert(
      fc.property(reachableSchedule, gradeArb, ({ schedule, day }, grade) => {
        const next = review(schedule, grade, day);
        expect(next.dueDay).toBe(day + next.intervalDays);
        expect(Number.isInteger(next.intervalDays)).toBe(true);
        expect(next.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL);
        expect(next.lastReviewedDay).toBe(day);
      }),
    );
  });

  it('lapses never decrease and only grow on Again', () => {
    fc.assert(
      fc.property(reachableSchedule, gradeArb, ({ schedule, day }, grade) => {
        const next = review(schedule, grade, day);
        expect(next.lapses - schedule.lapses).toBe(grade === 1 && schedule.repetitions > 0 ? 1 : 0);
      }),
    );
  });

  it('a better grade never gives a shorter interval than a worse one', () => {
    fc.assert(
      fc.property(reachableSchedule, ({ schedule, day }) => {
        const p = previewIntervals(schedule, day);
        expect(p[1]).toBeLessThanOrEqual(p[2]);
        expect(p[2]).toBeLessThanOrEqual(p[3]);
        expect(p[3]).toBeLessThanOrEqual(p[4]);
      }),
    );
  });
});
