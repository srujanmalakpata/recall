/**
 * One behavioural contract, run against both implementations, so the in-memory
 * repository used by component tests cannot drift from the real IndexedDB one.
 * IndexedDB runs on fake-indexeddb here (a spec-compliant in-memory IndexedDB).
 */
import { describe, expect, it } from 'vitest';
import { MISSING_CARD_MESSAGE, MISSING_DECK_MESSAGE, type Repository } from './repository';
import type { Card } from '../domain/types';
import { MemoryRepository } from './memoryRepository';
import { IndexedDbRepository } from './indexedDbRepository';
import { deferredRepository } from './deferredRepository';
import { makeCard, makeDeck, makeLog } from '../test/factories';

let dbCounter = 0;

const implementations: [string, () => Promise<Repository>][] = [
  ['MemoryRepository', () => Promise.resolve(new MemoryRepository())],
  ['IndexedDbRepository', () => IndexedDbRepository.open(`test-db-${++dbCounter}`)],
  [
    'deferredRepository(IndexedDb)',
    () => Promise.resolve(deferredRepository(IndexedDbRepository.open(`test-db-${++dbCounter}`))),
  ],
];

const sortById = <T extends { id: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));

describe.each(implementations)('%s', (_name, create) => {
  it('starts empty', async () => {
    const repo = await create();
    expect(await repo.loadAll()).toEqual({ decks: [], cards: [], reviews: [] });
  });

  it('saves and updates decks and cards', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck());
    await repo.saveCards([makeCard({ id: 'a' }), makeCard({ id: 'b' })]);
    await repo.saveCards([makeCard({ id: 'a', front: 'edited' })]);
    const all = await repo.loadAll();
    expect(all.decks).toEqual([makeDeck()]);
    expect(sortById(all.cards).map((c) => c.front)).toEqual(['edited', 'Q']);
  });

  it('records a review computed from the stored card, together with its log', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck());
    await repo.saveCards([makeCard({ front: 'stored' })]);
    const seen: Card[] = [];
    const result = await repo.recordReview('card-1', (stored) => {
      seen.push(stored);
      return {
        card: { ...stored, schedule: { ...stored.schedule, repetitions: 1, intervalDays: 1 } },
        log: makeLog({ id: 'r1' }),
      };
    });
    expect(seen.map((c) => c.front)).toEqual(['stored']);
    expect(result.card.schedule.repetitions).toBe(1);
    const all = await repo.loadAll();
    expect(all.cards[0]?.schedule.repetitions).toBe(1);
    expect(all.reviews.map((r) => r.id)).toEqual(['r1']);
  });

  it('updates a card from its stored version, keeping a newer schedule', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck());
    await repo.saveCards([makeCard()]);
    await repo.recordReview('card-1', (stored) => ({
      card: { ...stored, schedule: { ...stored.schedule, repetitions: 1 } },
      log: makeLog({ id: 'r1' }),
    }));
    const edited = await repo.updateCard('card-1', (stored) => ({ ...stored, front: 'edited' }));
    expect(edited).toMatchObject({ front: 'edited', schedule: { repetitions: 1 } });
    expect((await repo.loadAll()).cards).toEqual([edited]);
  });

  it('rejects updates and reviews of a missing card without writing anything', async () => {
    const repo = await create();
    await expect(repo.updateCard('nope', (c) => c)).rejects.toThrow(MISSING_CARD_MESSAGE);
    await expect(repo.recordReview('nope', (c) => ({ card: c, log: makeLog({ id: 'r1' }) }))).rejects.toThrow(
      MISSING_CARD_MESSAGE,
    );
    expect(await repo.loadAll()).toEqual({ decks: [], cards: [], reviews: [] });
  });

  it('writes nothing when the update callback throws', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck());
    await repo.saveCards([makeCard()]);
    await expect(
      repo.recordReview('card-1', () => {
        throw new Error('invalid');
      }),
    ).rejects.toThrow('invalid');
    const all = await repo.loadAll();
    expect(all.cards).toEqual([makeCard()]);
    expect(all.reviews).toEqual([]);
  });

  it('refuses to save cards into a deck that no longer exists, writing none of them', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck({ id: 'd1' }));
    await repo.saveDeck(makeDeck({ id: 'gone' }));
    await repo.deleteDeck('gone'); // e.g. deleted in another tab during an import
    await expect(
      repo.saveCards([makeCard({ id: 'a', deckId: 'd1' }), makeCard({ id: 'b', deckId: 'gone' })]),
    ).rejects.toThrow(MISSING_DECK_MESSAGE);
    expect((await repo.loadAll()).cards).toEqual([]);
  });

  it('adds decks with their cards and sets a flag in one call', async () => {
    const repo = await create();
    await repo.addDecksWithCards(
      [makeDeck({ id: 'd1' }), makeDeck({ id: 'd2' })],
      [makeCard({ id: 'a', deckId: 'd1' }), makeCard({ id: 'b', deckId: 'd2' })],
      'seeded',
    );
    await repo.addDecksWithCards([makeDeck({ id: 'd3' })], []);
    const all = await repo.loadAll();
    expect(sortById(all.decks).map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    expect(sortById(all.cards).map((c) => c.id)).toEqual(['a', 'b']);
    expect(await repo.getFlag('seeded')).toBe(true);
  });

  it('deleting a card removes its reviews but not other cards’ reviews', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck());
    await repo.saveCards([makeCard({ id: 'a' }), makeCard({ id: 'b' })]);
    await repo.recordReview('a', (card) => ({ card, log: makeLog({ id: 'ra', cardId: 'a' }) }));
    await repo.recordReview('b', (card) => ({ card, log: makeLog({ id: 'rb', cardId: 'b' }) }));
    await repo.deleteCard('a');
    const all = await repo.loadAll();
    expect(all.cards.map((c) => c.id)).toEqual(['b']);
    expect(all.reviews.map((r) => r.id)).toEqual(['rb']);
  });

  it('deleting a deck cascades to its cards and reviews only', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck({ id: 'd1' }));
    await repo.saveDeck(makeDeck({ id: 'd2' }));
    await repo.saveCards([makeCard({ id: 'a', deckId: 'd1' }), makeCard({ id: 'b', deckId: 'd2' })]);
    await repo.recordReview('a', (card) => ({ card, log: makeLog({ id: 'ra', cardId: 'a', deckId: 'd1' }) }));
    await repo.recordReview('b', (card) => ({ card, log: makeLog({ id: 'rb', cardId: 'b', deckId: 'd2' }) }));
    await repo.deleteDeck('d1');
    const all = await repo.loadAll();
    expect(all.decks.map((d) => d.id)).toEqual(['d2']);
    expect(all.cards.map((c) => c.id)).toEqual(['b']);
    expect(all.reviews.map((r) => r.id)).toEqual(['rb']);
  });

  it('replaceAll swaps in a snapshot', async () => {
    const repo = await create();
    await repo.saveDeck(makeDeck({ id: 'old' }));
    const snapshot = {
      decks: [makeDeck({ id: 'new' })],
      cards: [makeCard({ deckId: 'new' })],
      reviews: [makeLog()],
    };
    await repo.replaceAll(snapshot);
    const all = await repo.loadAll();
    expect(all.decks.map((d) => d.id)).toEqual(['new']);
    expect(all.cards).toHaveLength(1);
    expect(all.reviews).toHaveLength(1);
  });

  it('stores flags', async () => {
    const repo = await create();
    expect(await repo.getFlag('seeded')).toBe(false);
    await repo.setFlag('seeded', true);
    expect(await repo.getFlag('seeded')).toBe(true);
  });
});

describe('IndexedDbRepository persistence', () => {
  it('keeps data across connections to the same database', async () => {
    const first = await IndexedDbRepository.open('persist-db');
    await first.saveDeck(makeDeck());
    await first.saveCards([makeCard()]);
    first.close();
    const second = await IndexedDbRepository.open('persist-db');
    const all = await second.loadAll();
    expect(all.decks).toEqual([makeDeck()]);
    expect(all.cards).toEqual([makeCard()]);
    second.close();
  });
});

describe('deferredRepository', () => {
  it('rejects every call when opening failed', async () => {
    const repo = deferredRepository(Promise.reject(new Error('blocked')));
    await expect(repo.loadAll()).rejects.toThrow('blocked');
    await expect(repo.getFlag('x')).rejects.toThrow('blocked');
  });
});
