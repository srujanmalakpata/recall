import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, TODAY_LOCAL } from '../test/renderApp';
import { makeCard, makeDeck, makeLog } from '../test/factories';
import { createBackup } from '../io/backup';
import { SAMPLE_DECKS } from '../sample/sampleDecks';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first run', () => {
  it('seeds the sample decks into an empty database', async () => {
    const { repository } = await renderApp({ seedSamples: true });
    for (const sample of SAMPLE_DECKS) {
      expect(screen.getByRole('link', { name: sample.name })).toBeInTheDocument();
    }
    const total = SAMPLE_DECKS.reduce((n, d) => n + d.cards.length, 0);
    expect((await repository.loadAll()).cards).toHaveLength(total);
    expect(screen.getByRole('link', { name: `Review all due cards (${total})` })).toBeInTheDocument();
  });

  it('offers the samples again when the user has no decks', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Add sample decks' }));
    expect(await screen.findByRole('link', { name: 'HTTP basics' })).toBeInTheDocument();
  });
});

describe('decks and cards', () => {
  it('creates a deck, validates and adds a card, edits and deletes it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, repository } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Create deck' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Deck name is empty.');

    await user.type(screen.getByLabelText('Deck name', { selector: '#new-deck-name' }), 'Operating systems');
    await user.click(screen.getByRole('button', { name: 'Create deck' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Operating systems' });
    await waitFor(() => expect(heading).toHaveFocus()); // focus moves to the new page

    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Question is empty.');

    await user.type(screen.getByLabelText('Question'), 'What is a process?');
    await user.type(screen.getByLabelText('Answer'), 'A running program.');
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(await screen.findByText('What is a process?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cards (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit card: What is a process?' }));
    const editor = screen.getByRole('button', { name: 'Save card' }).closest('form');
    if (!editor) throw new Error('editor form not found');
    const question = within(editor).getByLabelText('Question');
    await user.clear(question);
    await user.type(question, 'What is an OS process?');
    await user.click(within(editor).getByRole('button', { name: 'Save card' }));
    expect(await screen.findByText('What is an OS process?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete card: What is an OS process?' }));
    expect(await screen.findByText('This deck has no cards yet.')).toBeInTheDocument();
    expect((await repository.loadAll()).cards).toHaveLength(0);
  });

  it('deletes a deck after confirmation and returns home', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, repository } = await renderApp({
      snapshot: {
        decks: [makeDeck({ id: 'd1', name: 'Old' })],
        cards: [makeCard({ deckId: 'd1' })],
        reviews: [],
      },
      hash: '#/deck/d1',
    });
    await user.click(screen.getByRole('button', { name: 'Delete deck' }));
    expect(confirm).toHaveBeenCalledWith('Delete "Old" and its 1 cards? This cannot be undone.');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your decks' })).toBeInTheDocument();
    expect(await repository.loadAll()).toEqual({ decks: [], cards: [], reviews: [] });
  });
});

describe('import', () => {
  it('previews a Markdown import with line-numbered problems and imports only the valid cards', async () => {
    const { user, repository } = await renderApp();
    const textarea = screen.getByLabelText('Or paste the text');
    // fireEvent.change keeps the multi-line text intact (user.type would interpret "{" etc.).
    fireEvent.change(textarea, {
      target: {
        value:
          '# Sample Markdown deck\n\n### What is SM-2?\nA scheduler.\n\n### Empty one\n\n### Why IndexedDB?\nOffline storage.',
      },
    });
    expect(screen.getByTestId('import-summary')).toHaveTextContent('Found 2 valid cards, 1 problem.');
    expect(screen.getByRole('list', { name: 'Problems' })).toHaveTextContent(
      'Line 6: "Empty one": Answer is empty.',
    );

    await user.click(screen.getByRole('button', { name: 'Import 2 cards (skip 1)' }));
    expect(await screen.findByRole('link', { name: 'Sample Markdown deck' })).toBeInTheDocument();
    expect(screen.getByTestId('live-region')).toHaveTextContent('Imported 2 cards.');
    const saved = await repository.loadAll();
    expect(saved.decks.map((d) => d.name)).toEqual(['Sample Markdown deck']);
    expect(saved.cards.map((c) => c.front)).toEqual(['What is SM-2?', 'Why IndexedDB?']);
  });

  it('imports a CSV file chosen with the file picker and detects the format', async () => {
    const { user } = await renderApp();
    const file = new File(['front,back\n"Hello, world",Greeting\n'], 'greetings.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Choose a file'), file);
    expect(await screen.findByTestId('import-summary')).toHaveTextContent('Found 1 valid card.');
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked();
    expect(screen.getByLabelText('Deck name', { selector: 'input[placeholder]' })).toHaveAttribute(
      'placeholder',
      'greetings',
    );
    await user.click(screen.getByRole('button', { name: 'Import 1 card' }));
    expect(await screen.findByRole('link', { name: 'greetings' })).toBeInTheDocument();
  });

  it('shows a clear error for a CSV without a header', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('radio', { name: /CSV/ }));
    fireEvent.change(screen.getByLabelText('Or paste the text'), { target: { value: 'Q,A' } });
    expect(screen.getByRole('list', { name: 'Problems' })).toHaveTextContent('Missing header row');
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});

