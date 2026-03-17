import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FleetGraphActiveViewContext } from '@ship/shared';

interface CurrentViewContextValue {
  currentView: FleetGraphActiveViewContext | null;
  setCurrentView: (view: FleetGraphActiveViewContext | null) => void;
  clearCurrentView: () => void;
}

const CurrentViewContext = createContext<CurrentViewContextValue | undefined>(undefined);

export function CurrentViewProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentViewState] = useState<FleetGraphActiveViewContext | null>(null);

  const setCurrentView = useCallback((view: FleetGraphActiveViewContext | null) => {
    setCurrentViewState(view);
  }, []);

  const clearCurrentView = useCallback(() => {
    setCurrentViewState(null);
  }, []);

  const value = useMemo<CurrentViewContextValue>(() => ({
    currentView,
    setCurrentView,
    clearCurrentView,
  }), [clearCurrentView, currentView, setCurrentView]);

  return (
    <CurrentViewContext.Provider value={value}>
      {children}
    </CurrentViewContext.Provider>
  );
}

export function useCurrentView() {
  const context = useContext(CurrentViewContext);
  if (!context) {
    throw new Error('useCurrentView must be used within a CurrentViewProvider');
  }
  return context;
}
