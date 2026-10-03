import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../components/App';
import { AnnouncerProvider } from '../components/Announcer';
import { StoreProvider } from '../state/store';
import { MemoryRepository } from '../storage/memoryRepository';
import type { Snapshot } from '../domain/types';
import { toDayNumber } from '../domain/days';

export const NOW = new Date(2026, 9, 3, 12, 0, 0);
export const TODAY_LOCAL = toDayNumber(NOW);
const fixedNow = () => NOW;

/** Render the whole app over an in-memory repository with a fixed (or injected) clock. */
export async function renderApp(
  options: { snapshot?: Snapshot; hash?: string; seedSamples?: boolean; now?: () => Date } = {},
) {
  const repository = new MemoryRepository(options.snapshot);
  let n = 0;
  const newId = () => `id-${++n}`;
  window.location.hash = options.hash ?? '#/';
  const user = userEvent.setup();
  const utils = render(
    <AnnouncerProvider>
      <StoreProvider
        repository={repository}
        now={options.now ?? fixedNow}
        newId={newId}
        seedSamples={options.seedSamples ?? false}
      >
        <App />
      </StoreProvider>
    </AnnouncerProvider>,
  );
  // Wait for the initial load from the repository.
  await screen.findByRole('heading', { level: 1 });
  return { ...utils, repository, user };
}
