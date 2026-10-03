/** Small builders shared by tests. */
import type { Card, Deck, Grade, ReviewLog } from '../domain/types';
import { newSchedule } from '../domain/sm2';

export const TODAY = 20_000; // 2024-10-04

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Deck', description: '', createdAt: 1, ...overrides };
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    front: 'Q',
    back: 'A',
    createdAt: 1,
    updatedAt: 1,
    schedule: newSchedule(TODAY),
    ...overrides,
  };
}

export function makeLog(overrides: Partial<ReviewLog> & { grade?: Grade } = {}): ReviewLog {
  return {
    id: `log-${Math.random().toString(36).slice(2)}`,
    cardId: 'card-1',
    deckId: 'deck-1',
    grade: 3,
    reviewedAt: TODAY * 86_400_000,
    day: TODAY,
    wasLearned: true,
    intervalBefore: 1,
    intervalAfter: 6,
    easeAfter: 2.5,
    ...overrides,
  };
}
