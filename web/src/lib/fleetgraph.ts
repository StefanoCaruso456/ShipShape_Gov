import type {
  DocumentType,
  FleetGraphActiveViewContext,
  FleetGraphOnDemandRequest,
  FleetGraphOnDemandResumeRequest,
  FleetGraphOnDemandResponse,
  FleetGraphProactiveFinding,
} from '@ship/shared';
import { apiGet, apiPost } from '@/lib/api';

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

  if (
    (currentDocumentType === 'weekly_plan' || currentDocumentType === 'weekly_retro') &&
    currentDocumentProjectId
  ) {
    return {
      entity: {
        id: currentDocumentProjectId,
        type: 'project',
        sourceDocumentType: currentDocumentType,
      },
      surface: 'document',
      route: pathname,
      tab: currentDocumentTab,
      projectId: currentDocumentProjectId,
    };
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

interface BuildFleetGraphMyWeekActiveViewContextArgs {
  personId: string | null;
  pathname: string;
  projectId?: string | null;
}

export function buildFleetGraphMyWeekActiveViewContext({
  personId,
  pathname,
  projectId = null,
}: BuildFleetGraphMyWeekActiveViewContextArgs): FleetGraphActiveViewContext | null {
  if (!personId) {
    return null;
  }

  return {
    entity: {
      id: personId,
      type: 'person',
      sourceDocumentType: 'person',
    },
    surface: 'my_week',
    route: pathname,
    tab: null,
    projectId,
  };
}

interface ResolveFleetGraphActiveViewArgs extends Omit<BuildFleetGraphActiveViewContextArgs, 'pathname'> {
  currentRoute: string;
  currentView: FleetGraphActiveViewContext | null;
}

function normalizeRoute(route: string): string {
  return route.trim();
}

export function resolveFleetGraphActiveView({
  currentDocumentId,
  currentDocumentProjectId,
  currentDocumentTab,
  currentDocumentType,
  currentRoute,
  currentView,
}: ResolveFleetGraphActiveViewArgs): FleetGraphActiveViewContext | null {
  if (currentView && normalizeRoute(currentView.route) === normalizeRoute(currentRoute)) {
    return currentView;
  }

  return buildFleetGraphActiveViewContext({
    currentDocumentId,
    currentDocumentProjectId,
    currentDocumentTab,
    currentDocumentType,
    pathname: currentRoute,
  });
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

export async function resumeFleetGraphOnDemand(
  request: FleetGraphOnDemandResumeRequest
): Promise<FleetGraphOnDemandResponse> {
  const response = await apiPost('/api/fleetgraph/on-demand/resume', request);
  if (!response.ok) {
    throw new Error('FleetGraph on-demand resume request failed');
  }

  return response.json();
}

export async function listFleetGraphProactiveFindings(limit = 1): Promise<FleetGraphProactiveFinding[]> {
  const response = await apiGet(`/api/fleetgraph/findings?limit=${limit}`);
  if (!response.ok) {
    throw new Error('FleetGraph proactive findings request failed');
  }

  const body = (await response.json()) as { findings?: FleetGraphProactiveFinding[] };
  return body.findings ?? [];
}
