import { useSyncExternalStore } from 'react';
import { type Route, href, parseRoute } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;

/** The current route, re-rendering on every hash change. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  return parseRoute(hash);
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}
