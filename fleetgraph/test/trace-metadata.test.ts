import { describe, expect, it } from 'vitest';
import {
  buildFleetGraphTraceFromInput,
  buildFleetGraphTraceFromState,
  type FleetGraphRunInput,
  type FleetGraphState,
} from '../src/index.js';

function createState(): FleetGraphState {
  return {
    runId: 'run-trace-1',
    status: 'waiting_on_human',
    stage: 'waiting_on_human',
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
    injectedSignals: [],
    expandedScope: {
      issueId: null,
      weekId: 'week-1',
      projectId: 'project-1',
      programId: 'program-1',
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
      signals: [
        {
          kind: 'missing_standup',
          severity: 'warning',
          summary: 'No standups have been logged for this active sprint yet.',
          evidence: ['Standup count is 0.'],
          dedupeKey: 'week-1:missing_standup',
        },
      ],
      metrics: {
        totalIssues: 6,
        completedIssues: 2,
        inProgressIssues: 2,
        incompleteIssues: 4,
        cancelledIssues: 0,
        blockedIssues: 0,
        dependencyRiskIssues: null,
        standupCount: 0,
        recentActivityCount: 3,
        recentActiveDays: 1,
        completionRate: 0.33,
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
    reasoning: {
      answerMode: 'execution',
      summary: 'The sprint is at risk because no standups have been logged.',
      evidence: ['Standup count is 0.'],
      whyNow: 'The current sprint view is showing execution drift.',
      recommendedNextStep: 'Ask the owner for a same-day update.',
      confidence: 'medium',
    },
    proposedAction: {
      type: 'draft_follow_up_comment',
      targetId: 'week-1',
      summary: 'Draft a follow-up comment.',
      rationale: 'Get a same-day update.',
      draftComment: 'Please post a short update today.',
      targetRoute: '/documents/week-1/issues',
      fingerprint: 'week-1:draft_follow_up_comment',
    },
    actionResult: null,
    attempts: {
      reasoning: 1,
      resume: 0,
      actionExecution: 0,
    },
    guard: {
      maxTransitions: 24,
      transitionCount: 8,
      maxRetries: 2,
      maxResumeCount: 2,
      maxReasoningAttempts: 2,
      maxToolCalls: 12,
      toolCallCount: 2,
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
    terminalOutcome: 'waiting_on_human',
    pendingApproval: {
      actionType: 'draft_follow_up_comment',
      reason: 'Draft a follow-up comment.',
      proposal: {
        type: 'draft_follow_up_comment',
        targetId: 'week-1',
        summary: 'Draft a follow-up comment.',
        rationale: 'Get a same-day update.',
        draftComment: 'Please post a short update today.',
        targetRoute: '/documents/week-1/issues',
        fingerprint: 'week-1:draft_follow_up_comment',
      },
    },
    toolCalls: [],
    approvals: [],
    handoff: null,
    interventions: [],
    error: null,
    lastNode: 'humanApprovalGate',
    nodeHistory: [
      {
        node: 'supervisorEntry',
        phase: 'control',
        startedAt: '2026-03-20T12:00:00.000Z',
        finishedAt: '2026-03-20T12:00:00.010Z',
        latencyMs: 10,
        status: 'ok',
        goto: 'initializeOnDemandContext',
        errorCode: null,
      },
    ],
    telemetry: {
      langsmithRunId: 'ls-run-1',
      langsmithRunUrl: 'https://smith.langchain.com/r/ls-run-1',
      langsmithShareUrl: null,
      braintrustSpanId: 'bt-span-1',
      totalLatencyMs: 4000,
      toolCallCount: 2,
      toolFailureCount: 0,
      totalToolLatencyMs: 120,
      approvalCount: 1,
      lastToolName: 'get_sprint_snapshot',
      loopDetected: false,
    },
    trace: buildFleetGraphTraceFromInput({
      runId: 'run-trace-1',
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
    }),
  };
}

describe('FleetGraph trace metadata', () => {
  it('builds normalized trace metadata from run input', () => {
    const input: FleetGraphRunInput = {
      runId: 'run-123',
      mode: 'proactive',
      triggerType: 'event',
      workspaceId: 'workspace-1',
      actor: {
        id: null,
        kind: 'service',
        role: 'fleetgraph',
        workPersona: null,
      },
      activeView: {
        entity: {
          id: 'issue-1',
          type: 'issue',
          sourceDocumentType: 'issue',
        },
        surface: 'issue',
        route: '/documents/issue-1',
        tab: null,
        projectId: 'project-1',
      },
      contextEntity: {
        id: 'issue-1',
        type: 'issue',
      },
      prompt: {
        question: 'What blockers matter most here?',
        pageContext: null,
        questionSource: 'starter_prompt',
      },
      trace: {
        runName: 'fleetgraph-proactive-event',
        tags: ['fleetgraph', 'event', 'event'],
      },
    };

    const trace = buildFleetGraphTraceFromInput(input, { threadId: 'thread-123' });

    expect(trace.runName).toBe('fleetgraph-proactive-event');
    expect(trace.tags).toEqual(['fleetgraph', 'event']);
    expect(trace.metadata).toMatchObject({
      schemaVersion: 'v1',
      runId: 'run-123',
      threadId: 'thread-123',
      mode: 'proactive',
      triggerType: 'event',
      workspaceId: 'workspace-1',
      actorKind: 'service',
      activeViewSurface: 'issue',
      activeEntityId: 'issue-1',
      issueId: 'issue-1',
      projectId: 'project-1',
      questionSource: 'starter_prompt',
      questionTheme: 'blockers',
      status: 'starting',
    });
  });

  it('builds a reviewable trace snapshot from run state', () => {
    const trace = buildFleetGraphTraceFromState(createState());

    expect(trace.metadata).toMatchObject({
      schemaVersion: 'v1',
      runId: 'run-trace-1',
      threadId: 'run-trace-1',
      mode: 'on_demand',
      triggerType: 'user_invoke',
      workspaceId: 'workspace-1',
      actorId: 'user-1',
      actorRole: 'pm',
      activeViewSurface: 'document',
      activeViewRoute: '/documents/week-1/issues',
      activeEntityId: 'week-1',
      weekId: 'week-1',
      projectId: 'project-1',
      programId: 'program-1',
      questionSource: 'typed',
      questionTheme: 'blockers',
      answerMode: 'execution',
      status: 'waiting_on_human',
      stage: 'waiting_on_human',
      terminalOutcome: 'waiting_on_human',
      signalSeverity: 'warning',
      reasoningSource: 'deterministic',
      pendingApproval: true,
      proposedActionType: 'draft_follow_up_comment',
      actionOutcome: null,
      lastNode: 'humanApprovalGate',
      nodeCount: 1,
      toolCallCount: 2,
      approvalCount: 1,
    });
    expect(trace.metadata.signalKinds).toEqual(['missing_standup']);
  });
});
