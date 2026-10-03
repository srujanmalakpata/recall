/**
 * JSON backup format. A backup is the whole Snapshot plus a format tag and version,
 * so a future version of the app can migrate older files.
 *
 * Restoring validates every record before anything is written: a corrupt or
 * hand-edited file is rejected with the path of the first bad field rather than
 * half-imported.
 */
import type { Card, Deck, Grade, ReviewLog, Schedule, Snapshot } from '../domain/types';
import { MAX_INTERVAL, MIN_EASE } from '../domain/sm2';
import { validateDraft } from './drafts';

export const BACKUP_FORMAT = 'recall-flashcards-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile extends Snapshot {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
}

export function createBackup(snapshot: Snapshot, now: Date): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    decks: snapshot.decks,
    cards: snapshot.cards,
    reviews: snapshot.reviews,
  };
}

export type BackupParseResult =
  { readonly ok: true; readonly snapshot: Snapshot } | { readonly ok: false; readonly error: string };

class InvalidBackup extends Error {}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new InvalidBackup(`${path}: expected ${expected}.`);
}

function str(obj: Json, key: string, path: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : fail(`${path}.${key}`, 'a string');
}

function num(obj: Json, key: string, path: string, min = -Infinity, max = Infinity): number {
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return value;
  if (max !== Infinity) return fail(`${path}.${key}`, `a number from ${min} to ${max}`);
  return fail(`${path}.${key}`, min === -Infinity ? 'a number' : `a number ≥ ${min}`);
}

function int(obj: Json, key: string, path: string, min = -Infinity, max = Infinity): number {
  const value = num(obj, key, path, min, max);
  return Number.isInteger(value) ? value : fail(`${path}.${key}`, 'a whole number');
}

function array(obj: Json, key: string): unknown[] {
  const value = obj[key];
  return Array.isArray(value) ? value : fail(key, 'an array');
}

function readDeck(value: unknown, path: string): Deck {
  if (!isObject(value)) fail(path, 'an object');
  return {
    id: str(value, 'id', path),
    name: str(value, 'name', path),
    description: str(value, 'description', path),
    createdAt: num(value, 'createdAt', path),
  };
}

function readSchedule(value: unknown, path: string): Schedule {
  if (!isObject(value)) fail(path, 'an object');
  const last = value.lastReviewedDay;
  if (last !== null && !(typeof last === 'number' && Number.isInteger(last))) {
    fail(`${path}.lastReviewedDay`, 'a whole number or null');
  }
  return {
    repetitions: int(value, 'repetitions', path, 0),
    easeFactor: num(value, 'easeFactor', path, MIN_EASE),
    intervalDays: int(value, 'intervalDays', path, 0, MAX_INTERVAL),
    lapses: int(value, 'lapses', path, 0),
    dueDay: int(value, 'dueDay', path),
    lastReviewedDay: last,
  };
}

function readCard(value: unknown, path: string): Card {
  if (!isObject(value)) fail(path, 'an object');
  const card: Card = {
    id: str(value, 'id', path),
    deckId: str(value, 'deckId', path),
    front: str(value, 'front', path),
    back: str(value, 'back', path),
    createdAt: num(value, 'createdAt', path),
    updatedAt: num(value, 'updatedAt', path),
    schedule: readSchedule(value.schedule, `${path}.schedule`),
  };
  // The same rules as the card editor and the importers (non-empty, length limits).
  const problem = validateDraft(card);
  if (problem) throw new InvalidBackup(`${path}: ${problem}`);
  return card;
}

function readGrade(obj: Json, path: string): Grade {
  const g = obj.grade;
  return g === 1 || g === 2 || g === 3 || g === 4 ? g : fail(`${path}.grade`, '1, 2, 3 or 4');
}

function readReview(value: unknown, path: string): ReviewLog {
  if (!isObject(value)) fail(path, 'an object');
  if (typeof value.wasLearned !== 'boolean') fail(`${path}.wasLearned`, 'true or false');
  return {
    id: str(value, 'id', path),
    cardId: str(value, 'cardId', path),
    deckId: str(value, 'deckId', path),
    grade: readGrade(value, path),
    reviewedAt: num(value, 'reviewedAt', path),
    day: int(value, 'day', path),
    wasLearned: value.wasLearned,
    intervalBefore: int(value, 'intervalBefore', path, 0, MAX_INTERVAL),
    intervalAfter: int(value, 'intervalAfter', path, 0, MAX_INTERVAL),
    easeAfter: num(value, 'easeAfter', path, MIN_EASE),
  };
}

function uniqueIds(items: readonly { id: string }[], kind: string): Set<string> {
  const ids = new Set<string>();
  for (const { id } of items) {
    if (ids.has(id)) throw new InvalidBackup(`Duplicate ${kind} id "${id}".`);
    ids.add(id);
  }
  return ids;
}

export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  try {
    if (!isObject(raw) || raw.format !== BACKUP_FORMAT) {
      throw new InvalidBackup('This is not a recall backup file (missing "format" tag).');
    }
    if (raw.version !== BACKUP_VERSION) {
      throw new InvalidBackup(
        `Unsupported backup version ${String(raw.version)}; this app reads version ${BACKUP_VERSION}.`,
      );
    }
    const decks = array(raw, 'decks').map((d, i) => readDeck(d, `decks[${i}]`));
    const cards = array(raw, 'cards').map((c, i) => readCard(c, `cards[${i}]`));
    const reviews = array(raw, 'reviews').map((r, i) => readReview(r, `reviews[${i}]`));

    const deckIds = uniqueIds(decks, 'deck');
    uniqueIds(cards, 'card');
    uniqueIds(reviews, 'review');
    const cardDeck = new Map(cards.map((c) => [c.id, c.deckId]));
    cards.forEach((c, i) => {
      if (!deckIds.has(c.deckId)) throw new InvalidBackup(`cards[${i}] refers to a missing deck.`);
    });
    reviews.forEach((r, i) => {
      const deckId = cardDeck.get(r.cardId);
      if (deckId === undefined) throw new InvalidBackup(`reviews[${i}] refers to a missing card.`);
      // Deleting a deck removes reviews by deckId, so a mismatch would leave orphans behind.
      if (deckId !== r.deckId) {
        throw new InvalidBackup(`reviews[${i}].deckId does not match its card's deck.`);
      }
    });
    return { ok: true, snapshot: { decks, cards, reviews } };
  } catch (error) {
    if (error instanceof InvalidBackup) return { ok: false, error: error.message };
    throw error;
  }
}
