/**
 * Cross-tab change notifications. Each tab (or window of the installed app) keeps its
 * own in-memory mirror of IndexedDB; after a write, it tells the others to reload theirs.
 * BroadcastChannel never delivers a message back to the tab that sent it.
 */
export interface ChangeFeed {
  /** Tell other tabs that the stored data changed. */
  notify(): void;
  /** Call `onChange` when another tab changed the stored data. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

export const CHANGE_CHANNEL = 'recall-changes';

/** A BroadcastChannel-backed feed, or null where BroadcastChannel is unavailable. */
export function broadcastChangeFeed(name = CHANGE_CHANNEL): ChangeFeed | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  return {
    notify: () => {
      channel.postMessage('changed');
    },
    subscribe: (onChange) => {
      const listener = () => {
        onChange();
      };
      channel.addEventListener('message', listener);
      return () => {
        channel.removeEventListener('message', listener);
      };
    },
  };
}

/**
 * In-process feeds for tests: `createFeed()` returns one feed per simulated tab, and
 * notify() on one reaches every other feed of the same hub, like BroadcastChannel.
 */
export function localChangeHub(): { createFeed: () => ChangeFeed } {
  const tabs = new Set<Set<() => void>>();
  return {
    createFeed: () => {
      const own = new Set<() => void>();
      tabs.add(own);
      return {
        notify: () => {
          for (const tab of tabs) {
            if (tab !== own) for (const listener of tab) listener();
          }
        },
        subscribe: (onChange) => {
          own.add(onChange);
          return () => own.delete(onChange);
        },
      };
    },
  };
}
