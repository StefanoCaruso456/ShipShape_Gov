import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { invokeFleetGraphMock, resumeFleetGraphMock, recordFleetGraphFeedbackMock } = vi.hoisted(() => ({
  invokeFleetGraphMock: vi.fn(),
  resumeFleetGraphMock: vi.fn(),
  recordFleetGraphFeedbackMock: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req, _res, next) => {
    req.userId = 'user-123';
    req.workspaceId = 'workspace-123';
    req.workspaceRole = 'admin';
    next();
  }),
  getAuthContext: vi.fn((req) => ({
    userId: req.userId,
    workspaceId: req.workspaceId,
    sessionId: req.sessionId,
    isSuperAdmin: req.isSuperAdmin === true,
    isApiToken: req.isApiToken === true,
  })),
}));

vi.mock('../services/fleetgraph-runner.js', () => ({
  createFleetGraphLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  createRequestScopedShipApiClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
  invokeFleetGraph: invokeFleetGraphMock,
  resumeFleetGraph: resumeFleetGraphMock,
}));

vi.mock('../services/fleetgraph-proactive.js', () => ({
  listFleetGraphFindingsForUser: vi.fn(),
  runFleetGraphProactiveSweep: vi.fn(),
}));

vi.mock('../services/fleetgraph-telemetry.js', async () => {
  const actual = await vi.importActual<typeof import('../services/fleetgraph-telemetry.js')>(
    '../services/fleetgraph-telemetry.js'
  );

  return {
    ...actual,
    recordFleetGraphFeedback: recordFleetGraphFeedbackMock,
  };
});

import fleetGraphRouter from './fleetgraph.js';

function createInvokeResult() {
  return {
    status: 'completed',
    stage: 'current_view_reasoned',
    mode: 'on_demand',
    triggerType: 'user_invoke',
    activeView: null,
    expandedScope: {
      issueId: null,
      weekId: null,
      projectId: null,
      programId: null,
      personId: null,
    },
    fetched: {
      entity: null,
      supporting: null,
      activity: null,
      accountability: null,
      people: null,
    },
    derivedSignals: {
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
        standupCount: 0,
        recentActivityCount: 0,
        recentActiveDays: 0,
        completionRate: null,
      },
    },
    finding: null,
    reasoning: null,
    proposedAction: null,
    pendingApproval: null,
    actionResult: null,
    attempts: {
      reasoning: 0,
      resume: 0,
      actionExecution: 0,
    },
    guard: {
      maxTransitions: 24,
      transitionCount: 2,
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
      lastNodeAt: '2026-03-20T12:00:01.000Z',
      deadlineAt: '2026-03-20T12:02:00.000Z',
    },
    reasoningSource: 'deterministic',
    suppressionReason: null,
    terminalOutcome: 'quiet',
    error: null,
    lastNode: 'reasonAboutCurrentView',
    nodeHistory: [],
    toolCalls: [],
    approvals: [],
    telemetry: {
      langsmithRunId: null,
      langsmithRunUrl: null,
      langsmithShareUrl: null,
      braintrustSpanId: null,
      totalLatencyMs: 123,
      toolCallCount: 0,
      toolFailureCount: 0,
      totalToolLatencyMs: 0,
      approvalCount: 0,
      lastToolName: null,
      loopDetected: false,
    },
    trace: {
      runName: 'fleetgraph-on-demand',
      tags: ['fleetgraph', 'test'],
      metadata: {
        schemaVersion: 'v1',
        runId: 'thread-123',
        threadId: 'thread-123',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-123',
        actorId: 'user-123',
        actorKind: 'user',
        actorRole: 'admin',
        actorWorkPersona: null,
        activeViewSurface: null,
        activeViewRoute: null,
        activeViewTab: null,
        activeEntityId: null,
        activeEntityType: null,
        activeEntitySourceDocumentType: null,
        contextEntityId: null,
        contextEntityType: null,
        issueId: null,
        weekId: null,
        projectId: null,
        programId: null,
        personId: null,
        questionSource: null,
        questionTheme: null,
        answerMode: null,
        status: 'completed',
        stage: 'current_view_reasoned',
        terminalOutcome: 'quiet',
        signalSeverity: 'none',
        signalKinds: [],
        reasoningSource: 'deterministic',
        pendingApproval: false,
        proposedActionType: null,
        actionOutcome: null,
        suppressionReason: null,
        lastNode: 'reasonAboutCurrentView',
        nodeCount: 0,
        toolCallCount: 0,
        approvalCount: 0,
      },
    },
  };
}

