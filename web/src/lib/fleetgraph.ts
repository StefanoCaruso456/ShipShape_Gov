import type {
  DocumentType,
  FleetGraphActiveViewContext,
  FleetGraphFeedbackEventRequest,
  FleetGraphFeedbackEventName,
  FleetGraphOnDemandRequest,
  FleetGraphOnDemandResumeRequest,
  FleetGraphOnDemandResponse,
  FleetGraphProactiveFinding,
} from '@ship/shared';
import { apiGet, apiPost } from '@/lib/api';
import type { DocumentResponse } from '@/lib/document-tabs';
import type { ActionItem } from '@/hooks/useDashboardActionItems';
import type { Project } from '@/hooks/useProjectsQuery';
import type { ActiveWeek } from '@/hooks/useWeeksQuery';

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

export function extractFleetGraphProjectIdFromDocument(
  document: Pick<DocumentResponse, 'document_type' | 'properties' | 'belongs_to'>
): string | null {
  const belongsToProjectId =
    document.belongs_to?.find((association) => association.type === 'project')?.id ?? null;

  if (belongsToProjectId) {
    return belongsToProjectId;
  }

  if (document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro') {
    const legacyProjectId = document.properties?.project_id;
    return typeof legacyProjectId === 'string' && legacyProjectId.length > 0
      ? legacyProjectId
      : null;
  }

  return null;
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

interface BuildFleetGraphDashboardActiveViewContextArgs {
  pathname: string;
  view: 'my-work' | 'overview';
  activeWeeks: ActiveWeek[];
  actionItems: ActionItem[];
  projects: Project[];
}

function getDashboardFocusWeek(
  actionItems: ActionItem[],
  activeWeeks: ActiveWeek[]
): { id: string; tab: string | null } | null {
  const overdueActionItem = [...actionItems]
    .filter((item) => item.urgency === 'overdue')
    .sort(
      (left, right) =>
        left.days_until_due - right.days_until_due ||
        left.sprint_number - right.sprint_number ||
        left.id.localeCompare(right.id)
    )[0];

  if (overdueActionItem) {
    return {
      id: overdueActionItem.sprint_id,
      tab: overdueActionItem.type === 'plan' ? 'plan' : 'retro',
    };
  }

  const activeWeek = [...activeWeeks].sort(
    (left, right) =>
      left.days_remaining - right.days_remaining ||
      left.sprint_number - right.sprint_number ||
      left.id.localeCompare(right.id)
  )[0];

  return activeWeek
    ? {
        id: activeWeek.id,
        tab: 'issues',
      }
    : null;
}

function getDashboardFocusProject(projects: Project[]): Project | null {
  return [...projects]
    .filter((project) => !project.archived_at)
    .sort(
      (left, right) =>
        (right.business_value_score ?? right.ice_score ?? -1) - (left.business_value_score ?? left.ice_score ?? -1) ||
        right.issue_count - left.issue_count ||
        left.title.localeCompare(right.title)
    )[0] ?? null;
}

export function buildFleetGraphDashboardActiveViewContext({
  pathname,
  view,
  activeWeeks,
  actionItems,
  projects,
}: BuildFleetGraphDashboardActiveViewContextArgs): FleetGraphActiveViewContext | null {
  const focusedWeek = getDashboardFocusWeek(actionItems, activeWeeks);
  if (focusedWeek) {
    return {
      entity: {
        id: focusedWeek.id,
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'dashboard',
      route: pathname,
      tab: focusedWeek.tab,
      projectId: null,
    };
  }

  const focusedProject = getDashboardFocusProject(projects);
  if (focusedProject) {
    return {
      entity: {
        id: focusedProject.id,
        type: 'project',
        sourceDocumentType: 'project',
      },
      surface: 'dashboard',
      route: pathname,
      tab: view === 'overview' ? 'issues' : null,
      projectId: focusedProject.id,
    };
  }

  return null;
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

export function buildFleetGraphProactiveFindingToastCopy(
  finding: FleetGraphProactiveFinding
): { message: string; actionLabel: string } {
  const title = finding.title ?? 'Current week';
  const prefix =
    finding.audienceRole === 'accountable' || finding.audienceRole === 'manager'
      ? 'FleetGraph escalated'
      : finding.audienceRole === 'team_member'
        ? 'FleetGraph shared'
        : finding.severity === 'action'
          ? 'FleetGraph flagged'
          : finding.severity === 'warning'
            ? 'FleetGraph noticed'
            : 'FleetGraph surfaced';
  const reason = finding.deliveryReason ? ` ${finding.deliveryReason}` : '';

  return {
    message: `${prefix} ${title}: ${finding.summary}${reason}`,
    actionLabel: 'Open',
  };
}

export function buildFleetGraphProactiveFindingFeedback(
  finding: FleetGraphProactiveFinding,
  eventName: Extract<FleetGraphFeedbackEventName, 'proactive_toast_shown' | 'proactive_toast_clicked'>
): FleetGraphFeedbackEventRequest {
  return {
    event_name: eventName,
    surface: {
      route: finding.route,
      activeViewSurface: finding.surface,
      entityType: 'week',
      pageContextKind: 'document',
      tab: finding.tab,
      projectId: finding.projectId,
    },
    route_action:
      eventName === 'proactive_toast_clicked'
        ? {
            label: 'Open',
            route: finding.route,
            featured: true,
            intent: 'inspect',
          }
        : null,
    finding_context: {
      finding_id: finding.id,
      delivery_source: finding.deliverySource,
      audience_role: finding.audienceRole,
      audience_scope: finding.audienceScope,
      delivery_reason: finding.deliveryReason,
      severity: finding.severity,
      signal_kinds: finding.signalKinds,
    },
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

export async function resumeFleetGraphOnDemand(
  request: FleetGraphOnDemandResumeRequest
): Promise<FleetGraphOnDemandResponse> {
  const response = await apiPost('/api/fleetgraph/on-demand/resume', request);
  if (!response.ok) {
    throw new Error('FleetGraph on-demand resume request failed');
  }

  return response.json();
}

export async function reportFleetGraphFeedback(
  request: FleetGraphFeedbackEventRequest
): Promise<void> {
  const response = await apiPost('/api/fleetgraph/feedback', request);
  if (!response.ok) {
    throw new Error('FleetGraph feedback request failed');
  }
}

export async function listFleetGraphProactiveFindings(limit = 1): Promise<FleetGraphProactiveFinding[]> {
  const response = await apiGet(`/api/fleetgraph/findings?limit=${limit}`);
  if (!response.ok) {
    throw new Error('FleetGraph proactive findings request failed');
  }

  const body = (await response.json()) as { findings?: FleetGraphProactiveFinding[] };
  return body.findings ?? [];
}
