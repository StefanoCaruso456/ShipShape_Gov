import { Annotation } from '@langchain/langgraph';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import type {
  FleetGraphAttempts,
  FleetGraphActor,
  FleetGraphDerivedSignals,
  FleetGraphEntityRef,
  FleetGraphErrorState,
  FleetGraphFetchedPayloads,
  FleetGraphFinding,
  FleetGraphGuardState,
  FleetGraphHandoff,
  FleetGraphInterventionEvent,
  FleetGraphNodeTraceEntry,
  FleetGraphPendingApproval,
  FleetGraphPromptInput,
  FleetGraphProposedAction,
  FleetGraphReasoning,
  FleetGraphReasoningSource,
  FleetGraphRunMode,
  FleetGraphScope,
  FleetGraphStatus,
  FleetGraphSuppressionReason,
  FleetGraphTelemetryState,
  FleetGraphTerminalOutcome,
  FleetGraphTimingState,
  FleetGraphTraceMetadata,
  FleetGraphTriggerType,
  FleetGraphActionResult,
  FleetGraphApprovalTrace,
  FleetGraphToolCallTrace,
} from './types.js';

function replaceValue<T>(left: T, right: T | undefined): T {
  return right === undefined ? left : right;
}

export const FleetGraphStateAnnotation = Annotation.Root({
  runId: Annotation<string | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  status: Annotation<FleetGraphStatus>({
    reducer: replaceValue,
    default: () => 'starting',
  }),
  stage: Annotation<string | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  mode: Annotation<FleetGraphRunMode | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  triggerType: Annotation<FleetGraphTriggerType | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  workspaceId: Annotation<string | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  actor: Annotation<FleetGraphActor | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  activeView: Annotation<FleetGraphActiveViewContext | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  contextEntity: Annotation<FleetGraphEntityRef | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  prompt: Annotation<FleetGraphPromptInput | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  expandedScope: Annotation<FleetGraphScope>({
    reducer: replaceValue,
    default: () => ({
      issueId: null,
      weekId: null,
      projectId: null,
      programId: null,
      personId: null,
    }),
  }),
  fetched: Annotation<FleetGraphFetchedPayloads>({
    reducer: replaceValue,
    default: () => ({
      entity: null,
      activity: null,
      accountability: null,
      people: null,
      supporting: null,
      planning: null,
    }),
  }),
  derivedSignals: Annotation<FleetGraphDerivedSignals>({
    reducer: replaceValue,
    default: () => ({
      severity: 'none',
      reasons: [],
      summary: null,
      shouldSurface: false,
      signals: [],
      metrics: {
        totalIssues: 0,
        completedIssues: 0,
        inProgressIssues: 0,
        incompleteIssues: 0,
        cancelledIssues: 0,
        blockedIssues: 0,
        standupCount: 0,
        recentActivityCount: 0,
        recentActiveDays: 0,
        completionRate: null,
        scopeChangePercent: null,
        maxAssigneeLoadShare: null,
        recentAverageCompletedIssues: null,
        recentAverageStartedIssues: null,
        recentAverageTotalIssues: null,
        throughputSampleSize: 0,
        throughputLoadRatio: null,
        allocatedPeopleCount: null,
        incompleteIssuesPerAllocatedPerson: null,
      },
    }),
  }),
  finding: Annotation<FleetGraphFinding | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  reasoning: Annotation<FleetGraphReasoning | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  proposedAction: Annotation<FleetGraphProposedAction | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  actionResult: Annotation<FleetGraphActionResult | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  attempts: Annotation<FleetGraphAttempts>({
    reducer: replaceValue,
    default: () => ({
      reasoning: 0,
      resume: 0,
      actionExecution: 0,
    }),
  }),
  guard: Annotation<FleetGraphGuardState>({
    reducer: replaceValue,
    default: () => ({
      maxTransitions: 0,
      transitionCount: 0,
      maxRetries: 0,
      maxResumeCount: 0,
      maxReasoningAttempts: 0,
      maxToolCalls: 0,
      toolCallCount: 0,
      circuitBreakerOpen: false,
      lastTripReason: null,
    }),
  }),
  timing: Annotation<FleetGraphTimingState>({
    reducer: replaceValue,
    default: () => ({
      startedAt: null,
      lastNodeAt: null,
      deadlineAt: null,
    }),
  }),
  reasoningSource: Annotation<FleetGraphReasoningSource | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  suppressionReason: Annotation<FleetGraphSuppressionReason | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  terminalOutcome: Annotation<FleetGraphTerminalOutcome | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  pendingApproval: Annotation<FleetGraphPendingApproval | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  toolCalls: Annotation<FleetGraphToolCallTrace[]>({
    reducer: (left, right) => left.concat(right ?? []),
    default: () => [],
  }),
  approvals: Annotation<FleetGraphApprovalTrace[]>({
    reducer: (left, right) => left.concat(right ?? []),
    default: () => [],
  }),
  handoff: Annotation<FleetGraphHandoff | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  interventions: Annotation<FleetGraphInterventionEvent[]>({
    reducer: (left, right) => left.concat(right ?? []),
    default: () => [],
  }),
  error: Annotation<FleetGraphErrorState | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  lastNode: Annotation<string | null>({
    reducer: replaceValue,
    default: () => null,
  }),
  nodeHistory: Annotation<FleetGraphNodeTraceEntry[]>({
    reducer: (left, right) => right ?? left,
    default: () => [],
  }),
  telemetry: Annotation<FleetGraphTelemetryState>({
    reducer: replaceValue,
    default: () => ({
      langsmithRunId: null,
      langsmithRunUrl: null,
      langsmithShareUrl: null,
      braintrustSpanId: null,
      totalLatencyMs: null,
      toolCallCount: 0,
      toolFailureCount: 0,
      totalToolLatencyMs: 0,
      approvalCount: 0,
      lastToolName: null,
      loopDetected: false,
    }),
  }),
  trace: Annotation<FleetGraphTraceMetadata>({
    reducer: replaceValue,
    default: () => ({
      runName: null,
      tags: [],
    }),
  }),
});

export type FleetGraphState = typeof FleetGraphStateAnnotation.State;
export type FleetGraphStateUpdate = typeof FleetGraphStateAnnotation.Update;
