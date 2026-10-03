/**
 * The persistence boundary. The UI and state layer only ever talk to this
 * interface; IndexedDB in the browser, an in-memory map in tests.
 *
 * Every method is a single atomic unit of work: a review reads the stored card and
 * writes the updated card and its log together, importing a deck stores the deck and
 * its cards together, deleting a deck removes its cards and their logs, and restoring
 * a backup replaces everything or nothing.
 */
import type { Card, Deck, ReviewLog, Snapshot } from '../domain/types';

/** Computes the rescheduled card and its review log from the card as currently stored. */
export type ReviewBuilder = (stored: Card) => { readonly card: Card; readonly log: ReviewLog };

export const MISSING_CARD_MESSAGE = 'That card no longer exists.';
export const MISSING_DECK_MESSAGE = 'That deck no longer exists.';

export interface Repository {
  loadAll(): Promise<Snapshot>;
  saveDeck(deck: Deck): Promise<void>;
  /** Stores new decks together with their cards (and optionally sets a flag), all or nothing. */
  addDecksWithCards(decks: readonly Deck[], cards: readonly Card[], flag?: string): Promise<void>;
  /** Removes the deck, its cards and their review logs. */
  deleteDeck(deckId: string): Promise<void>;
  /**
   * Inserts or replaces cards (bulk import into an existing deck). Rejects with
   * MISSING_DECK_MESSAGE, writing nothing, if a card's deck is gone (deleted in another
   * tab), so no orphan card can reach a backup that would then fail to restore.
   */
  saveCards(cards: readonly Card[]): Promise<void>;
  /**
   * Read-modify-write of one stored card in a single transaction. `update` runs
   * synchronously on the stored version, so an edit made from a stale copy in another
   * tab cannot overwrite a newer schedule. Rejects with MISSING_CARD_MESSAGE if the card is gone.
   */
  updateCard(cardId: string, update: (stored: Card) => Card): Promise<Card>;
  /** Removes a card and its review logs. */
  deleteCard(cardId: string): Promise<void>;
  /**
   * Reads the stored card, lets `build` compute the rescheduled card and its log from it,
   * and stores both in the same transaction. Rejects with MISSING_CARD_MESSAGE if the card is gone.
   */
  recordReview(cardId: string, build: ReviewBuilder): Promise<{ card: Card; log: ReviewLog }>;
  /** Replaces all data with the snapshot (backup restore). */
  replaceAll(snapshot: Snapshot): Promise<void>;
  /** Small key/value flags, e.g. whether the sample decks were already offered. */
  getFlag(key: string): Promise<boolean>;
  setFlag(key: string, value: boolean): Promise<void>;
}
