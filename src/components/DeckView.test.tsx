import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSchedule } from '../domain/sm2';
import type { Snapshot } from '../domain/types';
import { parseCsvDeck } from '../io/csv';
import { parseMarkdownDeck } from '../io/markdown';
import { makeCard, makeDeck } from '../test/factories';
import { renderApp, TODAY_LOCAL } from '../test/renderApp';

const snapshot: Snapshot = {
  decks: [makeDeck({ id: 'd1', name: 'Networking' })],
  cards: [
    makeCard({
      id: 'c1',
      deckId: 'd1',
      front: 'What is TCP, "really"?',
      back: 'A reliable, ordered byte stream.\n\n### not a question',
      createdAt: 1,
      schedule: newSchedule(TODAY_LOCAL),
    }),
    makeCard({
      id: 'c2',
      deckId: 'd1',
      front: '=SUM(A1)',
      back: 'Formula-looking text',
      createdAt: 2,
      schedule: newSchedule(TODAY_LOCAL),
    }),
  ],
  reviews: [],
};

/** Blobs handed to URL.createObjectURL, i.e. the files the user downloads. */
let downloads: Blob[] = [];

beforeEach(() => {
  downloads = [];
  // jsdom has no object URLs; record the blob instead of creating one.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloads.push(blob);
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function onlyDownload(): Blob {
  expect(downloads).toHaveLength(1);
  const [blob] = downloads;
  if (!blob) throw new Error('nothing was downloaded');
  return blob;
}

const exported = snapshot.cards.map(({ front, back }) => ({ front, back }));

describe('DeckView', () => {
  it('renames a deck, and refuses an empty name with an inline error', async () => {
    const { user, repository } = await renderApp({ snapshot, hash: '#/deck/d1' });
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('New name');
    expect(input).toHaveValue('Networking');

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Deck name is empty.');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.type(input, 'Computer networks');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Computer networks' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New name')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-region')).toHaveTextContent('Deck renamed to Computer networks.');
    expect((await repository.loadAll()).decks[0]?.name).toBe('Computer networks');
  });

  it('keeps the rename form open with the error when saving fails', async () => {
    const { user, repository } = await renderApp({ snapshot, hash: '#/deck/d1' });
    vi.spyOn(repository, 'saveDeck').mockRejectedValue(new Error('Disk full'));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByLabelText('New name'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Disk full', { selector: '#rename-deck-error' })).toBeInTheDocument();
    expect(screen.getByLabelText('New name')).toHaveValue('Networking 2');
    expect(screen.getByText('Could not save your change: Disk full')).toBeInTheDocument();
  });

  it('exports CSV that imports back to the same cards', async () => {
    const { user } = await renderApp({ snapshot, hash: '#/deck/d1' });
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    const blob = onlyDownload();
    expect(blob.type).toBe('text/csv');
    const parsed = parseCsvDeck(await blob.text());
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual(exported);
  });

  it('exports Markdown that imports back to the same cards and deck title', async () => {
    const { user } = await renderApp({ snapshot, hash: '#/deck/d1' });
    await user.click(screen.getByRole('button', { name: 'Export Markdown' }));
    const blob = onlyDownload();
    expect(blob.type).toBe('text/markdown');
    const parsed = parseMarkdownDeck(await blob.text());
    expect(parsed.title).toBe('Networking');
    expect(parsed.cards).toEqual(exported);
  });

  it('imports cards into this deck', async () => {
    const { user, repository } = await renderApp({ snapshot, hash: '#/deck/d1' });
    fireEvent.change(screen.getByLabelText('Or paste the text'), {
      target: {
        value: '### What is UDP?\nConnectionless datagrams.\n\n### What is QUIC?\nUDP-based transport.',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Import 2 cards' }));
    expect(await screen.findByRole('heading', { name: 'Cards (4)' })).toBeInTheDocument();
    const saved = await repository.loadAll();
    expect(saved.decks).toHaveLength(1);
    expect(saved.cards.filter((c) => c.deckId === 'd1').map((c) => c.front)).toEqual([
      'What is TCP, "really"?',
      '=SUM(A1)',
      'What is UDP?',
      'What is QUIC?',
    ]);
  });

  it('reports a failed delete in the banner and stays on the deck', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, repository } = await renderApp({ snapshot, hash: '#/deck/d1' });
    vi.spyOn(repository, 'deleteDeck').mockRejectedValue(new Error('Quota exceeded'));
    await user.click(screen.getByRole('button', { name: 'Delete deck' }));
    await waitFor(() =>
      expect(screen.getByText('Could not save your change: Quota exceeded')).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Networking' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/deck/d1');
  });
});
