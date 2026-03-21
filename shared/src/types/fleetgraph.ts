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

export type FleetGraphPageContextKind =
  | 'dashboard'
  | 'my_week'
  | 'programs'
  | 'projects'
  | 'issues'
  | 'issue_surface'
  | 'documents'
  | 'document'
  | 'team_directory'
  | 'person'
  | 'settings'
  | 'generic';

export interface FleetGraphPageContextMetric {
  label: string;
  value: string;
}

export interface FleetGraphPageContextItem {
  label: string;
  detail?: string | null;
  route?: string | null;
}

export type FleetGraphPageContextActionIntent =
  | 'inspect'
  | 'prioritize'
  | 'follow_up'
  | 'write'
  | 'complete';

export interface FleetGraphPageContextAction {
  label: string;
  route: string;
  intent?: FleetGraphPageContextActionIntent;
  reason?: string | null;
  owner?: string | null;
}

export interface FleetGraphPageContext {
  kind: FleetGraphPageContextKind;
  route: string;
  title: string;
  summary: string;
  emptyState: boolean;
  metrics: FleetGraphPageContextMetric[];
  items: FleetGraphPageContextItem[];
  actions?: FleetGraphPageContextAction[];
}

export interface FleetGraphOnDemandRequest {
  active_view: FleetGraphActiveViewContext | null;
  page_context?: FleetGraphPageContext | null;
  question?: string | null;
}

export interface FleetGraphResumeDecision {
  outcome: 'approve' | 'dismiss' | 'snooze';
  note?: string | null;
  snooze_minutes?: number | null;
}

export interface FleetGraphOnDemandResumeRequest {
  thread_id: string;
  decision: FleetGraphResumeDecision;
}

export type FleetGraphScrumSurface =
  | 'my_week'
  | 'sprint'
  | 'project_issues'
  | 'program_issues'
  | 'project'
  | 'program'
  | 'document';

export type FleetGraphQuestionTheme =
  | 'risk'
  | 'blockers'
  | 'capacity'
  | 'scope'
  | 'status'
  | 'impact'
  | 'follow_up'
  | 'generic';

export type FleetGraphEvidenceToolName =
  | 'get_surface_context'
  | 'get_visible_issue_worklist'
  | 'get_sprint_snapshot'
  | 'get_scrum_artifact_status'
  | 'get_scope_change_signals'
  | 'get_recent_delivery_history'
  | 'get_dependency_signals'
  | 'get_team_ownership_and_capacity'
  | 'get_business_value_context';

export interface FleetGraphScrumToolContext {
  schemaVersion: 'v1';
  runId: string;
  threadId: string;
  turnId: string;
  workspaceId: string | null;
  actorId: string | null;
  actorRole: string | null;
  surface: FleetGraphScrumSurface;
  route: string;
  tab: string | null;
  question: string | null;
  questionTheme: FleetGraphQuestionTheme;
  issueId: string | null;
  weekId: string | null;
  sprintId: string | null;
  projectId: string | null;
  programId: string | null;
  visibleIssueIds: string[];
  nowIso: string;
}

export interface FleetGraphToolCallTrace {
  callId: string;
  toolName: FleetGraphEvidenceToolName;
  toolVersion: 'v1';
  context: FleetGraphScrumToolContext;
  inputSummary: string | null;
  resultSummary: string | null;
  success: boolean;
  cacheHit: boolean;
  resultCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
}

