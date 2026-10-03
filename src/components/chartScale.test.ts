import { describe, expect, it } from 'vitest';
import { niceMax } from './chartScale';

describe('niceMax', () => {
  it.each([
    [0, 4],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 20],
    [21, 40],
    [41, 60],
    [81, 100],
    [101, 200],
  ])('%i → %i', (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });

  it('always gives a whole-number midline', () => {
    for (let v = 0; v <= 5000; v += 1) {
      const max = niceMax(v);
      expect(max).toBeGreaterThanOrEqual(v);
      expect(Number.isInteger(max / 2)).toBe(true);
    }
  });
});
