/**
 * Two StoreProviders over one repository simulate two tabs (or a tab plus the
 * installed app). Each keeps its own in-memory mirror, so these tests pin down that a
 * stale mirror can never overwrite newer data in storage.
 */
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newSchedule } from '../domain/sm2';
import type { Snapshot } from '../domain/types';
import { MemoryRepository } from '../storage/memoryRepository';
import { makeCard, makeDeck } from '../test/factories';
import { NOW, TODAY_LOCAL } from '../test/renderApp';
import { type ChangeFeed, localChangeHub } from './changeFeed';
import { StaleReviewError } from './errors';
import { StoreProvider, useStore } from './store';

type StoreValue = ReturnType<typeof useStore>;

const snapshot: Snapshot = {
  decks: [makeDeck({ id: 'd1' })],
  cards: [makeCard({ id: 'c1', deckId: 'd1', front: 'Q1', back: 'A1', schedule: newSchedule(TODAY_LOCAL) })],
  reviews: [],
};

function Probe({ onValue }: { readonly onValue: (value: StoreValue) => void }) {
  onValue(useStore());
  return null;
}

async function openTab(repository: MemoryRepository, changes: ChangeFeed | null, tag: string) {
  const tab: { current: StoreValue | null } = { current: null };
  let n = 0;
  render(
    <StoreProvider
      repository={repository}
      changes={changes}
      now={() => NOW}
      newId={() => `${tag}-${++n}`}
      seedSamples={false}
    >
      <Probe
        onValue={(value) => {
          tab.current = value;
        }}
      />
    </StoreProvider>,
  );
  await waitFor(() => expect(tab.current?.state.status).toBe('ready'));
  return {
    get value(): StoreValue {
      if (!tab.current) throw new Error('store not rendered');
      return tab.current;
    },
  };
}

describe('two tabs sharing one database', () => {
  it('an edit from a stale tab keeps the review recorded by the other tab', async () => {
    const repository = new MemoryRepository(snapshot);
    const tabA = await openTab(repository, null, 'a');
    const tabB = await openTab(repository, null, 'b'); // no change feed: B's mirror goes stale

    await act(() => tabA.value.actions.gradeCard('c1', 3));
    expect(tabB.value.state.cards[0]?.schedule.repetitions).toBe(0); // B has not heard about it

    await act(() => tabB.value.actions.updateCard('c1', { front: 'Q1 edited', back: 'A1' }));

    const stored = await repository.loadAll();
    expect(stored.reviews).toHaveLength(1);
    expect(stored.cards[0]).toMatchObject({
      front: 'Q1 edited',
      schedule: { repetitions: 1, dueDay: TODAY_LOCAL + 1 },
    });
    // B's mirror now shows the stored card, schedule included.
    expect(tabB.value.state.cards[0]?.schedule.repetitions).toBe(1);
  });

  it('grading in a stale tab starts from the stored schedule, not the stale one', async () => {
    const repository = new MemoryRepository(snapshot);
    const tabA = await openTab(repository, null, 'a');
    const tabB = await openTab(repository, null, 'b');

    await act(() => tabA.value.actions.gradeCard('c1', 1)); // Again: EF 2.5 → 1.96, relearning today
    expect(tabB.value.state.cards[0]?.schedule.easeFactor).toBe(2.5); // B's copy is stale
    await act(() => tabB.value.actions.gradeCard('c1', 3)); // Good, a same-day repeat of the failure

    const stored = await repository.loadAll();
    // From the stale copy, Good would have kept EF at 2.5; from the stored one it stays 1.96.
    expect(stored.cards[0]?.schedule).toMatchObject({ repetitions: 1, intervalDays: 1, easeFactor: 1.96 });
    expect(stored.reviews.map((r) => [r.grade, r.intervalBefore, r.intervalAfter])).toEqual([
      [1, 0, 1],
      [3, 1, 1],
    ]);
  });

  it('refuses to grade again a card another tab already passed today, without an error banner', async () => {
    const repository = new MemoryRepository(snapshot);
    const tabA = await openTab(repository, null, 'a');
    const tabB = await openTab(repository, null, 'b');

    await act(() => tabA.value.actions.gradeCard('c1', 3)); // passed: due tomorrow
    const before = await repository.loadAll();
    await expect(act(() => tabB.value.actions.gradeCard('c1', 3))).rejects.toBeInstanceOf(StaleReviewError);

    expect(await repository.loadAll()).toEqual(before); // no second log, schedule unchanged
    expect(before.cards[0]?.schedule).toMatchObject({ repetitions: 1, dueDay: TODAY_LOCAL + 1 });
    expect(tabB.value.state.error).toBeNull();
  });

  it('a change feed refreshes the other tab after every write', async () => {
    const repository = new MemoryRepository(snapshot);
    const hub = localChangeHub();
    const tabA = await openTab(repository, hub.createFeed(), 'a');
    const tabB = await openTab(repository, hub.createFeed(), 'b');

    await act(() => tabA.value.actions.gradeCard('c1', 4));
    await waitFor(() => expect(tabB.value.state.reviews).toHaveLength(1));
    expect(tabB.value.state.cards[0]?.schedule.repetitions).toBe(1);

    await act(() => tabB.value.actions.deleteCard('c1'));
    await waitFor(() => expect(tabA.value.state.cards).toHaveLength(0));
    await expect(tabA.value.actions.updateCard('c1', { front: 'x', back: 'y' })).rejects.toThrow(
      'That card no longer exists.',
    );
  });

  it('imports a new deck and its cards in one write', async () => {
    const repository = new MemoryRepository();
    const tab = await openTab(repository, null, 'a');
    await act(() =>
      tab.value.actions.createDeckWithCards('Imported', [
        { front: 'Q', back: 'A' },
        { front: 'Q2', back: 'A2' },
      ]),
    );
    const stored = await repository.loadAll();
    expect(stored.decks.map((d) => d.name)).toEqual(['Imported']);
    expect(stored.cards).toHaveLength(2);
    // An invalid card rejects the whole import: no empty deck is left behind.
    await expect(
      act(() => tab.value.actions.createDeckWithCards('Broken', [{ front: 'Q', back: '' }])),
    ).rejects.toThrow('Answer is empty.');
    expect((await repository.loadAll()).decks).toHaveLength(1);
  });
});