export interface FleetGraphApprovalTrace {
  approvalId: string;
  actionType: 'draft_follow_up_comment' | 'draft_escalation_comment';
  riskLevel: 'medium' | 'high' | null;
  fingerprint: string | null;
  targetRoute: string | null;
  requiresHumanApproval: boolean;
  decisionOutcome: 'approve' | 'dismiss' | 'snooze';
  note: string | null;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
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
  | 'missing_review'
  | 'scope_growth'
  | 'blocked_work'
  | 'workload_concentration'
  | 'throughput_gap';

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
  blockedIssues?: number;
  standupCount: number;
  recentActivityCount: number;
  recentActiveDays: number;
  completionRate: number | null;
  scopeChangePercent?: number | null;
  maxAssigneeLoadShare?: number | null;
  recentAverageCompletedIssues?: number | null;
  recentAverageStartedIssues?: number | null;
  recentAverageTotalIssues?: number | null;
  throughputSampleSize?: number;
  throughputLoadRatio?: number | null;
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

export type FleetGraphAnswerMode = 'execution' | 'context' | 'launcher';

export interface FleetGraphOnDemandReasoning {
  answerMode: FleetGraphAnswerMode;
  summary: string;
  evidence: string[];
  whyNow: string | null;
  recommendedNextStep: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export type FleetGraphReasoningSource = 'deterministic' | 'model';

export type FleetGraphOnDemandActionType =
  | 'draft_follow_up_comment'
  | 'draft_escalation_comment';

export interface FleetGraphOnDemandProposedAction {
  type: FleetGraphOnDemandActionType;
  targetId: string | null;
  summary: string;
  rationale: string;
  draftComment: string;
  targetRoute: string | null;
  fingerprint: string;
}

export interface FleetGraphOnDemandPendingApproval {
  actionType: FleetGraphOnDemandActionType;
  reason: string;
  proposal: FleetGraphOnDemandProposedAction;
}

export interface FleetGraphOnDemandActionResult {
  outcome: 'approved' | 'dismissed' | 'snoozed' | 'skipped';
  summary: string;
  note: string | null;
  snoozedUntil: string | null;
  executedCommentId: string | null;
}

export type FleetGraphSuppressionReason =
  | 'approved_before'
  | 'dismissed_before'
  | 'snoozed';

export type FleetGraphTerminalOutcome =
  | 'quiet'
  | 'finding_only'
  | 'waiting_on_human'
  | 'action_executed'
  | 'suppressed'
  | 'failed_retryable'
  | 'failed_terminal';

export interface FleetGraphAttempts {
  reasoning: number;
  resume: number;
  actionExecution: number;
}

export interface FleetGraphGuardState {
  maxTransitions: number;
  transitionCount: number;
  maxRetries: number;
  maxResumeCount: number;
  maxReasoningAttempts: number;
  maxToolCalls: number;
  toolCallCount: number;
  circuitBreakerOpen: boolean;
  lastTripReason: string | null;
}

export interface FleetGraphTimingState {
  startedAt: string | null;
  lastNodeAt: string | null;
  deadlineAt: string | null;
}

export interface FleetGraphNodeTraceEntry {
  node: string;
  phase: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  status: 'ok' | 'interrupted' | 'guardrail_stop' | 'error';
  goto: string | null;
  errorCode: string | null;
}

export interface FleetGraphTelemetryState {
  langsmithRunId: string | null;
  langsmithRunUrl: string | null;
  langsmithShareUrl: string | null;
  braintrustSpanId: string | null;
  totalLatencyMs: number | null;
  toolCallCount: number;
  toolFailureCount: number;
  totalToolLatencyMs: number;
  approvalCount: number;
  lastToolName: FleetGraphEvidenceToolName | null;
  loopDetected: boolean;
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

export interface FleetGraphOnDemandFetchedIssue {
  id: string;
  title: string;
  state: string;
  priority: string;
  ticket_number: number;
  display_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  estimate: number | null;
}

export interface FleetGraphOnDemandFetchedScopeChange {
  originalScope: number;
  currentScope: number;
  scopeChangePercent: number;
  sprintStartDate: string;
  scopeChanges: Array<{
    timestamp: string;
    scopeAfter: number;
    changeType: 'added' | 'removed';
    estimateChange: number;
  }>;
}

export interface FleetGraphOnDemandFetchedWorkloadOwner {
  assigneeId: string | null;
  assigneeName: string | null;
  totalIssues: number;
  incompleteIssues: number;
  blockedIssues: number;
}

export interface FleetGraphOnDemandFetchedPlanning {
  issues: FleetGraphOnDemandFetchedIssue[];
  scopeChanges: FleetGraphOnDemandFetchedScopeChange | null;
  workload: {
    owners: FleetGraphOnDemandFetchedWorkloadOwner[];
    unassignedIssues: number;
    maxIncompleteOwnerShare: number | null;
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
  planning?: FleetGraphOnDemandFetchedPlanning | null;
}

export interface FleetGraphOnDemandExpandedScope {
  issueId: string | null;
  weekId: string | null;
  projectId: string | null;
  programId: string | null;
  personId: string | null;
}

export interface FleetGraphOnDemandResponse {
  threadId: string | null;
  status: string;
  stage: string | null;
  mode: string | null;
  triggerType: string | null;
  activeView: FleetGraphActiveViewContext | null;
  expandedScope: FleetGraphOnDemandExpandedScope;
  fetched: FleetGraphOnDemandFetchedPayloads;
  derivedSignals: FleetGraphDerivedSignals;
  finding: FleetGraphOnDemandFinding | null;
  reasoning: FleetGraphOnDemandReasoning | null;
  proposedAction: FleetGraphOnDemandProposedAction | null;
  pendingApproval: FleetGraphOnDemandPendingApproval | null;
  actionResult: FleetGraphOnDemandActionResult | null;
  attempts: FleetGraphAttempts;
  guard: FleetGraphGuardState;
  timing: FleetGraphTimingState;
  reasoningSource: FleetGraphReasoningSource | null;
  suppressionReason: FleetGraphSuppressionReason | null;
  terminalOutcome: FleetGraphTerminalOutcome | null;
  error: {
    code?: string;
    message?: string;
    retryable?: boolean;
    source?: string | null;
  } | null;
  lastNode: string | null;
  nodeHistory: FleetGraphNodeTraceEntry[];
  toolCalls: FleetGraphToolCallTrace[];
  approvals: FleetGraphApprovalTrace[];
  telemetry: FleetGraphTelemetryState;
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
