import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NOW, renderApp, TODAY_LOCAL } from '../test/renderApp';
import { MemoryRepository } from '../storage/memoryRepository';
import { type ChangeFeed, localChangeHub } from '../state/changeFeed';
import { StoreProvider } from '../state/store';
import { AnnouncerProvider } from './Announcer';
import { ReviewSession } from './ReviewSession';
import { makeCard, makeDeck } from '../test/factories';
import { newSchedule } from '../domain/sm2';
import type { Snapshot } from '../domain/types';

const snapshot: Snapshot = {
  decks: [makeDeck({ id: 'd1', name: 'Networking' })],
  cards: [
    makeCard({
      id: 'c1',
      deckId: 'd1',
      front: 'What is TCP?',
      back: 'Reliable stream',
      createdAt: 1,
      schedule: newSchedule(TODAY_LOCAL),
    }),
    makeCard({
      id: 'c2',
      deckId: 'd1',
      front: 'What is UDP?',
      back: 'Datagrams',
      createdAt: 2,
      schedule: newSchedule(TODAY_LOCAL),
    }),
  ],
  reviews: [],
};

const liveRegion = () => screen.getByTestId('live-region');

describe('ReviewSession (keyboard)', () => {
  it('reveals with Space and grades with number keys, announcing progress', async () => {
    const { user, repository } = await renderApp({ snapshot, hash: '#/review/d1' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review: Networking');
    expect(screen.getByTestId('card-front')).toHaveTextContent('What is TCP?');
    expect(screen.queryByTestId('card-back')).not.toBeInTheDocument();
    // Focus starts on the reveal button.
    expect(screen.getByRole('button', { name: /show answer/i })).toHaveFocus();

    // Number keys do nothing before the answer is shown.
    await user.keyboard('3');
    expect(screen.getByTestId('card-front')).toHaveTextContent('What is TCP?');

    await user.keyboard(' ');
    expect(screen.getByTestId('card-back')).toHaveTextContent('Reliable stream');
    expect(screen.getByTestId('card-back')).toHaveFocus();
    expect(liveRegion()).toHaveTextContent('Answer shown. Press 1 for Again, 2 Hard, 3 Good, or 4 Easy.');
    const grades = within(screen.getByRole('group', { name: /how well/i })).getAllByRole('button');
    expect(grades.map((b) => b.textContent)).toEqual([
      'Again 1again today',
      'Hard 21 day',
      'Good 31 day',
      'Easy 41 day',
    ]);

    await user.keyboard('3');
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is UDP?'));
    expect(liveRegion()).toHaveTextContent('Graded Good. Next review in 1 day. 1 card left.');
    expect(screen.getByRole('button', { name: /show answer/i })).toHaveFocus();
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();

    const saved = await repository.loadAll();
    expect(saved.reviews).toHaveLength(1);
    expect(saved.cards.find((c) => c.id === 'c1')?.schedule).toMatchObject({
      repetitions: 1,
      dueDay: TODAY_LOCAL + 1,
    });
  });

  it('repeats a card graded Again before finishing, then shows a summary', async () => {
    const { user, repository } = await renderApp({ snapshot, hash: '#/review/d1' });

    await user.keyboard(' ');
    await user.keyboard('1'); // forget TCP → goes to the back of the queue
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent('You will see it again this session. 2 cards left.'),
    );
    expect(screen.getByTestId('card-front')).toHaveTextContent('What is UDP?');

    await user.keyboard(' ');
    await user.keyboard('4');
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is TCP?'));

    await user.keyboard(' ');
    await user.keyboard('3');
    const summary = await screen.findByRole('heading', { name: 'Session complete' });
    expect(summary).toHaveFocus();
    expect(screen.getByText(/You reviewed 2 cards \(3 answers, 1 forgotten\)/)).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent('Graded Good. Session complete.');
    expect((await repository.loadAll()).reviews.map((r) => r.grade)).toEqual([1, 4, 3]);
  });

  it('can be driven with the on-screen buttons too', async () => {
    const { user } = await renderApp({ snapshot, hash: '#/review/d1' });
    await user.click(screen.getByRole('button', { name: /show answer/i }));
    await user.click(screen.getByRole('button', { name: /easy/i }));
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is UDP?'));
  });

  it('says when nothing is due', async () => {
    const later = snapshot.cards.map((c) => ({ ...c, schedule: { ...c.schedule, dueDay: TODAY_LOCAL + 3 } }));
    await renderApp({ snapshot: { ...snapshot, cards: later }, hash: '#/review/d1' });
    expect(screen.getByText(/Nothing is due right now/)).toBeInTheDocument();
  });

  it('leaves Enter on links alone during a review, so keyboard users can navigate away', async () => {
    const { user } = await renderApp({ snapshot, hash: '#/review/d1' });
    const statsLink = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Stats',
    });
    statsLink.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Statistics' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/stats');
  });

  it('still reveals with Enter or Space when the reveal button or the card has focus', async () => {
    const { user } = await renderApp({ snapshot, hash: '#/review/d1' });
    await user.keyboard('{Enter}'); // focus is on "Show answer": the browser clicks it
    expect(screen.getByTestId('card-back')).toBeInTheDocument();
    await user.keyboard('2');
    await waitFor(() => expect(screen.getByTestId('card-front')).toHaveTextContent('What is UDP?'));
    screen.getByTestId('card-front').click(); // focus moves off the button, to the page
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard(' ');
    expect(screen.getByTestId('card-back')).toHaveTextContent('Datagrams');
  });

  it('lets Enter follow the Done link after the session', async () => {
    const one = { ...snapshot, cards: snapshot.cards.slice(0, 1) };
    const { user } = await renderApp({ snapshot: one, hash: '#/review/d1' });
    await user.keyboard(' ');
    await user.keyboard('3');
    await screen.findByRole('heading', { name: 'Session complete' });
    await user.tab();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Networking' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/deck/d1');
  });
});

