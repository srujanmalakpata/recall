import { describe, expect, it } from 'vitest';
import { currentCardId, isFinished, selectDueCards, sessionReducer, startSession } from './session';
import { TODAY, makeCard } from '../test/factories';

describe('selectDueCards', () => {
  it('returns only due cards, most overdue first, then oldest first, capped', () => {
    const s = makeCard().schedule;
    const cards = [
      makeCard({ id: 'future', schedule: { ...s, dueDay: TODAY + 1 } }),
      makeCard({ id: 'today-new', createdAt: 2 }),
      makeCard({ id: 'today-old', createdAt: 1 }),
      makeCard({ id: 'overdue', schedule: { ...s, dueDay: TODAY - 3 } }),
    ];
    expect(selectDueCards(cards, TODAY).map((c) => c.id)).toEqual(['overdue', 'today-old', 'today-new']);
    expect(selectDueCards(cards, TODAY, 1).map((c) => c.id)).toEqual(['overdue']);
  });
});

describe('sessionReducer', () => {
  it('reveals, then grades and advances', () => {
    let s = startSession(['a', 'b']);
    expect(currentCardId(s)).toBe('a');
    s = sessionReducer(s, { type: 'reveal' });
    expect(s.revealed).toBe(true);
    s = sessionReducer(s, { type: 'grade', grade: 3 });
    expect(currentCardId(s)).toBe('b');
    expect(s).toMatchObject({ revealed: false, answered: 1, reviews: 1, failed: 0 });
  });

  it('ignores a grade before the answer is revealed', () => {
    const s = startSession(['a']);
    expect(sessionReducer(s, { type: 'grade', grade: 4 })).toBe(s);
  });

  it('moves a failed card to the back of the queue and counts it once as answered', () => {
    let s = startSession(['a', 'b']);
    s = sessionReducer(sessionReducer(s, { type: 'reveal' }), { type: 'grade', grade: 1 });
    expect(s.queue).toEqual(['b', 'a']);
    s = sessionReducer(sessionReducer(s, { type: 'reveal' }), { type: 'grade', grade: 3 });
    s = sessionReducer(sessionReducer(s, { type: 'reveal' }), { type: 'grade', grade: 3 });
    expect(isFinished(s)).toBe(true);
    expect(s).toMatchObject({ answered: 2, reviews: 3, failed: 1, total: 2 });
  });

  it('does nothing once finished', () => {
    const s = startSession([]);
    expect(isFinished(s)).toBe(true);
    expect(sessionReducer(s, { type: 'reveal' })).toBe(s);
  });

  it('restarts with a new queue', () => {
    const s = sessionReducer(startSession(['a']), { type: 'restart', queue: ['x', 'y'] });
    expect(s).toMatchObject({ queue: ['x', 'y'], total: 2, answered: 0 });
  });

  it('drops a card deleted elsewhere from the queue and the total', () => {
    let s = sessionReducer(startSession(['a', 'b', 'c']), { type: 'reveal' });
    s = sessionReducer(s, { type: 'drop', cardId: 'a' });
    expect(s).toMatchObject({ queue: ['b', 'c'], total: 2, revealed: false });
    expect(sessionReducer(s, { type: 'drop', cardId: 'zzz' })).toBe(s);
  });
});

describe('sessionReducer drop after a failure', () => {
  it('removes a failed, re-queued card from answered and total, keeping answered <= total', () => {
    let s = startSession(['a', 'b']);
    s = sessionReducer(sessionReducer(s, { type: 'reveal' }), { type: 'grade', grade: 1 }); // a re-queued
    s = sessionReducer(sessionReducer(s, { type: 'reveal' }), { type: 'grade', grade: 3 }); // b passed
    expect(s).toMatchObject({ queue: ['a'], answered: 2, total: 2 });
    s = sessionReducer(s, { type: 'drop', cardId: 'a' }); // a deleted in another tab
    expect(s).toMatchObject({ queue: [], answered: 1, total: 1 });
    expect(s.seen.has('a')).toBe(false);
    expect(isFinished(s)).toBe(true);
  });
});
