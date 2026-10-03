/**
 * SM-2 spaced-repetition scheduler (Wozniak, 1987), adapted to four answer buttons.
 *
 * Pure and framework-free: no clock, no randomness, no I/O. The caller passes the
 * current day, so every result is reproducible in tests.
 *
 * Grade → SM-2 quality (0..5):
 *   Again → 1 (failed recall)   Hard → 3   Good → 4   Easy → 5
 *
 * On success (quality ≥ 3): interval 1 day, then 6 days, then previous × EF
 * (using the EF updated by this answer).
 * On failure: repetitions reset to 0, interval back to 1 day, lapse counted.
 * EF' = EF + (0.1 − (5 − q)(0.08 + (5 − q)·0.02)), clamped to ≥ 1.3.
 *
 * Two same-day rules are this app's interpretation of SM-2, not the paper's literal text
 * (DESIGN.md, "SM-2 deviations"):
 *   - Same-day repeats of a card that was just failed leave EF unchanged (inspired by
 *     step 6, "without changing the E-Factor", which the paper states for any failure).
 *   - Only Again is re-queued in the session (session.ts). Step 7 repeats every item
 *     scored below quality 4, which would include Hard (q = 3).
 */
import type { DayNumber, Grade, Schedule } from './types';

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 6;
/** Upper bound so a long run of Easy answers cannot schedule a card centuries out. */
export const MAX_INTERVAL = 36_500;

const QUALITY: Readonly<Record<Grade, number>> = { 1: 1, 2: 3, 3: 4, 4: 5 };

export function gradeToQuality(grade: Grade): number {
  return QUALITY[grade];
}

export function isPassingGrade(grade: Grade): boolean {
  return gradeToQuality(grade) >= 3;
}

/** A brand-new card, due on the day it was created. */
export function newSchedule(today: DayNumber): Schedule {
  return {
    repetitions: 0,
    easeFactor: INITIAL_EASE,
    intervalDays: 0,
    lapses: 0,
    dueDay: today,
    lastReviewedDay: null,
  };
}

/** The SM-2 easiness update for one answer, clamped to MIN_EASE. */
export function nextEase(easeFactor: number, grade: Grade): number {
  const q = gradeToQuality(grade);
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  // Round to avoid floating-point drift (2.5 - 0.14 = 2.3600000000000003).
  const updated = Math.round((easeFactor + delta) * 1000) / 1000;
  return Math.max(MIN_EASE, updated);
}

/**
 * Apply one review to a card's schedule and return the new schedule.
 * The input is never mutated.
 */
export function review(schedule: Schedule, grade: Grade, today: DayNumber): Schedule {
  // This app's rule (not literal SM-2): a same-day repeat of a card failed today leaves EF
  // unchanged. Without it, failing one card three times in a session would drive EF from
  // 2.5 to 1.3.
  const relearningToday = schedule.repetitions === 0 && schedule.lastReviewedDay === today;
  const easeFactor = relearningToday ? schedule.easeFactor : nextEase(schedule.easeFactor, grade);

  if (!isPassingGrade(grade)) {
    const wasLearned = schedule.repetitions > 0;
    return {
      repetitions: 0,
      easeFactor,
      intervalDays: FIRST_INTERVAL,
      lapses: schedule.lapses + (wasLearned ? 1 : 0),
      dueDay: today + FIRST_INTERVAL,
      lastReviewedDay: today,
    };
  }

  let intervalDays: number;
  if (schedule.repetitions === 0) {
    intervalDays = FIRST_INTERVAL;
  } else if (schedule.repetitions === 1) {
    intervalDays = SECOND_INTERVAL;
  } else {
    // Multiply by the EF *after* this answer, so Hard/Good/Easy already differ on
    // this review (with the pre-answer EF all three would give the same interval).
    // The max() guarantees a successful review never shortens the interval.
    const grown = Math.round(schedule.intervalDays * easeFactor);
    intervalDays = Math.max(schedule.intervalDays + 1, grown);
  }
  intervalDays = Math.min(intervalDays, MAX_INTERVAL);

  return {
    repetitions: schedule.repetitions + 1,
    easeFactor,
    intervalDays,
    lapses: schedule.lapses,
    dueDay: today + intervalDays,
    lastReviewedDay: today,
  };
}

/** What each button would do, for the "Good · 6d" hints on the answer buttons. */
export function previewIntervals(schedule: Schedule, today: DayNumber): Record<Grade, number> {
  return {
    1: review(schedule, 1, today).intervalDays,
    2: review(schedule, 2, today).intervalDays,
    3: review(schedule, 3, today).intervalDays,
    4: review(schedule, 4, today).intervalDays,
  };
}

export function isDue(schedule: Schedule, today: DayNumber): boolean {
  return schedule.dueDay <= today;
}

/**
 * True when grading the card today is a real review: it is due, or it was failed today
 * and is being relearned in the session. False for a card already passed today (for
 * example in another tab), which a second grade would push even further out.
 */
export function isReviewable(schedule: Schedule, today: DayNumber): boolean {
  return isDue(schedule, today) || (schedule.repetitions === 0 && schedule.lastReviewedDay === today);
}

/** "1 day", "6 days", "3 mo", "1.2 yr" – compact interval text for buttons and announcements. */
export function formatInterval(days: number): string {
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 31) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}
