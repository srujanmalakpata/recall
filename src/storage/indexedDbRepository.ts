/**
 * IndexedDB implementation of Repository, using the small `idb` promise wrapper.
 *
 * Schema (version 1):
 *   decks    keyPath id
 *   cards    keyPath id, index byDeck(deckId)
 *   reviews  keyPath id, indexes byCard(cardId), byDeck(deckId)
 *   flags    out-of-line keys → boolean
 *
 * Multi-store writes run in one readwrite transaction, so they commit or roll back together.
 * Read-modify-write operations (updateCard, recordReview) read the stored card inside the
 * same transaction and call a synchronous callback, so the transaction stays active.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Card, Deck, ReviewLog, Snapshot } from '../domain/types';
import {
  MISSING_CARD_MESSAGE,
  MISSING_DECK_MESSAGE,
  type Repository,
  type ReviewBuilder,
} from './repository';

export const DB_NAME = 'recall-flashcards';
export const DB_VERSION = 1;

interface RecallDB extends DBSchema {
  decks: { key: string; value: Deck };
  cards: { key: string; value: Card; indexes: { byDeck: string } };
  reviews: { key: string; value: ReviewLog; indexes: { byCard: string; byDeck: string } };
  flags: { key: string; value: boolean };
}

export class IndexedDbRepository implements Repository {
  private constructor(private readonly db: IDBPDatabase<RecallDB>) {}

  static async open(name = DB_NAME): Promise<IndexedDbRepository> {
    const db = await openDB<RecallDB>(name, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('decks', { keyPath: 'id' });
          const cards = database.createObjectStore('cards', { keyPath: 'id' });
          cards.createIndex('byDeck', 'deckId');
          const reviews = database.createObjectStore('reviews', { keyPath: 'id' });
          reviews.createIndex('byCard', 'cardId');
          reviews.createIndex('byDeck', 'deckId');
          database.createObjectStore('flags');
        }
      },
    });
    return new IndexedDbRepository(db);
  }

  close(): void {
    this.db.close();
  }

  async loadAll(): Promise<Snapshot> {
    const tx = this.db.transaction(['decks', 'cards', 'reviews'], 'readonly');
    const [decks, cards, reviews] = await Promise.all([
      tx.objectStore('decks').getAll(),
      tx.objectStore('cards').getAll(),
      tx.objectStore('reviews').getAll(),
    ]);
    await tx.done;
    return { decks, cards, reviews };
  }

  async saveDeck(deck: Deck): Promise<void> {
    await this.db.put('decks', deck);
  }

  async addDecksWithCards(decks: readonly Deck[], cards: readonly Card[], flag?: string): Promise<void> {
    const tx = this.db.transaction(['decks', 'cards', 'flags'], 'readwrite');
    await Promise.all([
      ...decks.map((d) => tx.objectStore('decks').put(d)),
      ...cards.map((c) => tx.objectStore('cards').put(c)),
      ...(flag === undefined ? [] : [tx.objectStore('flags').put(true, flag)]),
      tx.done,
    ]);
  }

  async deleteDeck(deckId: string): Promise<void> {
    const tx = this.db.transaction(['decks', 'cards', 'reviews'], 'readwrite');
    const cardKeys = await tx.objectStore('cards').index('byDeck').getAllKeys(deckId);
    const reviewKeys = await tx.objectStore('reviews').index('byDeck').getAllKeys(deckId);
    await Promise.all([
      tx.objectStore('decks').delete(deckId),
      ...cardKeys.map((k) => tx.objectStore('cards').delete(k)),
      ...reviewKeys.map((k) => tx.objectStore('reviews').delete(k)),
      tx.done,
    ]);
  }

  async saveCards(cards: readonly Card[]): Promise<void> {
    // The deck check and the writes share one transaction, so a deck deleted in another
    // tab cannot slip in between them. Nothing has been written when the check throws.
    const tx = this.db.transaction(['decks', 'cards'], 'readwrite');
    const deckIds = [...new Set(cards.map((c) => c.deckId))];
    const keys = await Promise.all(deckIds.map((id) => tx.objectStore('decks').getKey(id)));
    if (keys.some((key) => key === undefined)) throw new Error(MISSING_DECK_MESSAGE);
    await Promise.all([...cards.map((c) => tx.objectStore('cards').put(c)), tx.done]);
  }

  async deleteCard(cardId: string): Promise<void> {
    const tx = this.db.transaction(['cards', 'reviews'], 'readwrite');
    const reviewKeys = await tx.objectStore('reviews').index('byCard').getAllKeys(cardId);
    await Promise.all([
      tx.objectStore('cards').delete(cardId),
      ...reviewKeys.map((k) => tx.objectStore('reviews').delete(k)),
      tx.done,
    ]);
  }

  async updateCard(cardId: string, update: (stored: Card) => Card): Promise<Card> {
    const tx = this.db.transaction('cards', 'readwrite');
    const stored = await tx.store.get(cardId);
    // Nothing is written if the card is gone or `update` throws; the read-only
    // transaction then simply completes.
    if (!stored) throw new Error(MISSING_CARD_MESSAGE);
    const card = update(stored);
    await Promise.all([tx.store.put(card), tx.done]);
    return card;
  }

  async recordReview(cardId: string, build: ReviewBuilder): Promise<{ card: Card; log: ReviewLog }> {
    // The card is read and rewritten inside one transaction, so two tabs grading the
    // same card cannot both start from the same old schedule.
    const tx = this.db.transaction(['cards', 'reviews'], 'readwrite');
    const stored = await tx.objectStore('cards').get(cardId);
    if (!stored) throw new Error(MISSING_CARD_MESSAGE);
    const result = build(stored);
    await Promise.all([
      tx.objectStore('cards').put(result.card),
      tx.objectStore('reviews').put(result.log),
      tx.done,
    ]);
    return result;
  }

  async replaceAll(snapshot: Snapshot): Promise<void> {
    const tx = this.db.transaction(['decks', 'cards', 'reviews'], 'readwrite');
    const decks = tx.objectStore('decks');
    const cards = tx.objectStore('cards');
    const reviews = tx.objectStore('reviews');
    await Promise.all([decks.clear(), cards.clear(), reviews.clear()]);
    await Promise.all([
      ...snapshot.decks.map((d) => decks.put(d)),
      ...snapshot.cards.map((c) => cards.put(c)),
      ...snapshot.reviews.map((r) => reviews.put(r)),
      tx.done,
    ]);
  }

  async getFlag(key: string): Promise<boolean> {
    return (await this.db.get('flags', key)) ?? false;
  }

  async setFlag(key: string, value: boolean): Promise<void> {
    await this.db.put('flags', value, key);
  }
}
