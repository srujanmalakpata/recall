/** Pure statistics over cards and review logs. The stats view only renders these numbers. */
import type { Card, DayNumber, ReviewLog } from './types';
import { isDue, isPassingGrade } from './sm2';

export interface DayCount {
  readonly day: DayNumber;
  readonly count: number;
}

/** Reviews answered on each of the last `days` days, oldest first, ending today. */
export function reviewsPerDay(reviews: readonly ReviewLog[], today: DayNumber, days = 30): DayCount[] {
  const first = today - days + 1;
  const counts = new Array<number>(days).fill(0);
  for (const log of reviews) {
    if (log.day >= first && log.day <= today) {
      counts[log.day - first] = (counts[log.day - first] ?? 0) + 1;
    }
  }
  return counts.map((count, i) => ({ day: first + i, count }));
}

export interface Retention {
  readonly passed: number;
  readonly total: number;
  /** passed / total, or null when there is nothing to measure yet. */
  readonly rate: number | null;
}

/**
 * True retention: of the reviews of cards that had already been learned, how many
 * were recalled (graded Hard or better). Exclude first exposures: they do not measure
 * retention of learned cards.
 */
export function retention(reviews: readonly ReviewLog[], today: DayNumber, windowDays = 30): Retention {
  const first = today - windowDays + 1;
  let passed = 0;
  let total = 0;
  for (const log of reviews) {
    if (!log.wasLearned || log.day < first || log.day > today) continue;
    total += 1;
    if (isPassingGrade(log.grade)) passed += 1;
  }
  return { passed, total, rate: total === 0 ? null : passed / total };
}

/**
 * How many cards fall due on each of the next `days` days, starting today.
 * Overdue cards are counted on today, because that is when they will be shown.
 */
export function dueForecast(cards: readonly Card[], today: DayNumber, days = 14): DayCount[] {
  const counts = new Array<number>(days).fill(0);
  for (const card of cards) {
    const offset = Math.max(0, card.schedule.dueDay - today);
    if (offset < days) counts[offset] = (counts[offset] ?? 0) + 1;
  }
  return counts.map((count, i) => ({ day: today + i, count }));
}

export interface CardCounts {
  readonly total: number;
  readonly newCards: number;
  readonly learning: number;
  /** Interval of 21 days or more, the usual "mature" threshold. */
  readonly mature: number;
  readonly due: number;
}

export const MATURE_INTERVAL = 21;

export function countCards(cards: readonly Card[], today: DayNumber): CardCounts {
  let newCards = 0;
  let learning = 0;
  let mature = 0;
  let due = 0;
  for (const { schedule } of cards) {
    if (schedule.lastReviewedDay === null) newCards += 1;
    else if (schedule.intervalDays >= MATURE_INTERVAL) mature += 1;
    else learning += 1;
    if (isDue(schedule, today)) due += 1;
  }
  return { total: cards.length, newCards, learning, mature, due };
}
