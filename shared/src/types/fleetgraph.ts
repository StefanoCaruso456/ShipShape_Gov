import type { DocumentType } from './document.js';

export type FleetGraphViewSurface =
  | 'document'
  | 'dashboard'
  | 'my_week'
  | 'week'
  | 'project'
  | 'program'
  | 'issue'
  | 'person';

export type FleetGraphViewEntityType =
  | 'issue'
  | 'week'
  | 'project'
  | 'program'
  | 'person';

export interface FleetGraphActiveViewEntityRef {
  id: string;
  type: FleetGraphViewEntityType;
  sourceDocumentType: DocumentType;
}

export interface FleetGraphActiveViewContext {
  entity: FleetGraphActiveViewEntityRef;
  surface: FleetGraphViewSurface;
  route: string;
  tab: string | null;
  projectId: string | null;
}

export interface FleetGraphOnDemandRequest {
  active_view: FleetGraphActiveViewContext;
  question?: string | null;
}

export type FleetGraphSignalSeverity = 'info' | 'warning' | 'action';

export type FleetGraphDerivedSignalsSeverity = 'none' | FleetGraphSignalSeverity;

export type FleetGraphSignalKind =
  | 'changes_requested_plan'
  | 'changes_requested_review'
  | 'low_recent_activity'
  | 'missing_standup'
  | 'no_completed_work'
  | 'work_not_started'
  | 'missing_review';

export interface FleetGraphDerivedSignal {
  kind: FleetGraphSignalKind;
  severity: FleetGraphSignalSeverity;
  summary: string;
  evidence: string[];
  dedupeKey: string;
}

export interface FleetGraphDerivedMetrics {
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  incompleteIssues: number;
  cancelledIssues: number;
  standupCount: number;
  recentActivityCount: number;
  recentActiveDays: number;
  completionRate: number | null;
}

export interface FleetGraphDerivedSignals {
  severity: FleetGraphDerivedSignalsSeverity;
  reasons: string[];
  summary: string | null;
  shouldSurface: boolean;
  signals: FleetGraphDerivedSignal[];
  metrics: FleetGraphDerivedMetrics;
}

export interface FleetGraphOnDemandFinding {
  summary: string;
  severity: FleetGraphDerivedSignalsSeverity;
}

export interface FleetGraphOnDemandFetchedEntity {
  id: string;
  title: string;
  document_type: string;
}

export interface FleetGraphOnDemandFetchedSupporting {
  current: {
    id: string;
    title: string;
    document_type: string;
    ticket_number?: number | null;
    program_id?: string | null;
    program_name?: string | null;
    program_color?: string | null;
  } | null;
}

export interface FleetGraphOnDemandFetchedAccountability {
  program: {
    id: string;
    name: string;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
}

export interface FleetGraphOnDemandFetchedPayloads {
  entity: FleetGraphOnDemandFetchedEntity | null;
  supporting: FleetGraphOnDemandFetchedSupporting | null;
  activity: {
    days: Array<{
      date: string;
      count: number;
    }>;
  } | null;
  accountability: FleetGraphOnDemandFetchedAccountability | null;
  people: {
    owner: {
      id: string;
      name: string;
      email: string;
    } | null;
    accountableId: string | null;
  } | null;
}

export interface FleetGraphOnDemandExpandedScope {
  issueId: string | null;
  weekId: string | null;
  projectId: string | null;
  programId: string | null;
  personId: string | null;
}

export interface FleetGraphOnDemandResponse {
  status: string;
  stage: string | null;
  mode: string | null;
  triggerType: string | null;
  activeView: FleetGraphActiveViewContext | null;
  expandedScope: FleetGraphOnDemandExpandedScope;
  fetched: FleetGraphOnDemandFetchedPayloads;
  derivedSignals: FleetGraphDerivedSignals;
  finding: FleetGraphOnDemandFinding | null;
  error: {
    code?: string;
    message?: string;
    retryable?: boolean;
    source?: string | null;
  } | null;
  trace: {
    runName: string | null;
    tags: string[];
  };
}

export interface FleetGraphProactiveFinding {
  id: string;
  workspaceId: string;
  weekId: string;
  projectId: string | null;
  programId: string | null;
  title: string | null;
  summary: string;
  severity: 'info' | 'warning' | 'action';
  route: string;
  surface: FleetGraphViewSurface;
  tab: string | null;
  signalKinds: string[];
  lastDetectedAt: string;
  lastNotifiedAt: string;
}
