/**
 * StoreProvider wires the reducer to a Repository and exposes typed actions.
 * Dependencies (repository, clock, id factory) are injected so component tests can
 * use an in-memory repository and a fixed date.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { Card, DayNumber, Deck, Grade, Snapshot } from '../domain/types';
import { toDayNumber } from '../domain/days';
import { isReviewable, newSchedule, review } from '../domain/sm2';
import { type CardDraft, validateDraft } from '../io/drafts';
import type { Repository } from '../storage/repository';
import type { ChangeFeed } from './changeFeed';
import { SAMPLE_DECKS } from '../sample/sampleDecks';
import { type AppState, appReducer, initialAppState } from './appReducer';
import { StaleReviewError } from './errors';
import { useToday } from './useToday';

export interface StoreDeps {
  readonly repository: Repository;
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** Seed the sample decks into an empty database on first run (default true). */
  readonly seedSamples?: boolean;
  /** Cross-tab notifications (BroadcastChannel in the browser); none by default. */
  readonly changes?: ChangeFeed | null;
}

export interface StoreActions {
  readonly createDeck: (name: string, description?: string) => Promise<Deck>;
  /** Create a deck and its cards in one transaction (new-deck import). */
  readonly createDeckWithCards: (name: string, drafts: readonly CardDraft[]) => Promise<Deck>;
  readonly updateDeck: (deck: Deck) => Promise<void>;
  readonly deleteDeck: (deckId: string) => Promise<void>;
  readonly addCards: (deckId: string, drafts: readonly CardDraft[]) => Promise<Card[]>;
  readonly updateCard: (cardId: string, draft: CardDraft) => Promise<void>;
  readonly deleteCard: (cardId: string) => Promise<void>;
  readonly gradeCard: (cardId: string, grade: Grade) => Promise<Card>;
  readonly restore: (snapshot: Snapshot) => Promise<void>;
  readonly addSampleDecks: () => Promise<void>;
  readonly dismissError: () => void;
}

interface StoreValue {
  readonly state: AppState;
  readonly actions: StoreActions;
  readonly today: DayNumber;
  readonly now: () => Date;
}

const StoreContext = createContext<StoreValue | null>(null);

export const SAMPLES_FLAG = 'sampleDecksSeeded';

const systemNow = () => new Date();
const randomId = () => crypto.randomUUID();

/**
 * One in-flight load (and at most one sample seeding) per repository, even when
 * React StrictMode mounts the provider twice in development.
 */
