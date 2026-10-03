import { Component, type ErrorInfo, type ReactNode } from 'react';
import { href } from '../router/routes';
import { PageHeading } from './PageHeading';

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Catches a rendering error in one page so the header, navigation and live region
 * stay usable, instead of React unmounting the whole app to a blank screen.
 * <App> keys it by route, so navigating elsewhere clears the error.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <section role="alert">
        <PageHeading>Something went wrong</PageHeading>
        <p>This page hit an unexpected error: {this.state.error.message}</p>
        <p>Your saved decks are not affected.</p>
        <p>
          <a href={href({ name: 'home' })}>Go to your decks</a>
        </p>
      </section>
    );
  }
}
