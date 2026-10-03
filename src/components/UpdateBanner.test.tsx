/**
 * The "Reload to update" flow, driven through the real registration code: the Workbox
 * registration (virtual:pwa-register) is replaced by a fake that lets the test announce
 * a waiting service worker the way vite-plugin-pwa does (onNeedRefresh).
 */
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { registerServiceWorker } from '../registerServiceWorker';

const fake = vi.hoisted(() => ({
  updateSW: vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve()),
  onNeedRefresh: null as (() => void) | null,
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh?: () => void }) => {
    fake.onNeedRefresh = options.onNeedRefresh ?? null;
    return fake.updateSW;
  },
}));

beforeEach(() => {
  vi.stubEnv('PROD', true);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  registerServiceWorker();
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  fake.updateSW.mockClear();
});

const BANNER = 'A new version of recall is available.';

describe('UpdateBanner', () => {
  it('waits for the user instead of reloading by itself, and can be dismissed', async () => {
    const { user } = await renderApp();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    act(() => fake.onNeedRefresh?.());
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(fake.updateSW).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(fake.updateSW).not.toHaveBeenCalled();
  });

  it('activates the waiting worker and reloads only when asked', async () => {
    const { user } = await renderApp();
    act(() => fake.onNeedRefresh?.());
    await user.click(screen.getByRole('button', { name: 'Reload to update' }));
    expect(fake.updateSW).toHaveBeenCalledWith(true);
  });
});
