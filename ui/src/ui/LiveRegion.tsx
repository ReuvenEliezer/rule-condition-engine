// Announcement primitives (FR-044, research R9). `polite` for results arriving and saves
// succeeding; `assertive` for validation failures. One pair per view, driven by a small hook so
// callers announce with a function call rather than managing DOM.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Announce = (message: string, urgency?: 'polite' | 'assertive') => void;

const AnnounceContext = createContext<Announce | null>(null);

export function LiveRegionProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');

  const announce = useCallback<Announce>((message, urgency = 'polite') => {
    if (urgency === 'assertive') {
      setAssertive('');
      requestAnimationFrame(() => setAssertive(message));
    } else {
      setPolite('');
      requestAnimationFrame(() => setPolite(message));
    }
  }, []);

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div className="visually-hidden" aria-live="polite" role="status">
        {polite}
      </div>
      <div className="visually-hidden" aria-live="assertive" role="alert">
        {assertive}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce(): Announce {
  const ctx = useContext(AnnounceContext);
  if (!ctx) throw new Error('useAnnounce must be used within a LiveRegionProvider');
  return ctx;
}
