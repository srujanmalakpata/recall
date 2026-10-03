import type { ReactNode } from 'react';

export const PAGE_HEADING_ID = 'page-heading';

/**
 * The page's h1. It is focusable from script (tabIndex -1) so <App> can move focus
 * here after client-side navigation, the way a full page load would.
 */
export function PageHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h1 tabIndex={-1} id={PAGE_HEADING_ID}>
      {children}
    </h1>
  );
}