/** One review screen over a shared repository, as if open in its own tab. */
async function openReviewTab(repository: MemoryRepository, changes: ChangeFeed | null, tag: string) {
  let n = 0;
  const { container } = render(
    <AnnouncerProvider>
      <StoreProvider
        repository={repository}
        changes={changes}
        now={() => NOW}
        newId={() => `${tag}-${++n}`}
        seedSamples={false}
      >
        <ReviewSession deckId="d1" />
      </StoreProvider>
    </AnnouncerProvider>,
  );
  const tab = within(container);
  await tab.findByTestId('card-front');
  return tab;
}

describe('ReviewSession in two tabs', () => {
  it('drops a queued card that another tab has just reviewed', async () => {
    const user = userEvent.setup();
    const repository = new MemoryRepository(snapshot);
    const hub = localChangeHub();
    const tabA = await openReviewTab(repository, hub.createFeed(), 'a');
    const tabB = await openReviewTab(repository, hub.createFeed(), 'b');
    expect(tabB.getByTestId('card-front')).toHaveTextContent('What is TCP?');
    await user.click(tabB.getByRole('button', { name: /show answer/i }));

    await user.click(tabA.getByRole('button', { name: /show answer/i }));
    await user.click(tabA.getByRole('button', { name: /good/i }));

    // B hears about the write and moves on instead of offering TCP a second time.
    await waitFor(() => expect(tabB.getByTestId('card-front')).toHaveTextContent('What is UDP?'));
    expect(tabB.getByText('0 of 1 done')).toBeInTheDocument();
    expect((await repository.loadAll()).reviews).toHaveLength(1);
  });

  it('skips the card without a duplicate review when no change notification arrived', async () => {
    const user = userEvent.setup();
    const repository = new MemoryRepository(snapshot);
    const tabA = await openReviewTab(repository, null, 'a');
    const tabB = await openReviewTab(repository, null, 'b'); // never told about A's write

    await user.click(tabA.getByRole('button', { name: /show answer/i }));
    await user.click(tabA.getByRole('button', { name: /good/i }));
    await waitFor(() => expect(tabA.getByTestId('card-front')).toHaveTextContent('What is UDP?'));

    await user.click(tabB.getByRole('button', { name: /show answer/i }));
    await user.click(tabB.getByRole('button', { name: /good/i }));
    await waitFor(() => expect(tabB.getByTestId('card-front')).toHaveTextContent('What is UDP?'));
    expect(tabB.queryByRole('alert')).not.toBeInTheDocument();

    const saved = await repository.loadAll();
    expect(saved.reviews).toHaveLength(1);
    expect(saved.cards.find((c) => c.id === 'c1')?.schedule).toMatchObject({
      repetitions: 1,
      intervalDays: 1,
    });
  });
});