describe('FleetGraph API route validation', () => {
  let app: express.Express;

  beforeEach(() => {
    invokeFleetGraphMock.mockReset();
    resumeFleetGraphMock.mockReset();
    recordFleetGraphFeedbackMock.mockReset();
    invokeFleetGraphMock.mockResolvedValue(createInvokeResult());
    app = express();
    app.use(express.json());
    app.use('/api/fleetgraph', fleetGraphRouter);
  });

  it('accepts issue-surface page context with richer metrics', async () => {
    const response = await request(app)
      .post('/api/fleetgraph/on-demand')
      .send({
        active_view: null,
        question: 'Which issues need attention first?',
        question_source: 'starter_prompt',
        page_context: {
          kind: 'issue_surface',
          route: '/documents/program-1/issues',
          title: 'API Platform Issues',
          summary: 'API Platform has visible delivery risk from stale work.',
          emptyState: false,
          metrics: [
            { label: 'Visible issues', value: '15' },
            { label: 'Not started', value: '6' },
            { label: 'In progress', value: '3' },
            { label: 'In review', value: '0' },
            { label: 'Stale open', value: '3' },
            { label: 'Risk cluster', value: 'Week 3' },
            { label: 'Highest impact issue', value: '#9' },
            { label: 'Highest impact project', value: 'Bug Fixes' },
            { label: 'Business value', value: '84/100' },
            { label: 'Top attention issue', value: '#12' },
          ],
          items: [
            {
              label: '#9 Expand test coverage',
              detail: 'Highest impact • Project: Bug Fixes • Business value: 84/100',
              route: '/documents/issue-9',
            },
          ],
          actions: [
            {
              label: 'Open highest-impact #9',
              route: '/documents/issue-9',
              intent: 'prioritize',
              reason: '#9 carries the strongest business value signal on this tab.',
              owner: 'stefano caruso',
            },
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(invokeFleetGraphMock).toHaveBeenCalledTimes(1);
    expect(invokeFleetGraphMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.objectContaining({
          question: 'Which issues need attention first?',
          questionSource: 'starter_prompt',
        }),
      }),
      expect.anything()
    );
  });

  it('records FleetGraph feedback events', async () => {
    const response = await request(app)
      .post('/api/fleetgraph/feedback')
      .send({
        event_name: 'proactive_toast_clicked',
        latency_ms: 245,
        surface: {
          route: '/documents/week-3/issues',
          activeViewSurface: 'document',
          entityType: 'week',
          pageContextKind: 'document',
          tab: 'issues',
          projectId: '11111111-1111-1111-1111-111111111111',
        },
        route_action: {
          label: 'Open',
          route: '/documents/week-3/issues',
          featured: true,
          intent: 'inspect',
        },
        finding_context: {
          finding_id: 'finding-1',
          delivery_source: 'event',
          audience_role: 'team_member',
          audience_scope: 'team',
          delivery_reason: 'Shared with the sprint team because this affects shared sprint coordination or commitments.',
          severity: 'warning',
          signal_kinds: ['issue_blocker_logged'],
        },
      });

    expect(response.status).toBe(204);
    expect(recordFleetGraphFeedbackMock).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-123',
        actorId: 'user-123',
        actorRole: 'admin',
        feedback: {
          event_name: 'proactive_toast_clicked',
          latency_ms: 245,
          surface: {
            route: '/documents/week-3/issues',
            activeViewSurface: 'document',
            entityType: 'week',
            pageContextKind: 'document',
            tab: 'issues',
            projectId: '11111111-1111-1111-1111-111111111111',
          },
          route_action: {
            label: 'Open',
            route: '/documents/week-3/issues',
            featured: true,
            intent: 'inspect',
          },
          finding_context: {
            finding_id: 'finding-1',
            delivery_source: 'event',
            audience_role: 'team_member',
            audience_scope: 'team',
            delivery_reason:
              'Shared with the sprint team because this affects shared sprint coordination or commitments.',
            severity: 'warning',
            signal_kinds: ['issue_blocker_logged'],
          },
        },
      },
      expect.anything()
    );
  });
});
