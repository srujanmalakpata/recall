import { useSyncExternalStore } from 'react';
import { serviceWorkerUpdates } from '../registerServiceWorker';

/**
 * "A new version is available" banner. The new service worker waits until the user
 * chooses to reload, so an update never interrupts a review or discards form input.
 */
export function UpdateBanner() {
  const available = useSyncExternalStore(
    serviceWorkerUpdates.subscribe,
    serviceWorkerUpdates.isAvailable,
    serviceWorkerUpdates.isAvailable,
  );
  if (!available) return null;
  return (
    <div className="banner" role="status">
      <span>A new version of recall is available.</span>
      <span className="actions">
        <button type="button" onClick={serviceWorkerUpdates.apply}>
          Reload to update
        </button>
        <button type="button" className="secondary" onClick={serviceWorkerUpdates.dismiss}>
          Later
        </button>
      </span>
    </div>
  );
}
