import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { useCurrentView } from '@/contexts/CurrentViewContext';
import { resolveFleetGraphActiveView } from '@/lib/fleetgraph';

export function useFleetGraphActiveView(): FleetGraphActiveViewContext | null {
  const location = useLocation();
  const { currentView } = useCurrentView();
  const {
    currentDocumentId,
    currentDocumentType,
    currentDocumentProjectId,
    currentDocumentTab,
  } = useCurrentDocument();

  return useMemo(
    () => {
      return resolveFleetGraphActiveView({
        currentView,
        currentDocumentId,
        currentDocumentType,
        currentDocumentProjectId,
        currentDocumentTab,
        currentRoute: location.pathname + location.search,
      });
    },
    [
      currentView,
      currentDocumentId,
      currentDocumentProjectId,
      currentDocumentTab,
      currentDocumentType,
      location.pathname,
    ]
  );
}
