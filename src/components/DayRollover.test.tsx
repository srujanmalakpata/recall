/**
 * An app left open past midnight (installed PWA, resumed phone tab) must show the cards
 * that became due on the new day without a reload.
 */
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toDayNumber } from '../domain/days';
import { newSchedule } from '../domain/sm2';
import type { Snapshot } from '../domain/types';
import { makeCard, makeDeck } from '../test/factories';
import { renderApp } from '../test/renderApp';

const EVENING = new Date(2026, 9, 3, 23, 50);
const NEXT_MORNING = new Date(2026, 9, 4, 8, 0);
const TOMORROW = toDayNumber(NEXT_MORNING);

const snapshot: Snapshot = {
  decks: [makeDeck({ id: 'd1', name: 'Networking' })],
  cards: [makeCard({ id: 'c1', deckId: 'd1', front: 'What is TCP?', schedule: newSchedule(TOMORROW) })],
  reviews: [],
};

function movableClock(start: Date) {
  let current = start;
  return {
    now: () => current,
    set: (date: Date) => {
      current = date;
    },
  };
}

describe('day rollover while the app stays open', () => {
  it('shows a card that fell due overnight when the page is focused again', async () => {
    const clock = movableClock(EVENING);
    await renderApp({ snapshot, now: clock.now });
    expect(screen.getByText('Nothing is due right now.')).toBeInTheDocument();

    clock.set(NEXT_MORNING);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByRole('link', { name: 'Review all due cards (1)' })).toBeInTheDocument();
  });

  it('shows the due card when navigating to the review screen the next morning', async () => {
    const clock = movableClock(EVENING);
    await renderApp({ snapshot, now: clock.now });
    clock.set(NEXT_MORNING);
    window.location.hash = '#/review'; // no focus or visibility event: navigation alone
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is TCP?'));
    expect(screen.queryByText(/Nothing is due right now/)).not.toBeInTheDocument();
  });

  it('starts a session by itself when the open review screen rolls over to the new day', async () => {
    const clock = movableClock(EVENING);
    await renderApp({ snapshot, hash: '#/review/d1', now: clock.now });
    expect(screen.getByText(/Nothing is due right now\. The next card is due Oct 4\./)).toBeInTheDocument();

    clock.set(NEXT_MORNING);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is TCP?'));
    expect(screen.getByRole('button', { name: /show answer/i })).toHaveFocus();
  });

  it('offers the cards that fell due at midnight once the evening session is over', async () => {
    const clock = movableClock(EVENING);
    const today = toDayNumber(EVENING);
    const cards = [
      makeCard({ id: 'c0', deckId: 'd1', front: 'What is UDP?', schedule: newSchedule(today) }),
      ...snapshot.cards,
    ];
    const { user } = await renderApp({
      snapshot: { ...snapshot, cards },
      hash: '#/review/d1',
      now: clock.now,
    });
    await user.keyboard(' ');
    await user.keyboard('3');
    await screen.findByRole('heading', { name: 'Session complete' });
    expect(screen.queryByRole('button', { name: /more due/ })).not.toBeInTheDocument();

    clock.set(NEXT_MORNING);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // The card just passed (interval 1 day) and the one first due today.
    await user.click(await screen.findByRole('button', { name: 'Review 2 more due cards' }));
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show answer/i })).toHaveFocus();
  });
});
