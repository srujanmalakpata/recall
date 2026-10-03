import type { Card, Deck, ReviewLog, Snapshot } from '../domain/types';
import {
  MISSING_CARD_MESSAGE,
  MISSING_DECK_MESSAGE,
  type Repository,
  type ReviewBuilder,
} from './repository';

/** Map-backed repository for unit/component tests and as a reference implementation. */
export class MemoryRepository implements Repository {
  private decks = new Map<string, Deck>();
  private cards = new Map<string, Card>();
  private reviews = new Map<string, ReviewLog>();
  private flags = new Map<string, boolean>();

  constructor(initial?: Snapshot) {
    if (initial) this.load(initial);
  }

  private load(snapshot: Snapshot): void {
    this.decks = new Map(snapshot.decks.map((d) => [d.id, d]));
    this.cards = new Map(snapshot.cards.map((c) => [c.id, c]));
    this.reviews = new Map(snapshot.reviews.map((r) => [r.id, r]));
  }

  loadAll(): Promise<Snapshot> {
    return Promise.resolve({
      decks: [...this.decks.values()],
      cards: [...this.cards.values()],
      reviews: [...this.reviews.values()],
    });
  }

  saveDeck(deck: Deck): Promise<void> {
    this.decks.set(deck.id, deck);
    return Promise.resolve();
  }

  addDecksWithCards(decks: readonly Deck[], cards: readonly Card[], flag?: string): Promise<void> {
    for (const deck of decks) this.decks.set(deck.id, deck);
    for (const card of cards) this.cards.set(card.id, card);
    if (flag !== undefined) this.flags.set(flag, true);
    return Promise.resolve();
  }

  deleteDeck(deckId: string): Promise<void> {
    this.decks.delete(deckId);
    for (const card of [...this.cards.values()]) {
      if (card.deckId === deckId) this.cards.delete(card.id);
    }
    for (const log of [...this.reviews.values()]) {
      if (log.deckId === deckId) this.reviews.delete(log.id);
    }
    return Promise.resolve();
  }

  saveCards(cards: readonly Card[]): Promise<void> {
    if (cards.some((card) => !this.decks.has(card.deckId))) {
      return Promise.reject(new Error(MISSING_DECK_MESSAGE));
    }
    for (const card of cards) this.cards.set(card.id, card);
    return Promise.resolve();
  }

  deleteCard(cardId: string): Promise<void> {
    this.cards.delete(cardId);
    for (const log of [...this.reviews.values()]) {
      if (log.cardId === cardId) this.reviews.delete(log.id);
    }
    return Promise.resolve();
  }

  updateCard(cardId: string, update: (stored: Card) => Card): Promise<Card> {
    try {
      const card = update(this.storedCard(cardId));
      this.cards.set(card.id, card);
      return Promise.resolve(card);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  recordReview(cardId: string, build: ReviewBuilder): Promise<{ card: Card; log: ReviewLog }> {
    try {
      const result = build(this.storedCard(cardId));
      this.cards.set(result.card.id, result.card);
      this.reviews.set(result.log.id, result.log);
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private storedCard(cardId: string): Card {
    const stored = this.cards.get(cardId);
    if (!stored) throw new Error(MISSING_CARD_MESSAGE);
    return stored;
  }

  replaceAll(snapshot: Snapshot): Promise<void> {
    this.load(snapshot);
    return Promise.resolve();
  }

  getFlag(key: string): Promise<boolean> {
    return Promise.resolve(this.flags.get(key) ?? false);
  }

  setFlag(key: string, value: boolean): Promise<void> {
    this.flags.set(key, value);
    return Promise.resolve();
  }
}
