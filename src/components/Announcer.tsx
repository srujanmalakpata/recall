/**
 * One polite ARIA live region for the whole app. Screen readers read whatever text
 * is placed in it, so components call announce("Card 3 of 10") instead of each
 * owning a live region (multiple regions compete and get read out of order).
 */
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';

const AnnounceContext = createContext<(message: string) => void>(() => undefined);

export function AnnouncerProvider({ children }: { readonly children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [nonce, setNonce] = useState(0);
  const announce = useCallback((text: string) => {
    setMessage(text);
    // Re-keying the node makes repeated identical messages announce again.
    setNonce((n) => n + 1);
  }, []);
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-region"
      >
        <span key={nonce}>{message}</span>
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}
