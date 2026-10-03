import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDayNumber } from '../domain/days';
import { msUntilNextDay, useToday } from './useToday';

afterEach(() => {
  vi.useRealTimers();
});

describe('msUntilNextDay', () => {
  it('counts to just after the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 9, 3, 23, 59, 0))).toBe(61_000);
    expect(msUntilNextDay(new Date(2026, 9, 3, 0, 0, 0))).toBe(86_401_000);
  });
});

describe('useToday', () => {
  it('moves to the new day on its own at midnight', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 3, 23, 50) });
    const { result } = renderHook(() => useToday(() => new Date()));
    const day = result.current[0];
    expect(day).toBe(toDayNumber(new Date(2026, 9, 3, 12)));

    act(() => {
      vi.advanceTimersByTime(9 * 60_000);
    }); // 23:59
    expect(result.current[0]).toBe(day);
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    }); // 00:01
    expect(result.current[0]).toBe(day + 1);
    act(() => {
      vi.advanceTimersByTime(24 * 3_600_000);
    }); // and again the next night
    expect(result.current[0]).toBe(day + 2);
  });

  it('re-reads the clock when the page becomes visible or focused, and on refresh()', () => {
    let clock = new Date(2026, 9, 3, 23, 50);
    const { result } = renderHook(() => useToday(() => clock));
    const day = result.current[0];

    clock = new Date(2026, 9, 4, 8, 0); // the device slept through midnight
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current[0]).toBe(day + 1);

    clock = new Date(2026, 9, 5, 8, 0);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current[0]).toBe(day + 2);

    clock = new Date(2026, 9, 6, 8, 0);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(day + 3);
  });
});
