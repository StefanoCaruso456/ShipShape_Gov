import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { useCurrentView } from '@/contexts/CurrentViewContext';
import { buildFleetGraphActiveViewContext } from '@/lib/fleetgraph';

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
      if (currentView) {
        return currentView;
      }

      return buildFleetGraphActiveViewContext({
        currentDocumentId,
        currentDocumentType,
        currentDocumentProjectId,
        currentDocumentTab,
        pathname: location.pathname,
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
