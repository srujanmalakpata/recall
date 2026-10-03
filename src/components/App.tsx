import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { type Route, href } from '../router/routes';
import { useHashRoute } from '../router/useHashRoute';
import { DataView } from './DataView';
import { DeckView } from './DeckView';
import { ErrorBoundary } from './ErrorBoundary';
import { HomeView } from './HomeView';
import { PAGE_HEADING_ID, PageHeading } from './PageHeading';
import { ReviewSession } from './ReviewSession';
import { StatsView } from './StatsView';
import { UpdateBanner } from './UpdateBanner';

const NAV: readonly { readonly label: string; readonly route: Route }[] = [
  { label: 'Decks', route: { name: 'home' } },
  { label: 'Review', route: { name: 'review', deckId: null } },
  { label: 'Stats', route: { name: 'stats' } },
  { label: 'Backup', route: { name: 'data' } },
];

function Page({ route }: { readonly route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeView />;
    case 'deck':
      return <DeckView deckId={route.deckId} />;
    case 'review':
      // key: navigating between decks starts a fresh session.
      return <ReviewSession key={route.deckId ?? 'all'} deckId={route.deckId} />;
    case 'stats':
      return <StatsView />;
    case 'data':
      return <DataView />;
    case 'notFound':
      return (
        <section>
          <PageHeading>Page not found</PageHeading>
          <p>
            <a href={href({ name: 'home' })}>Go to your decks</a>
          </p>
        </section>
      );
  }
}

export function App() {
  const { state, actions } = useStore();
  const route = useHashRoute();
  const currentHref = href(route);

  // After in-app navigation (not on first load), move focus to the new page's
  // heading, unless the page already placed focus itself (the review screen
  // focuses its "Show answer" button). Child effects run before this one.
  const previousHref = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== 'ready') return;
    if (previousHref.current !== null && previousHref.current !== currentHref) {
      const main = document.getElementById('main');
      const active = document.activeElement;
      const pageMovedFocus = active !== null && active !== main && main?.contains(active) === true;
      if (!pageMovedFocus) document.getElementById(PAGE_HEADING_ID)?.focus();
    }
    previousHref.current = currentHref;
  }, [currentHref, state.status]);

  const isCurrent = (r: Route) =>
    r.name === route.name && (r.name !== 'review' || route.name !== 'review' || route.deckId === null);

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href={href({ name: 'home' })}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" />
          recall
        </a>
        <nav aria-label="Main">
          <ul>
            {NAV.map((item) => (
              <li key={item.label}>
                <a href={href(item.route)} aria-current={isCurrent(item.route) ? 'page' : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <UpdateBanner />
        {state.error && state.status === 'ready' && (
          <div className="banner error" role="alert">
            <span>{state.error}</span>
            <button type="button" className="secondary" onClick={actions.dismissError}>
              Dismiss
            </button>
          </div>
        )}
        {state.status === 'loading' && <p aria-busy="true">Loading your decks…</p>}
        {state.status === 'failed' && (
          <div role="alert">
            <PageHeading>Storage unavailable</PageHeading>
            <p>{state.error}</p>
            <p>Private browsing modes can block IndexedDB. Try a normal window.</p>
          </div>
        )}
        {state.status === 'ready' && (
          // Keyed by route: navigating away from a crashed page clears the error.
          <ErrorBoundary key={currentHref}>
            <Page route={route} />
          </ErrorBoundary>
        )}
      </main>
      <footer className="app-footer">
        <p>Works offline. Your data stays in this browser.</p>
      </footer>
    </>
  );
}