describe('stats', () => {
  it('shows reviews today, retention and due counts', async () => {
    const deck = makeDeck({ id: 'd1' });
    const cards = [
      makeCard({ id: 'c1', deckId: 'd1', schedule: { ...makeCard().schedule, dueDay: TODAY_LOCAL + 3 } }),
      makeCard({ id: 'c2', deckId: 'd1', schedule: { ...makeCard().schedule, dueDay: TODAY_LOCAL } }),
    ];
    const reviews = [
      makeLog({ id: 'r1', cardId: 'c1', day: TODAY_LOCAL, grade: 3, wasLearned: true }),
      makeLog({ id: 'r2', cardId: 'c1', day: TODAY_LOCAL, grade: 1, wasLearned: true }),
      makeLog({ id: 'r3', cardId: 'c1', day: TODAY_LOCAL - 1, grade: 4, wasLearned: true }),
      makeLog({ id: 'r4', cardId: 'c1', day: TODAY_LOCAL - 1, grade: 3, wasLearned: false }),
    ];
    await renderApp({ snapshot: { decks: [deck], cards, reviews }, hash: '#/stats' });
    expect(screen.getByTestId('reviews-today')).toHaveTextContent('2');
    expect(screen.getByTestId('retention')).toHaveTextContent('67%');
    expect(screen.getByTestId('due-now')).toHaveTextContent('1');
    expect(
      screen.getByRole('img', { name: /Reviews per day, last 30 days \(4 total\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Due forecast, next 14 days/ })).toBeInTheDocument();
  });
});

describe('backup and restore', () => {
  it('restores a valid backup after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, repository } = await renderApp({ hash: '#/data' });
    const backup = createBackup(
      { decks: [makeDeck({ id: 'd9', name: 'Restored' })], cards: [makeCard({ deckId: 'd9' })], reviews: [] },
      new Date(),
    );
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/Restore from a backup file/), file);
    expect(await screen.findByText('Restored 1 decks and 1 cards.', { selector: 'p' })).toBeInTheDocument();
    expect((await repository.loadAll()).decks.map((d) => d.name)).toEqual(['Restored']);
  });

  it('rejects an invalid backup without touching data', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user, repository } = await renderApp({
      hash: '#/data',
      snapshot: { decks: [makeDeck()], cards: [], reviews: [] },
    });
    await user.upload(
      screen.getByLabelText(/Restore from a backup file/),
      new File(['{"format":"something-else"}'], 'x.json', { type: 'application/json' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not restore "x.json": This is not a recall backup file',
    );
    expect(confirm).not.toHaveBeenCalled();
    expect((await repository.loadAll()).decks).toHaveLength(1);
  });
});

describe('navigation', () => {
  it('marks the current page in the main navigation and handles unknown routes', async () => {
    await renderApp({ hash: '#/stats' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');
    window.location.hash = '#/missing';
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('robustness', () => {
  it('treats a malformed URL escape as an unknown page instead of crashing', async () => {
    await renderApp({ hash: '#/deck/%' });
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

describe('storage durability', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('says when the browser cannot report persistence', async () => {
    await renderApp({ hash: '#/data' });
    expect(await screen.findByTestId('persistence-status')).toHaveTextContent(
      'This browser does not report whether it will keep this data.',
    );
  });

  it('asks the browser for persistent storage and shows the answer', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: () => Promise.resolve(false), persist },
    });
    const { user } = await renderApp({ hash: '#/data' });
    await waitFor(() =>
      expect(screen.getByTestId('persistence-status')).toHaveTextContent('Best-effort storage'),
    );
    await user.click(screen.getByRole('button', { name: 'Ask the browser to keep my data' }));
    expect(persist).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByTestId('persistence-status')).toHaveTextContent('Persistent storage is on'),
    );
  });
});
