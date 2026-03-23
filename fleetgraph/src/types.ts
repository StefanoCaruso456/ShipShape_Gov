import type {
  ApprovalTracking,
  BelongsTo,
  FleetGraphActiveViewContext,
  FleetGraphApprovalTrace as SharedFleetGraphApprovalTrace,
  FleetGraphAnswerMode as SharedFleetGraphAnswerMode,
  FleetGraphEvidenceToolName as SharedFleetGraphEvidenceToolName,
  FleetGraphQuestionSource as SharedFleetGraphQuestionSource,
  FleetGraphPageContext as SharedFleetGraphPageContext,
  FleetGraphSignalKind as SharedFleetGraphSignalKind,
  FleetGraphQuestionTheme as SharedFleetGraphQuestionTheme,
  FleetGraphScrumSurface as SharedFleetGraphScrumSurface,
  FleetGraphScrumToolContext as SharedFleetGraphScrumToolContext,
  FleetGraphToolCallTrace as SharedFleetGraphToolCallTrace,
  FleetGraphDerivedSignal as SharedFleetGraphDerivedSignal,
  FleetGraphViewEntityType,
} from '@ship/shared';

export type FleetGraphPageContext = SharedFleetGraphPageContext;
export type FleetGraphScrumSurface = SharedFleetGraphScrumSurface;
export type FleetGraphQuestionTheme = SharedFleetGraphQuestionTheme;
export type FleetGraphQuestionSource = SharedFleetGraphQuestionSource;
export type FleetGraphEvidenceToolName = SharedFleetGraphEvidenceToolName;
export type FleetGraphScrumToolContext = SharedFleetGraphScrumToolContext;
export type FleetGraphToolCallTrace = SharedFleetGraphToolCallTrace;
export type FleetGraphApprovalTrace = SharedFleetGraphApprovalTrace;

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

export interface FleetGraphSprintIssueSnapshot {
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

export interface FleetGraphIssueDependencySnapshot {
  issueId: string;
  title: string;
  displayId: string;
  blockerNote: string | null;
  blockerUpdatedAt: string | null;
  blockerAuthorName: string | null;
  parentIssue: {
    id: string;
    title: string;
  } | null;
  childIssueCount: number;
  dependencyCueCount: number;
  dependencyCueReasons: string[];
}

export interface FleetGraphDependencySnapshot {
  blockedIssuesAnalyzed: number;
  dependencyRiskIssues: number;
  issues: FleetGraphIssueDependencySnapshot[];
}

export interface FleetGraphScopeChangeSnapshot {
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

export interface FleetGraphProjectWeekSnapshot {
  id: string;
  name: string;
  sprint_number: number;
  status: 'planning' | 'active' | 'completed';
  issue_count: number;
  completed_count: number;
  started_count: number;
}

export interface FleetGraphProjectAllocationSnapshot {
  currentSprintNumber: number | null;
  allocatedPeopleCount: number;
  allocatedPeople: Array<{
    personId: string;
    name: string;
  }>;
}

export interface FleetGraphWorkloadOwnerSnapshot {
  assigneeId: string | null;
  assigneeName: string | null;
  totalIssues: number;
  incompleteIssues: number;
  blockedIssues: number;
}

export interface FleetGraphPlanningSnapshot {
  issues: FleetGraphSprintIssueSnapshot[];
  scopeChanges: FleetGraphScopeChangeSnapshot | null;
  dependencySignals: FleetGraphDependencySnapshot | null;
  throughputHistory: {
    recentWeeks: FleetGraphProjectWeekSnapshot[];
  } | null;
  capacity: FleetGraphProjectAllocationSnapshot | null;
  workload: {
    owners: FleetGraphWorkloadOwnerSnapshot[];
    unassignedIssues: number;
    maxIncompleteOwnerShare: number | null;
  } | null;
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
  planning: FleetGraphPlanningSnapshot | null;
}

export type FleetGraphSignalSeverity = 'info' | 'warning' | 'action';

export type FleetGraphSignalKind = SharedFleetGraphSignalKind;

export type FleetGraphDerivedSignal = SharedFleetGraphDerivedSignal;

export interface FleetGraphDerivedMetrics {
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  incompleteIssues: number;
  cancelledIssues: number;
  blockedIssues: number;
  dependencyRiskIssues: number | null;
  standupCount: number;
  recentActivityCount: number;
  recentActiveDays: number;
  completionRate: number | null;
  scopeChangePercent: number | null;
  maxAssigneeLoadShare: number | null;
  recentAverageCompletedIssues: number | null;
  recentAverageStartedIssues: number | null;
  recentAverageTotalIssues: number | null;
  throughputSampleSize: number;
  throughputLoadRatio: number | null;
  allocatedPeopleCount: number | null;
  incompleteIssuesPerAllocatedPerson: number | null;
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

export type FleetGraphAnswerMode = SharedFleetGraphAnswerMode;

export type FleetGraphReasoningConfidence = 'low' | 'medium' | 'high';

export interface FleetGraphReasoning {
  answerMode: FleetGraphAnswerMode;
  summary: string;
  evidence: string[];
  whyNow: string | null;
  recommendedNextStep: string | null;
  confidence: FleetGraphReasoningConfidence;
}

export type FleetGraphReasoningSource = 'deterministic' | 'model';

export type FleetGraphActionType =
  | 'draft_follow_up_comment'
  | 'draft_escalation_comment';

export interface FleetGraphProposedAction {
  type: FleetGraphActionType;
  targetId: string | null;
  summary: string;
  rationale: string;
  draftComment: string;
  targetRoute: string | null;
  fingerprint: string;
}

export interface FleetGraphPendingApproval {
  actionType: FleetGraphActionType;
  reason: string;
  proposal: FleetGraphProposedAction;
}

export type FleetGraphHumanDecisionOutcome = 'approve' | 'dismiss' | 'snooze';

export interface FleetGraphHumanDecision {
  outcome: FleetGraphHumanDecisionOutcome;
  note?: string;
  snoozeMinutes?: number | null;
}

export interface FleetGraphActionResult {
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

export interface FleetGraphActionMemoryRecord {
  status: 'approved' | 'dismissed' | 'snoozed';
  snoozedUntil: string | null;
  executedCommentId: string | null;
}

export interface FleetGraphErrorState {
  code: string;
  message: string;
  retryable: boolean;
  source: string | null;
}

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

export type FleetGraphNodeTraceStatus =
  | 'ok'
  | 'interrupted'
  | 'guardrail_stop'
  | 'error';

export interface FleetGraphNodeTraceEntry {
  node: string;
  phase: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  status: FleetGraphNodeTraceStatus;
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

export interface FleetGraphTraceMetadata {
  runName: string | null;
  tags: string[];
}

export interface FleetGraphPromptInput {
  question: string | null;
  pageContext?: FleetGraphPageContext | null;
  questionSource?: FleetGraphQuestionSource | null;
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
  injectedSignals?: FleetGraphDerivedSignal[];
  trace?: FleetGraphTraceMetadata;
}
