import { describe, expect, it } from 'vitest';
import {
  buildFleetGraphTraceFromInput,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphRunInput,
  type FleetGraphState,
} from '../src/index.js';
import { completeRunNode } from '../src/nodes/complete-run.js';

function createRuntime() {
  return createFleetGraphRuntime({
    now: () => new Date('2026-03-20T12:00:00.000Z'),
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
  });
}

function createCurrentViewRunState(): FleetGraphState {
  const input: FleetGraphRunInput = {
    runId: 'run-complete-1',
    mode: 'on_demand',
    triggerType: 'user_invoke',
    workspaceId: 'workspace-1',
    actor: {
      id: 'user-1',
      kind: 'user',
      role: 'pm',
      workPersona: null,
    },
    activeView: {
      entity: {
        id: 'week-1',
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'document',
      route: '/documents/week-1/issues',
      tab: 'issues',
      projectId: 'project-1',
    },
    contextEntity: {
      id: 'week-1',
      type: 'week',
    },
    prompt: {
      question: 'What blockers are putting this sprint at risk?',
      pageContext: null,
      questionSource: 'typed',
    },
    trace: {
      runName: 'fleetgraph-on-demand',
      tags: ['fleetgraph', 'on-demand'],
    },
  };

  return {
    runId: 'run-complete-1',
    status: 'running',
    stage: 'reason_about_current_view',
    mode: 'on_demand',
    triggerType: 'user_invoke',
    workspaceId: 'workspace-1',
    actor: input.actor ?? null,
    activeView: input.activeView ?? null,
    contextEntity: input.contextEntity ?? null,
    prompt: input.prompt ?? null,
    injectedSignals: [],
    expandedScope: {
      issueId: null,
      weekId: 'week-1',
      projectId: 'project-1',
      programId: null,
      personId: null,
    },
    fetched: {
      entity: null,
      activity: null,
      accountability: null,
      people: null,
      supporting: null,
      planning: null,
    },
    derivedSignals: {
      severity: 'warning',
      reasons: ['No standups have been logged for this active sprint yet.'],
      summary: 'No standups have been logged for this active sprint yet.',
      shouldSurface: true,
      signals: [],
      metrics: {
        totalIssues: 0,
        completedIssues: 0,
        inProgressIssues: 0,
        incompleteIssues: 0,
        cancelledIssues: 0,
        blockedIssues: 0,
        dependencyRiskIssues: null,
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
    },
    finding: {
      summary: 'No standups have been logged for this active sprint yet.',
      severity: 'warning',
    },
    reasoning: null,
    proposedAction: null,
    actionResult: null,
    attempts: {
      reasoning: 1,
      resume: 0,
      actionExecution: 0,
    },
    guard: {
      maxTransitions: 24,
      transitionCount: 6,
      maxRetries: 2,
      maxResumeCount: 2,
      maxReasoningAttempts: 2,
      maxToolCalls: 12,
      toolCallCount: 0,
      circuitBreakerOpen: false,
      lastTripReason: null,
    },
    timing: {
      startedAt: '2026-03-20T12:00:00.000Z',
      lastNodeAt: '2026-03-20T12:00:04.000Z',
      deadlineAt: '2026-03-20T12:02:00.000Z',
    },
    reasoningSource: 'deterministic',
    suppressionReason: null,
    terminalOutcome: null,
    pendingApproval: null,
    toolCalls: [],
    approvals: [],
    handoff: null,
    interventions: [],
    error: null,
    lastNode: 'reasonAboutCurrentView',
    nodeHistory: [
      {
        node: 'reasonAboutCurrentView',
        phase: 'reasoning',
        startedAt: '2026-03-20T12:00:03.000Z',
        finishedAt: '2026-03-20T12:00:04.000Z',
        latencyMs: 1000,
        status: 'ok',
        goto: 'completeRun',
        errorCode: null,
      },
    ],
    telemetry: {
      langsmithRunId: 'ls-run-1',
      langsmithRunUrl: 'https://smith.langchain.com/r/ls-run-1',
      langsmithShareUrl: null,
      braintrustSpanId: 'bt-span-1',
      totalLatencyMs: 4000,
      toolCallCount: 0,
      toolFailureCount: 0,
      totalToolLatencyMs: 0,
      approvalCount: 0,
      lastToolName: null,
      loopDetected: false,
    },
    trace: buildFleetGraphTraceFromInput(input),
  } as FleetGraphState;
}

describe('completeRunNode', () => {
  it('refreshes trace metadata to match the completed state', async () => {
    const runtime = createRuntime();
    const config = createFleetGraphRunnableConfig(runtime, {
      threadId: 'complete-run-trace',
    });
    const state = createCurrentViewRunState();

    const result = await completeRunNode(state, config);

    expect(result.status).toBe('completed');
    expect(result.terminalOutcome).toBe('finding_only');
    expect(result.lastNode).toBe('completeRun');
    expect(result.nodeHistory).toHaveLength(state.nodeHistory.length + 1);
    expect(result.trace?.metadata).toMatchObject({
      status: 'completed',
      stage: 'reason_about_current_view',
      terminalOutcome: 'finding_only',
      lastNode: 'completeRun',
      nodeCount: state.nodeHistory.length + 1,
    });
    expect(result.trace?.metadata.status).toBe(result.status);
    expect(result.trace?.metadata.terminalOutcome).toBe(result.terminalOutcome);
    expect(result.trace?.metadata.nodeCount).toBe(result.nodeHistory?.length);
  });
});
