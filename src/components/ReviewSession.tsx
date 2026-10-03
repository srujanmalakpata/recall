import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type Card, GRADES, GRADE_LABELS, type Grade } from '../domain/types';
import { formatInterval, isReviewable, previewIntervals } from '../domain/sm2';
import { currentCardId, isFinished, selectDueCards, sessionReducer, startSession } from '../domain/session';
import { dayToShortLabel } from '../domain/days';
import { useStore } from '../state/store';
import { StaleReviewError } from '../state/errors';
import { href } from '../router/routes';
import { useAnnounce } from './Announcer';
import { PageHeading } from './PageHeading';

const KEY_TO_GRADE: Readonly<Record<string, Grade>> = { '1': 1, '2': 2, '3': 3, '4': 4 };

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Elements that already do something on Space/Enter (follow a link, press a button,
 * open a <details>). The review shortcut must leave those keys alone, or keyboard users
 * could not leave the review screen. The focused "Show answer" button still reveals:
 * the browser turns Space/Enter on it into a click.
 */
const INTERACTIVE = 'a[href], button, input, textarea, select, summary, [role="button"], [role="link"]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return isTypingTarget(target) || (target instanceof Element && target.closest(INTERACTIVE) !== null);
}

export function ReviewSession({ deckId }: { readonly deckId: string | null }) {
  const { state, actions, today } = useStore();
  const announce = useAnnounce();
  const deck = deckId === null ? null : state.decks.find((d) => d.id === deckId);
  const scope = useMemo(
    () => (deckId === null ? state.cards : state.cards.filter((c) => c.deckId === deckId)),
    [state.cards, deckId],
  );

  // The queue is fixed when the session starts; grading a card does not re-select.
  const [session, dispatch] = useReducer(sessionReducer, scope, (cards) =>
    startSession(selectDueCards(cards, today).map((c) => c.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The card whose grade is being saved; the sync effect below must not drop it mid-write. */
  const grading = useRef<string | null>(null);

  const cardsById = useMemo(() => new Map(scope.map((c) => [c.id, c])), [scope]);
  const currentId = currentCardId(session);
  const card: Card | undefined = currentId === undefined ? undefined : cardsById.get(currentId);
  const finished = isFinished(session);
  const intervals = useMemo(() => (card ? previewIntervals(card.schedule, today) : null), [card, today]);

  const revealButton = useRef<HTMLButtonElement>(null);
  const answerRegion = useRef<HTMLElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);

  // Focus follows the step: Show answer → the answer text → (next card) Show answer.
  useEffect(() => {
    if (finished) summaryHeading.current?.focus();
    else if (session.revealed) answerRegion.current?.focus();
    else revealButton.current?.focus();
  }, [finished, session.revealed, currentId, session.reviews]);

  const reveal = useCallback(() => {
    if (finished || session.revealed) return;
    dispatch({ type: 'reveal' });
    announce('Answer shown. Press 1 for Again, 2 Hard, 3 Good, or 4 Easy.');
  }, [finished, session.revealed, announce, dispatch]);

  const grade = useCallback(
    async (value: Grade) => {
      if (!card || !session.revealed || busy) return;
      setBusy(true);
      setError(null);
      grading.current = card.id;
      try {
        const updated = await actions.gradeCard(card.id, value);
        const remaining = session.queue.length - (value === 1 ? 0 : 1);
        dispatch({ type: 'grade', grade: value });
        const next =
          value === 1
            ? 'You will see it again this session.'
            : `Next review in ${formatInterval(updated.schedule.intervalDays)}.`;
        announce(
          remaining === 0
            ? `Graded ${GRADE_LABELS[value]}. Session complete.`
            : `Graded ${GRADE_LABELS[value]}. ${next} ${remaining} ${remaining === 1 ? 'card' : 'cards'} left.`,
        );
      } catch (e) {
        if (e instanceof StaleReviewError) {
          dispatch({ type: 'drop', cardId: card.id });
          announce(`Skipped: ${e.message}`);
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        grading.current = null;
        setBusy(false);
      }
    },
    [card, session.revealed, session.queue.length, busy, actions, announce, dispatch],
  );

  const active = !finished && session.total > 0;
  useEffect(() => {
    // Only listen while a card is on screen; the summary and "nothing due" screens use
    // plain links and must keep the browser's own keyboard behaviour.
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (!session.revealed && (event.key === ' ' || event.key === 'Enter')) {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        reveal();
        return;
      }
      const value = KEY_TO_GRADE[event.key];
      if (session.revealed && value !== undefined) {
        event.preventDefault();
        void grade(value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, session.revealed, reveal, grade]);

  // Another tab (or window of the installed app) may delete a queued card, or grade it.
  // A card it already passed today is no longer due; grading it here again would push it
  // further out and log a duplicate review, so it leaves this session.
  useEffect(() => {
    for (const id of new Set(session.queue)) {
      if (id === grading.current) continue;
      const stored = cardsById.get(id);
      if (!stored || !isReviewable(stored.schedule, today)) dispatch({ type: 'drop', cardId: id });
    }
  }, [session.queue, cardsById, today]);

  // Cards due now that are not in this session: new ones, or ones that fell due after
  // midnight while the app stayed open.
  const dueNow = useMemo(
    () => (session.total === 0 || finished ? selectDueCards(scope, today).map((c) => c.id) : []),
    [session.total, finished, scope, today],
  );
  // The "nothing due" screen starts a session by itself once something falls due.
  useEffect(() => {
    if (session.total === 0 && dueNow.length > 0) dispatch({ type: 'restart', queue: dueNow });
  }, [session.total, dueNow]);

  const title = deck ? `Review: ${deck.name}` : 'Review all decks';
  const backHref = deck ? href({ name: 'deck', deckId: deck.id }) : href({ name: 'home' });

  if (deckId !== null && !deck) {
    return (
      <section>
        <PageHeading>Deck not found</PageHeading>
        <p>
          <a href={href({ name: 'home' })}>Back to decks</a>
        </p>
      </section>
    );
  }

  if (session.total === 0) {
    const nextDue = scope.reduce<number | null>(
      (min, c) => (min === null || c.schedule.dueDay < min ? c.schedule.dueDay : min),
      null,
    );
    return (
      <section>
        <PageHeading>{title}</PageHeading>
        <p className="empty">
          Nothing is due right now.
          {nextDue !== null && ` The next card is due ${dayToShortLabel(nextDue)}.`}
        </p>
        <p>
          <a href={backHref}>Back</a>
        </p>
      </section>
    );
  }

  if (finished) {
    return (
      <section aria-labelledby="summary-heading">
        <PageHeading>{title}</PageHeading>
        <h2 id="summary-heading" ref={summaryHeading} tabIndex={-1}>
          Session complete
        </h2>
        <p>
          You reviewed {session.answered} {session.answered === 1 ? 'card' : 'cards'} ({session.reviews}{' '}
          answers, {session.failed} forgotten).
        </p>
        <p className="actions">
          {dueNow.length > 0 && (
            <button type="button" onClick={() => dispatch({ type: 'restart', queue: dueNow })}>
              Review {dueNow.length} more due {dueNow.length === 1 ? 'card' : 'cards'}
            </button>
          )}
          <a className="button" href={backHref}>
            Done
          </a>
          <a className="button secondary" href={href({ name: 'stats' })}>
            See statistics
          </a>
        </p>
      </section>
    );
  }

  const done = session.total - new Set(session.queue).size;

  return (
    <section className="review" aria-labelledby="page-heading">
      <PageHeading>{title}</PageHeading>
      <div className="review-progress">
        <label htmlFor="review-progress">
          {done} of {session.total} done
        </label>
        <progress id="review-progress" max={session.total} value={done} />
      </div>

      {card && (
        <article className="flashcard" aria-label="Flashcard">
          <h2 className="visually-hidden">Question</h2>
          <p className="card-front" data-testid="card-front">
            {card.front}
          </p>
          {session.revealed && (
            <section
              className="card-back"
              ref={answerRegion}
              tabIndex={-1}
              aria-label="Answer"
              data-testid="card-back"
            >
              <h2 className="visually-hidden">Answer</h2>
              <p>{card.back}</p>
            </section>
          )}
        </article>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!session.revealed ? (
        <div className="review-controls">
          <button type="button" ref={revealButton} onClick={reveal} aria-keyshortcuts="Space">
            Show answer <kbd>Space</kbd>
          </button>
        </div>
      ) : (
        <div className="review-controls grade-buttons" role="group" aria-label="How well did you recall it?">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className={`grade grade-${g}`}
              onClick={() => void grade(g)}
              disabled={busy}
              aria-keyshortcuts={String(g)}
            >
              <span className="grade-label">
                {GRADE_LABELS[g]} <kbd>{g}</kbd>
              </span>
              <span className="grade-interval">
                {g === 1 ? 'again today' : intervals && formatInterval(intervals[g])}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="hint">
        Keyboard: <kbd>Space</kbd> shows the answer, <kbd>1</kbd>–<kbd>4</kbd> grade it.
      </p>
    </section>
  );
}
