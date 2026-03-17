import type {
  DocumentType,
  FleetGraphActiveViewContext,
  FleetGraphOnDemandRequest,
} from '@ship/shared';
import { apiPost } from '@/lib/api';

interface BuildFleetGraphActiveViewContextArgs {
  currentDocumentId: string | null;
  currentDocumentType: DocumentType | null;
  currentDocumentProjectId: string | null;
  currentDocumentTab: string | null;
  pathname: string;
}

const DOCUMENT_TYPE_TO_FLEETGRAPH_ENTITY: Partial<
  Record<DocumentType, FleetGraphActiveViewContext['entity']['type']>
> = {
  issue: 'issue',
  sprint: 'week',
  project: 'project',
  program: 'program',
  person: 'person',
};

export interface FleetGraphOnDemandResponse {
  status: string;
  stage: string | null;
  mode: string | null;
  triggerType: string | null;
  activeView: FleetGraphActiveViewContext | null;
  expandedScope: Record<string, string | null>;
  fetched: Record<string, unknown>;
  error: Record<string, unknown> | null;
  trace: Record<string, unknown>;
}

export function buildFleetGraphActiveViewContext({
  currentDocumentId,
  currentDocumentType,
  currentDocumentProjectId,
  currentDocumentTab,
  pathname,
}: BuildFleetGraphActiveViewContextArgs): FleetGraphActiveViewContext | null {
  if (!currentDocumentId || !currentDocumentType) {
    return null;
  }

  const fleetGraphEntityType = DOCUMENT_TYPE_TO_FLEETGRAPH_ENTITY[currentDocumentType];
  if (!fleetGraphEntityType) {
    return null;
  }

  return {
    entity: {
      id: currentDocumentId,
      type: fleetGraphEntityType,
      sourceDocumentType: currentDocumentType,
    },
    surface: 'document',
    route: pathname,
    tab: currentDocumentTab,
    projectId: currentDocumentProjectId,
  };
}

export async function invokeFleetGraphOnDemand(
  request: FleetGraphOnDemandRequest
): Promise<FleetGraphOnDemandResponse> {
  const response = await apiPost('/api/fleetgraph/on-demand', request);
  if (!response.ok) {
    throw new Error('FleetGraph on-demand request failed');
  }
  return response.json();
}
