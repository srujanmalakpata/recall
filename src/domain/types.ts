/**
 * Core entities. These are plain, serialisable data: the same shapes are stored
 * in IndexedDB, held in React state and written to JSON backups.
 */

/** A calendar day expressed as whole days since 1970-01-01 in the user's local time zone. */
export type DayNumber = number;

/** The four answer buttons. 1 = Again (forgot), 2 = Hard, 3 = Good, 4 = Easy. */
export type Grade = 1 | 2 | 3 | 4;

export const GRADES: readonly Grade[] = [1, 2, 3, 4];

export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/** Per-card SM-2 scheduling state. */
export interface Schedule {
  /** Consecutive successful reviews since the card was last forgotten. */
  readonly repetitions: number;
  /** SM-2 easiness factor; never below MIN_EASE. */
  readonly easeFactor: number;
  /** Days until the next review, as of the last review. 0 for a card never reviewed. */
  readonly intervalDays: number;
  /** How many times a learned card has been forgotten (graded Again). */
  readonly lapses: number;
  /** The day the card is next due. */
  readonly dueDay: DayNumber;
  /** The day of the most recent review, or null for a new card. */
  readonly lastReviewedDay: DayNumber | null;
}

export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: number;
}

export interface Card {
  readonly id: string;
  readonly deckId: string;
  readonly front: string;
  readonly back: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly schedule: Schedule;
}

/** One answered review. Logs are append-only and feed the statistics view. */
export interface ReviewLog {
  readonly id: string;
  readonly cardId: string;
  readonly deckId: string;
  readonly grade: Grade;
  /** Epoch milliseconds. */
  readonly reviewedAt: number;
  readonly day: DayNumber;
  /** True when the card had at least one successful repetition before this review. */
  readonly wasLearned: boolean;
  readonly intervalBefore: number;
  readonly intervalAfter: number;
  readonly easeAfter: number;
}

/** Everything the app stores, as written to and read from a JSON backup. */
export interface Snapshot {
  readonly decks: readonly Deck[];
  readonly cards: readonly Card[];
  readonly reviews: readonly ReviewLog[];
}
