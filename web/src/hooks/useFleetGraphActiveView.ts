import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { buildFleetGraphActiveViewContext } from '@/lib/fleetgraph';

export function useFleetGraphActiveView(): FleetGraphActiveViewContext | null {
  const location = useLocation();
  const {
    currentDocumentId,
    currentDocumentType,
    currentDocumentProjectId,
    currentDocumentTab,
  } = useCurrentDocument();

  return useMemo(
    () =>
      buildFleetGraphActiveViewContext({
        currentDocumentId,
        currentDocumentType,
        currentDocumentProjectId,
        currentDocumentTab,
        pathname: location.pathname,
      }),
    [
      currentDocumentId,
      currentDocumentProjectId,
      currentDocumentTab,
      currentDocumentType,
      location.pathname,
    ]
  );
}
