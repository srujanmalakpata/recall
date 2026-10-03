/**
 * The current local day as React state, so an app left open past midnight (an
 * installed PWA, a phone tab resumed the next morning) moves on to the new day by
 * itself instead of hiding the cards that just became due.
 *
 * The day is re-read from the injected clock:
 *   - by a timer set for just after the next local midnight,
 *   - when the page becomes visible again or the window regains focus (timers are
 *     throttled or frozen in background tabs and on sleeping devices),
 *   - on hash navigation (cheap, and the moment a stale day would be most visible),
 *   - whenever the caller asks (`refresh`), e.g. after recording a review.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DayNumber } from '../domain/types';
import { toDayNumber } from '../domain/days';

/** Small margin so the timer never fires a moment *before* midnight and re-arms for 0 ms. */
const AFTER_MIDNIGHT_MS = 1_000;

/** Milliseconds from `at` until just after the next local midnight (DST-safe: uses the calendar). */
export function msUntilNextDay(at: Date): number {
  const nextMidnight = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
  return nextMidnight.getTime() - at.getTime() + AFTER_MIDNIGHT_MS;
}

export function useToday(now: () => Date): readonly [DayNumber, () => void] {
  const [today, setToday] = useState(() => toDayNumber(now()));

  const refresh = useCallback(() => setToday(toDayNumber(now())), [now]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilNextDay(now()));
    };
    arm();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('hashchange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('hashchange', refresh);
    };
  }, [now, refresh]);

  return [today, refresh] as const;
}
