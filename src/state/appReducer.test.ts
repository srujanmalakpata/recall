import { describe, expect, it } from 'vitest';
import { appReducer, initialAppState } from './appReducer';
import { makeCard, makeDeck, makeLog } from '../test/factories';

const loaded = appReducer(initialAppState, {
  type: 'loaded',
  snapshot: {
    decks: [makeDeck({ id: 'd1' }), makeDeck({ id: 'd2' })],
    cards: [makeCard({ id: 'a', deckId: 'd1' }), makeCard({ id: 'b', deckId: 'd2' })],
    reviews: [
      makeLog({ id: 'ra', cardId: 'a', deckId: 'd1' }),
      makeLog({ id: 'rb', cardId: 'b', deckId: 'd2' }),
    ],
  },
});

describe('appReducer', () => {
  it('becomes ready when loaded', () => {
    expect(loaded.status).toBe('ready');
    expect(loaded.cards).toHaveLength(2);
  });

  it('upserts cards, replacing by id and appending new ones', () => {
    const next = appReducer(loaded, {
      type: 'cardsSaved',
      cards: [makeCard({ id: 'a', deckId: 'd1', front: 'edited' }), makeCard({ id: 'c', deckId: 'd1' })],
    });
    expect(next.cards.map((c) => [c.id, c.front])).toEqual([
      ['a', 'edited'],
      ['b', 'Q'],
      ['c', 'Q'],
    ]);
  });

  it('cascades a deck deletion like the repository does', () => {
    const next = appReducer(loaded, { type: 'deckDeleted', deckId: 'd1' });
    expect(next.decks.map((d) => d.id)).toEqual(['d2']);
    expect(next.cards.map((c) => c.id)).toEqual(['b']);
    expect(next.reviews.map((r) => r.id)).toEqual(['rb']);
  });

  it('appends a review and updates its card', () => {
    const card = makeCard({ id: 'a', deckId: 'd1', schedule: { ...makeCard().schedule, repetitions: 1 } });
    const next = appReducer(loaded, { type: 'reviewRecorded', card, log: makeLog({ id: 'new' }) });
    expect(next.reviews.at(-1)?.id).toBe('new');
    expect(next.cards.find((c) => c.id === 'a')?.schedule.repetitions).toBe(1);
  });

  it('records and clears errors', () => {
    const failed = appReducer(initialAppState, { type: 'loadFailed', error: 'nope' });
    expect(failed).toMatchObject({ status: 'failed', error: 'nope' });
    expect(appReducer(failed, { type: 'error', error: null }).error).toBeNull();
  });
});
