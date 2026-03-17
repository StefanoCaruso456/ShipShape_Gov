import type {
  ApprovalTracking,
  BelongsTo,
  FleetGraphActiveViewContext,
  FleetGraphViewEntityType,
} from '@ship/shared';

export type FleetGraphRunMode = 'proactive' | 'on_demand';

export type FleetGraphTriggerType =
  | 'event'
  | 'sweep'
  | 'user_invoke'
  | 'resume';

export type FleetGraphStatus =
  | 'starting'
  | 'running'
  | 'waiting_on_human'
  | 'completed'
  | 'failed';

export type FleetGraphActorKind = 'user' | 'service';

export type FleetGraphEntityType = FleetGraphViewEntityType;

export interface FleetGraphActor {
  id: string | null;
  kind: FleetGraphActorKind;
  role: string | null;
}

export interface FleetGraphEntityRef {
  type: FleetGraphEntityType;
  id: string;
}

export interface FleetGraphSprintOwner {
  id: string;
  name: string;
  email: string;
}

export interface FleetGraphSprintEntitySnapshot {
  id: string;
  document_type: 'sprint';
  title: string;
  status: 'planning' | 'active' | 'completed' | null;
  plan: string | null;
  owner_id: string | null;
  owner: FleetGraphSprintOwner | null;
  accountable_id: string | null;
  plan_approval?: ApprovalTracking | null;
  review_approval?: ApprovalTracking | null;
  review_rating?:
    | {
        value: number;
        rated_by: string;
        rated_at: string;
      }
    | null;
  belongs_to?: BelongsTo[];
  properties: Record<string, unknown>;
}

export interface FleetGraphDocumentContextSnapshot {
  current: {
    id: string;
    title: string;
    document_type: string;
    ticket_number?: number;
  };
  breadcrumbs: Array<{
    id: string;
    title: string;
    type: string;
    ticket_number?: number;
  }>;
  belongs_to: Array<{
    id: string;
    title: string;
    type: string;
    color?: string;
  }>;
}

export interface FleetGraphActivitySnapshot {
  days: Array<{
    date: string;
    count: number;
  }>;
}

export interface FleetGraphSprintReviewContextSnapshot {
  context_type: 'review';
  sprint: {
    id: string;
    title: string;
    number: string;
    status: string | null;
    plan: string | null;
  };
  program: {
    id: string;
    name: string;
    description: string | null;
    goals: string | null;
  } | null;
  project: {
    id: string;
    name: string;
    plan: string | null;
    ice_scores: {
      impact: string | null;
      confidence: string | null;
      ease: string | null;
    };
    monetary_impact_expected: string | null;
  } | null;
  standups: Array<{
    id: string;
    title: string;
    content: unknown;
    author: string | null;
    created_at: string;
  }>;
  issues: {
    stats: {
      total: number;
      completed: number;
      in_progress: number;
      planned_at_start: number;
      added_mid_sprint: number;
      cancelled: number;
    };
    completed_items: Array<Record<string, unknown>>;
    incomplete_items: Array<Record<string, unknown>>;
  };
  existing_review: {
    id: string;
    content: unknown;
    plan_validated: string | null;
    owner_id: string | null;
  } | null;
  clarifying_questions_context: string[];
}

export interface FleetGraphPeopleSnapshot {
  owner: FleetGraphSprintOwner | null;
  accountableId: string | null;
}

export interface FleetGraphScope {
  issueId: string | null;
  weekId: string | null;
  projectId: string | null;
  programId: string | null;
  personId: string | null;
}

export interface FleetGraphFetchedPayloads {
  entity: FleetGraphSprintEntitySnapshot | null;
  activity: FleetGraphActivitySnapshot | null;
  accountability: FleetGraphSprintReviewContextSnapshot | null;
  people: FleetGraphPeopleSnapshot | null;
  supporting: FleetGraphDocumentContextSnapshot | null;
}

export type FleetGraphSignalSeverity = 'info' | 'warning' | 'action';

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
  severity: 'none' | 'info' | 'warning' | 'action';
  reasons: string[];
  summary: string | null;
  shouldSurface: boolean;
  signals: FleetGraphDerivedSignal[];
  metrics: FleetGraphDerivedMetrics;
}

export interface FleetGraphFinding {
  summary: string;
  severity: FleetGraphDerivedSignals['severity'];
}

export interface FleetGraphProposedAction {
  type: string;
  targetId: string | null;
  summary: string;
}

export interface FleetGraphPendingApproval {
  actionType: string;
  reason: string;
}

export interface FleetGraphErrorState {
  code: string;
  message: string;
  retryable: boolean;
  source: string | null;
}

export interface FleetGraphTraceMetadata {
  runName: string | null;
  tags: string[];
}

export interface FleetGraphPromptInput {
  question: string | null;
}

export interface FleetGraphHandoff {
  fromNode: string;
  toNode: string;
  reason: string;
}

export interface FleetGraphInterventionEvent {
  kind: 'reroute' | 'pause' | 'resume' | 'retry' | 'fail_safe_exit';
  reason: string;
  atStage: string | null;
}

export interface FleetGraphRunInput {
  runId?: string;
  mode: FleetGraphRunMode;
  triggerType: FleetGraphTriggerType;
  workspaceId: string | null;
  actor?: FleetGraphActor | null;
  activeView?: FleetGraphActiveViewContext | null;
  contextEntity?: FleetGraphEntityRef | null;
  prompt?: FleetGraphPromptInput | null;
  trace?: FleetGraphTraceMetadata;
}