const initialLoads = new WeakMap<Repository, Promise<Snapshot>>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function StoreProvider({
  repository,
  now = systemNow,
  newId = randomId,
  seedSamples = true,
  changes = null,
  children,
}: StoreDeps & { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [today, refreshToday] = useToday(now);

  // Run a repository write; surface failures in the error banner and re-throw so
  // the caller can keep the form open.
  const guard = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      try {
        const result = await work();
        changes?.notify();
        return result;
      } catch (error) {
        if (!(error instanceof StaleReviewError)) {
          dispatch({ type: 'error', error: `Could not save your change: ${errorMessage(error)}` });
        }
        throw error;
      }
    },
    [changes],
  );

  // Another tab wrote to the database: reload the mirror so this tab never edits stale data.
  useEffect(() => {
    if (!changes) return;
    let cancelled = false;
    const unsubscribe = changes.subscribe(() => {
      repository.loadAll().then(
        (snapshot) => {
          if (!cancelled) dispatch({ type: 'synced', snapshot });
        },
        (error: unknown) => {
          if (!cancelled) dispatch({ type: 'error', error: `Could not reload: ${errorMessage(error)}` });
        },
      );
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [changes, repository]);

  const buildSamples = useCallback((): { decks: Deck[]; cards: Card[] } => {
    const at = now();
    const today = toDayNumber(at);
    const decks: Deck[] = [];
    const cards: Card[] = [];
    for (const sample of SAMPLE_DECKS) {
      const deck: Deck = {
        id: newId(),
        name: sample.name,
        description: sample.description,
        createdAt: at.getTime(),
      };
      decks.push(deck);
      sample.cards.forEach((c, i) =>
        cards.push({
          id: newId(),
          deckId: deck.id,
          front: c.front,
          back: c.back,
          // Offset by index so "oldest first" keeps the authored order.
          createdAt: at.getTime() + i,
          updatedAt: at.getTime() + i,
          schedule: newSchedule(today),
        }),
      );
    }
    return { decks, cards };
  }, [now, newId]);

  useEffect(() => {
    let cancelled = false;
    let load = initialLoads.get(repository);
    if (!load) {
      load = (async () => {
        const snapshot = await repository.loadAll();
        if (!seedSamples || snapshot.decks.length > 0 || (await repository.getFlag(SAMPLES_FLAG))) {
          return snapshot;
        }
        const { decks, cards } = buildSamples();
        await repository.addDecksWithCards(decks, cards, SAMPLES_FLAG);
        changes?.notify();
        return { decks, cards, reviews: [] };
      })();
      initialLoads.set(repository, load);
      // Forget it once settled, so a later remount reads fresh data.
      const forget = () => initialLoads.delete(repository);
      load.then(forget, forget);
    }
    load
      .then((snapshot) => {
        if (!cancelled) dispatch({ type: 'loaded', snapshot });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: 'loadFailed', error: `Could not open local storage: ${errorMessage(error)}` });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository, seedSamples, buildSamples, changes]);

  const actions = useMemo<StoreActions>(() => {
    const requireValid = (draft: CardDraft): CardDraft => {
      const problem = validateDraft(draft);
      if (problem) throw new Error(problem);
      return { front: draft.front.trim(), back: draft.back.trim() };
    };

    const newDeck = (name: string, description: string): Deck => {
      const trimmed = name.trim();
      if (trimmed === '') throw new Error('Deck name is empty.');
      return { id: newId(), name: trimmed, description, createdAt: now().getTime() };
    };

    const newCards = (deckId: string, drafts: readonly CardDraft[]): Card[] => {
      const at = now();
      const today = toDayNumber(at);
      return drafts.map((draft, i): Card => {
        const { front, back } = requireValid(draft);
        return {
          id: newId(),
          deckId,
          front,
          back,
          // Offset by index so "oldest first" keeps the imported order.
          createdAt: at.getTime() + i,
          updatedAt: at.getTime() + i,
          schedule: newSchedule(today),
        };
      });
    };

    return {
      createDeck: (name, description = '') =>
        guard(async () => {
          const deck = newDeck(name, description);
          await repository.saveDeck(deck);
          dispatch({ type: 'deckSaved', deck });
          return deck;
        }),

      createDeckWithCards: (name, drafts) =>
        guard(async () => {
          const deck = newDeck(name, '');
          const cards = newCards(deck.id, drafts);
          // One transaction: a failed import leaves no empty deck behind to duplicate on retry.
          await repository.addDecksWithCards([deck], cards);
          dispatch({ type: 'deckSaved', deck });
          dispatch({ type: 'cardsSaved', cards });
          return deck;
        }),

      updateDeck: (deck) =>
        guard(async () => {
          if (deck.name.trim() === '') throw new Error('Deck name is empty.');
          await repository.saveDeck(deck);
          dispatch({ type: 'deckSaved', deck });
        }),

      deleteDeck: (deckId) =>
        guard(async () => {
          await repository.deleteDeck(deckId);
          dispatch({ type: 'deckDeleted', deckId });
        }),

      addCards: (deckId, drafts) =>
        guard(async () => {
          const cards = newCards(deckId, drafts);
          await repository.saveCards(cards);
          dispatch({ type: 'cardsSaved', cards });
          return cards;
        }),

      updateCard: (cardId, draft) =>
        guard(async () => {
          const text = requireValid(draft);
          const updatedAt = now().getTime();
          // Merged into the *stored* card, so the schedule is never rolled back by a stale copy.
          const card = await repository.updateCard(cardId, (stored) => ({ ...stored, ...text, updatedAt }));
          dispatch({ type: 'cardsSaved', cards: [card] });
        }),

      deleteCard: (cardId) =>
        guard(async () => {
          await repository.deleteCard(cardId);
          dispatch({ type: 'cardDeleted', cardId });
        }),

      gradeCard: (cardId, grade) =>
        guard(async () => {
          const at = now();
          const today = toDayNumber(at);
          const logId = newId();
          // The schedule is computed from the card as stored, inside the write transaction.
          // If another tab already passed it today, grading again would review a card that
          // is not due (and push it further out), so the write is refused.
          const { card, log } = await repository.recordReview(cardId, (stored) => {
            if (!isReviewable(stored.schedule, today)) throw new StaleReviewError();
            const schedule = review(stored.schedule, grade, today);
            return {
              card: { ...stored, schedule },
              log: {
                id: logId,
                cardId,
                deckId: stored.deckId,
                grade,
                reviewedAt: at.getTime(),
                day: today,
                wasLearned: stored.schedule.repetitions > 0,
                intervalBefore: stored.schedule.intervalDays,
                intervalAfter: schedule.intervalDays,
                easeAfter: schedule.easeFactor,
              },
            };
          });
          dispatch({ type: 'reviewRecorded', card, log });
          // Keep the screen's day in step with the day the review was recorded on.
          refreshToday();
          return card;
        }),

      restore: (snapshot) =>
        guard(async () => {
          await repository.replaceAll(snapshot);
          dispatch({ type: 'loaded', snapshot });
        }),

      addSampleDecks: () =>
        guard(async () => {
          const { decks, cards } = buildSamples();
          await repository.addDecksWithCards(decks, cards);
          for (const deck of decks) dispatch({ type: 'deckSaved', deck });
          dispatch({ type: 'cardsSaved', cards });
        }),

      dismissError: () => dispatch({ type: 'error', error: null }),
    };
  }, [repository, guard, now, newId, buildSamples, refreshToday]);

  const value = useMemo(() => ({ state, actions, today, now }), [state, actions, today, now]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>.');
  return value;
}
