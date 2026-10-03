/**
 * A tiny hash router. Hash URLs (#/deck/abc) need no server rewrites, so the same
 * build works from `vite preview`, GitHub Pages under /<repo>/, and offline from
 * the service-worker cache.
 */
export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'deck'; readonly deckId: string }
  | { readonly name: 'review'; readonly deckId: string | null }
  | { readonly name: 'stats' }
  | { readonly name: 'data' }
  | { readonly name: 'notFound'; readonly path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    // A malformed escape such as "#/deck/%" must not crash rendering.
    return { name: 'notFound', path };
  }
  const [first, second] = parts;
  if (parts.length === 0) return { name: 'home' };
  if (first === 'deck' && second && parts.length === 2) return { name: 'deck', deckId: second };
  if (first === 'review' && parts.length === 1) return { name: 'review', deckId: null };
  if (first === 'review' && second && parts.length === 2) return { name: 'review', deckId: second };
  if (first === 'stats' && parts.length === 1) return { name: 'stats' };
  if (first === 'data' && parts.length === 1) return { name: 'data' };
  return { name: 'notFound', path };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'deck':
      return `#/deck/${encodeURIComponent(route.deckId)}`;
    case 'review':
      return route.deckId === null ? '#/review' : `#/review/${encodeURIComponent(route.deckId)}`;
    case 'stats':
      return '#/stats';
    case 'data':
      return '#/data';
    case 'notFound':
      return `#${route.path}`;
  }
}
