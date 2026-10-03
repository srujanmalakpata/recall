/**
 * In-memory mirror of the repository. Every change is written to the repository
 * first and only then dispatched here, so the UI never shows data that failed to save.
 */
import type { Card, Deck, ReviewLog, Snapshot } from '../domain/types';

export interface AppState {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly decks: readonly Deck[];
  readonly cards: readonly Card[];
  readonly reviews: readonly ReviewLog[];
  readonly error: string | null;
}

export type AppAction =
  | { readonly type: 'loaded'; readonly snapshot: Snapshot }
  | { readonly type: 'loadFailed'; readonly error: string }
  /** Another tab changed the database; replace the mirror but keep any error banner. */
  | { readonly type: 'synced'; readonly snapshot: Snapshot }
  | { readonly type: 'deckSaved'; readonly deck: Deck }
  | { readonly type: 'deckDeleted'; readonly deckId: string }
  | { readonly type: 'cardsSaved'; readonly cards: readonly Card[] }
  | { readonly type: 'cardDeleted'; readonly cardId: string }
  | { readonly type: 'reviewRecorded'; readonly card: Card; readonly log: ReviewLog }
  | { readonly type: 'error'; readonly error: string | null };

export const initialAppState: AppState = {
  status: 'loading',
  decks: [],
  cards: [],
  reviews: [],
  error: null,
};

function upsert<T extends { readonly id: string }>(items: readonly T[], updates: readonly T[]): T[] {
  const byId = new Map(updates.map((u) => [u.id, u]));
  const merged = items.map((item) => byId.get(item.id) ?? item);
  const existing = new Set(items.map((i) => i.id));
  return [...merged, ...updates.filter((u) => !existing.has(u.id))];
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', ...action.snapshot, error: null };
    case 'synced':
      return state.status === 'ready' ? { ...state, ...action.snapshot } : state;
    case 'loadFailed':
      return { ...state, status: 'failed', error: action.error };
    case 'deckSaved':
      return { ...state, decks: upsert(state.decks, [action.deck]) };
    case 'deckDeleted':
      return {
        ...state,
        decks: state.decks.filter((d) => d.id !== action.deckId),
        cards: state.cards.filter((c) => c.deckId !== action.deckId),
        reviews: state.reviews.filter((r) => r.deckId !== action.deckId),
      };
    case 'cardsSaved':
      return { ...state, cards: upsert(state.cards, action.cards) };
    case 'cardDeleted':
      return {
        ...state,
        cards: state.cards.filter((c) => c.id !== action.cardId),
        reviews: state.reviews.filter((r) => r.cardId !== action.cardId),
      };
    case 'reviewRecorded':
      return {
        ...state,
        cards: upsert(state.cards, [action.card]),
        reviews: [...state.reviews, action.log],
      };
    case 'error':
      return { ...state, error: action.error };
  }
}
