import { describe, expect, it } from 'vitest';
import { type Route, href, parseRoute } from './routes';

describe('hash routes', () => {
  it.each<[string, Route]>([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/deck/abc', { name: 'deck', deckId: 'abc' }],
    ['#/review', { name: 'review', deckId: null }],
    ['#/review/abc', { name: 'review', deckId: 'abc' }],
    ['#/stats', { name: 'stats' }],
    ['#/data', { name: 'data' }],
    ['#/nope', { name: 'notFound', path: '/nope' }],
    ['#/deck/a/b', { name: 'notFound', path: '/deck/a/b' }],
    ['#/deck/%', { name: 'notFound', path: '/deck/%' }],
    ['#/review/%E0%A4%A', { name: 'notFound', path: '/review/%E0%A4%A' }],
  ])('parses %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips ids that need encoding', () => {
    const route: Route = { name: 'deck', deckId: 'a b/c' };
    expect(parseRoute(href(route))).toEqual(route);
  });
});
