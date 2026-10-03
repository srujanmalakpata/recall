import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, createBackup, parseBackup } from './backup';
import { makeCard, makeDeck, makeLog } from '../test/factories';
import type { Snapshot } from '../domain/types';

const snapshot: Snapshot = {
  decks: [makeDeck()],
  cards: [makeCard()],
  reviews: [makeLog({ id: 'r1' })],
};

function backupText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...createBackup(snapshot, new Date('2026-10-03T12:00:00Z')), ...overrides });
}

describe('backup', () => {
  it('round-trips a snapshot', () => {
    const result = parseBackup(backupText());
    expect(result).toEqual({ ok: true, snapshot });
  });

  it('records format, version and export time', () => {
    const backup = createBackup(snapshot, new Date('2026-10-03T12:00:00Z'));
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-10-03T12:00:00.000Z',
    });
  });

  it.each([
    ['not json', 'This file is not valid JSON.'],
    ['{"hello":1}', 'This is not a recall backup file (missing "format" tag).'],
  ])('rejects %s', (text, error) => {
    expect(parseBackup(text)).toEqual({ ok: false, error });
  });

  it('rejects an unknown version', () => {
    expect(parseBackup(backupText({ version: 99 }))).toEqual({
      ok: false,
      error: 'Unsupported backup version 99; this app reads version 1.',
    });
  });

  it('names the first invalid field', () => {
    const cards = [{ ...makeCard(), schedule: { ...makeCard().schedule, easeFactor: 0.5 } }];
    expect(parseBackup(backupText({ cards }))).toEqual({
      ok: false,
      error: 'cards[0].schedule.easeFactor: expected a number ≥ 1.3.',
    });
  });

  it('rejects an invalid grade', () => {
    const result = parseBackup(backupText({ reviews: [{ ...makeLog(), grade: 7 }] }));
    expect(result).toEqual({ ok: false, error: 'reviews[0].grade: expected 1, 2, 3 or 4.' });
  });

  it('checks references between decks, cards and reviews', () => {
    expect(parseBackup(backupText({ decks: [] }))).toEqual({
      ok: false,
      error: 'cards[0] refers to a missing deck.',
    });
    expect(parseBackup(backupText({ cards: [] }))).toEqual({
      ok: false,
      error: 'reviews[0] refers to a missing card.',
    });
  });

  it('applies the card editor rules and the interval cap', () => {
    expect(parseBackup(backupText({ cards: [makeCard({ front: '   ' })] }))).toEqual({
      ok: false,
      error: 'cards[0]: Question is empty.',
    });
    expect(parseBackup(backupText({ cards: [makeCard({ back: 'x'.repeat(20_001) })] }))).toEqual({
      ok: false,
      error: 'cards[0]: Answer is 20001 characters; the limit is 20000.',
    });
    const far = { ...makeCard().schedule, intervalDays: 99_999 };
    expect(parseBackup(backupText({ cards: [makeCard({ schedule: far })] }))).toEqual({
      ok: false,
      error: 'cards[0].schedule.intervalDays: expected a number from 0 to 36500.',
    });
  });

  it("rejects a review whose deck differs from its card's deck", () => {
    const result = parseBackup(
      backupText({
        decks: [makeDeck(), makeDeck({ id: 'deck-2' })],
        reviews: [makeLog({ id: 'r1', deckId: 'deck-2' })],
      }),
    );
    expect(result).toEqual({ ok: false, error: "reviews[0].deckId does not match its card's deck." });
  });

  it('rejects duplicate ids', () => {
    const result = parseBackup(backupText({ decks: [makeDeck(), makeDeck()] }));
    expect(result).toEqual({ ok: false, error: 'Duplicate deck id "deck-1".' });
  });
});
