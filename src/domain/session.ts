/**
 * The review-session state machine, kept pure so it can be unit-tested without React.
 *
 *   showingQuestion --reveal--> showingAnswer --grade--> showingQuestion | finished
 *
 * A card graded Again goes to the back of the queue so it is seen again before the
 * session ends. This is the app's simplification of SM-2 step 7, which repeats every
 * item scored below quality 4 (that would include Hard); see DESIGN.md.
 */
import type { Card, DayNumber, Grade } from './types';
import { isDue, isPassingGrade } from './sm2';

export interface SessionState {
  /** Card ids still to answer; the head is the current card. */
  readonly queue: readonly string[];
  readonly revealed: boolean;
  /** Distinct cards answered at least once. */
  readonly answered: number;
  /** Total answers, including repeats of failed cards. */
  readonly reviews: number;
  readonly failed: number;
  /** Cards in the session when it started, for "3 of 10" progress. */
  readonly total: number;
  readonly seen: ReadonlySet<string>;
}

export type SessionAction =
  | { readonly type: 'reveal' }
  | { readonly type: 'grade'; readonly grade: Grade }
  | { readonly type: 'restart'; readonly queue: readonly string[] }
  /**
   * Remove a card from the session entirely: it no longer exists, or another tab already
   * reviewed it. It leaves the total and, if it was answered here, the answered count.
   */
  | { readonly type: 'drop'; readonly cardId: string };

export const DEFAULT_SESSION_LIMIT = 100;

/** Due cards, most overdue first, then oldest first, capped at `limit`. */
export function selectDueCards(
  cards: readonly Card[],
  today: DayNumber,
  limit = DEFAULT_SESSION_LIMIT,
): Card[] {
  return cards
    .filter((c) => isDue(c.schedule, today))
    .sort((a, b) => a.schedule.dueDay - b.schedule.dueDay || a.createdAt - b.createdAt)
    .slice(0, limit);
}

export function startSession(queue: readonly string[]): SessionState {
  return {
    queue,
    revealed: false,
    answered: 0,
    reviews: 0,
    failed: 0,
    total: queue.length,
    seen: new Set(),
  };
}

export function currentCardId(state: SessionState): string | undefined {
  return state.queue[0];
}

export function isFinished(state: SessionState): boolean {
  return state.queue.length === 0;
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'restart':
      return startSession(action.queue);
    case 'drop': {
      if (!state.queue.includes(action.cardId)) return state;
      const queue = state.queue.filter((id) => id !== action.cardId);
      const wasCurrent = state.queue[0] === action.cardId;
      const wasSeen = state.seen.has(action.cardId);
      const seen = new Set(state.seen);
      seen.delete(action.cardId);
      return {
        ...state,
        queue,
        total: state.total - 1,
        answered: state.answered - (wasSeen ? 1 : 0),
        seen,
        revealed: wasCurrent ? false : state.revealed,
      };
    }
    case 'reveal':
      if (isFinished(state) || state.revealed) return state;
      return { ...state, revealed: true };
    case 'grade': {
      const [head, ...rest] = state.queue;
      if (head === undefined || !state.revealed) return state;
      const passed = isPassingGrade(action.grade);
      const firstTime = !state.seen.has(head);
      const seen = new Set(state.seen).add(head);
      return {
        ...state,
        queue: passed ? rest : [...rest, head],
        revealed: false,
        answered: state.answered + (firstTime ? 1 : 0),
        reviews: state.reviews + 1,
        failed: state.failed + (passed ? 0 : 1),
        seen,
      };
    }
  }
}
