import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queryMock,
  broadcastToUserMock,
  persistFindingMock,
  resolveEventRecipientsMock,
  recordDeliveryMock,
  recordLangSmithChildRunMock,
  createApiTokenShipApiClientMock,
  invokeFleetGraphMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  broadcastToUserMock: vi.fn(),
  persistFindingMock: vi.fn(),
  resolveEventRecipientsMock: vi.fn(),
  recordDeliveryMock: vi.fn(),
  recordLangSmithChildRunMock: vi.fn(),
  createApiTokenShipApiClientMock: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
  invokeFleetGraphMock: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  pool: {
    query: queryMock,
  },
}));

vi.mock('../collaboration/index.js', () => ({
  broadcastToUser: broadcastToUserMock,
}));

vi.mock('./fleetgraph-runner.js', () => ({
  createApiTokenShipApiClient: createApiTokenShipApiClientMock,
  createFleetGraphLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  invokeFleetGraph: invokeFleetGraphMock,
}));

vi.mock('./fleetgraph-proactive.js', () => ({
  persistFleetGraphProactiveFinding: persistFindingMock,
}));

vi.mock('./fleetgraph-proactive-targeting.js', () => ({
  resolveFleetGraphEventRecipients: resolveEventRecipientsMock,
}));

vi.mock('./fleetgraph-telemetry.js', () => ({
  recordFleetGraphProactiveDelivery: recordDeliveryMock,
}));

vi.mock('./fleetgraph-langsmith.js', () => ({
  recordFleetGraphLangSmithChildRun: recordLangSmithChildRunMock,
}));

import type {
  FleetGraphProactiveEventRecord,
  FleetGraphProactiveIssueEventPayload,
} from '@ship/shared';
import {
  evaluateFleetGraphProactiveEvent,
  processPendingFleetGraphProactiveEvents,
} from './fleetgraph-proactive-events.js';

function createIssueEvent(overrides?: Partial<FleetGraphProactiveEventRecord>): FleetGraphProactiveEventRecord {
  return {
    id: 'event-1',
    workspaceId: 'workspace-1',
    entityId: 'issue-1',
    entityType: 'issue',
    eventKind: 'issue_updated',
    route: '/documents/issue-1',
    payload: {
      issue: {
        id: 'issue-1',
        title: 'Fix login edge case',
        ticketNumber: 12,
        state: 'todo',
        assigneeId: null,
        projectId: 'project-1',
        projectTitle: 'Auth Hardening',
        projectOwnerUserId: 'project-owner-1',
        sprintId: 'sprint-1',
        sprintTitle: 'Week 3',
        sprintNumber: 3,
        sprintStatus: 'active',
        sprintSnapshotTakenAt: '2026-03-20T10:00:00.000Z',
        sprintOwnerUserId: 'sprint-owner-1',
        sprintEndDate: '2026-03-20T00:00:00.000Z',
        route: '/documents/issue-1',
      },
      previous: {
        state: 'todo',
        assigneeId: 'user-1',
        sprintId: null,
      },
      actorId: 'user-actor',
      occurredAt: '2026-03-20T18:00:00.000Z',
    },
    matchedTriggerKinds: [],
    findingsCreated: 0,
    processingStatus: 'pending',
    errorMessage: null,
    createdAt: '2026-03-20T18:00:00.000Z',
    processingStartedAt: null,
    processedAt: null,
    ...overrides,
  };
}

function createIssueIterationEvent(
  overrides?: Partial<FleetGraphProactiveEventRecord>
): FleetGraphProactiveEventRecord {
  return {
    id: 'event-iteration-1',
    workspaceId: 'workspace-1',
    entityId: 'issue-9',
    entityType: 'issue',
    eventKind: 'issue_iteration_created',
    route: '/documents/issue-9',
    payload: {
      issue: {
        id: 'issue-9',
        title: 'Harden release workflow',
        ticketNumber: 9,
        state: 'in_progress',
        assigneeId: 'engineer-1',
        projectId: 'project-1',
        projectTitle: 'API Platform',
        projectOwnerUserId: 'project-owner-1',
        sprintId: 'sprint-1',
        sprintTitle: 'Week 3',
        sprintNumber: 3,
        sprintStatus: 'active',
        sprintSnapshotTakenAt: '2026-03-20T10:00:00.000Z',
        sprintOwnerUserId: 'sprint-owner-1',
        sprintEndDate: '2026-03-21T00:00:00.000Z',
        route: '/documents/issue-9',
      },
      iteration: {
        id: 'iter-1',
        status: 'in_progress',
        blockersEncountered: 'Waiting on platform review before this can move forward',
        authorId: 'engineer-1',
        authorName: 'stefano caruso',
      },
      actorId: 'engineer-1',
      occurredAt: '2026-03-20T18:00:00.000Z',
    },
    matchedTriggerKinds: [],
    findingsCreated: 0,
    processingStatus: 'pending',
    errorMessage: null,
    createdAt: '2026-03-20T18:00:00.000Z',
    processingStartedAt: null,
    processedAt: null,
    ...overrides,
  };
}

function createSprintApprovalEvent(
  overrides?: Partial<FleetGraphProactiveEventRecord>
): FleetGraphProactiveEventRecord {
  return {
    id: 'event-sprint-approval-1',
    workspaceId: 'workspace-1',
    entityId: 'sprint-1',
    entityType: 'sprint',
    eventKind: 'sprint_plan_changes_requested',
    route: '/documents/sprint-1/issues',
    payload: {
      sprint: {
        id: 'sprint-1',
        title: 'Week 3',
        sprintNumber: 3,
        status: 'active',
        ownerPersonId: 'person-1',
        ownerUserId: 'sprint-owner-1',
        projectId: null,
        programId: 'program-1',
        programOwnerUserId: 'program-owner-1',
        route: '/documents/sprint-1/issues',
      },
      approval: {
        kind: 'plan',
        previousState: 'approved',
        nextState: 'changes_requested',
        feedback: 'Clarify what the team will cut if scope stays flat.',
        requestedByUserId: 'approver-1',
      },
      actorId: 'approver-1',
      occurredAt: '2026-03-20T19:00:00.000Z',
    },
    matchedTriggerKinds: [],
    findingsCreated: 0,
    processingStatus: 'pending',
    errorMessage: null,
    createdAt: '2026-03-20T19:00:00.000Z',
    processingStartedAt: null,
    processedAt: null,
    ...overrides,
  };
}

describe('FleetGraph proactive event trigger registry', () => {
  beforeEach(() => {
    queryMock.mockReset();
    broadcastToUserMock.mockReset();
    persistFindingMock.mockReset();
    resolveEventRecipientsMock.mockReset();
    recordDeliveryMock.mockReset();
    recordLangSmithChildRunMock.mockReset();
    createApiTokenShipApiClientMock.mockClear();
    invokeFleetGraphMock.mockReset();
    process.env.FLEETGRAPH_INTERNAL_API_TOKEN = 'test-token';
    resolveEventRecipientsMock.mockResolvedValue([
      {
        userId: 'sprint-owner-1',
        audienceRole: 'responsible_owner',
        audienceScope: 'individual',
        deliveryReason: 'Sent to you because you own the sprint or workstream that needs coordination next.',
        workPersona: 'engineer',
      },
    ]);
    recordLangSmithChildRunMock.mockResolvedValue(undefined);
    invokeFleetGraphMock.mockResolvedValue({
      finding: {
        summary: 'FleetGraph surfaced an event-triggered risk.',
        severity: 'warning',
      },
      derivedSignals: {
        severity: 'warning',
        reasons: ['FleetGraph surfaced an event-triggered risk.'],
        summary: 'FleetGraph surfaced an event-triggered risk.',
        shouldSurface: true,
        signals: [
          {
            kind: 'issue_blocker_logged',
            severity: 'warning',
            summary: 'FleetGraph surfaced an event-triggered risk.',
            evidence: ['Event signal'],
            dedupeKey: 'event',
          },
        ],
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
      telemetry: {
        langsmithRunId: 'run-1',
        langsmithRunUrl: 'https://smith.langchain.com/r/run-1',
        langsmithShareUrl: 'https://smith.langchain.com/public/run-1/r',
      },
    });
  });

  it('matches unassigned, added-after-start, and last-day-open triggers for an active sprint issue', () => {
    const event = createIssueEvent();

    const matches = evaluateFleetGraphProactiveEvent(event);

    expect(matches.map((match) => match.triggerKind)).toEqual([
      'issue_unassigned_in_active_sprint',
      'issue_added_after_sprint_start',
      'issue_open_on_last_sprint_day',
    ]);
    expect(matches[0]?.targetUserId).toBe('sprint-owner-1');
    expect(matches[2]?.severity).toBe('action');
  });

  it('matches missing project context and reopened-after-done triggers on issue updates', () => {
    const baseEvent = createIssueEvent();
    const basePayload = baseEvent.payload as FleetGraphProactiveIssueEventPayload;
    const event = createIssueEvent({
      payload: {
        ...basePayload,
        issue: {
          ...basePayload.issue,
          state: 'todo',
          projectId: null,
          projectTitle: null,
          projectOwnerUserId: null,
        },
        previous: {
          state: 'done',
          assigneeId: 'user-1',
          sprintId: 'sprint-1',
        },
      },
    });

    const matches = evaluateFleetGraphProactiveEvent(event);

    expect(matches.map((match) => match.triggerKind)).toContain('issue_missing_project_context_in_active_sprint');
    expect(matches.map((match) => match.triggerKind)).toContain('issue_reopened_after_done');
  });

  it('matches blocker-logged proactive triggers for issue iteration events', () => {
    const event = createIssueIterationEvent();

    const matches = evaluateFleetGraphProactiveEvent(event);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.triggerKind).toBe('issue_blocker_logged');
    expect(matches[0]?.summary).toContain('Waiting on platform review');
  });

  it('matches plan changes requested as a proactive sprint approval trigger', () => {
    const event = createSprintApprovalEvent();

    const matches = evaluateFleetGraphProactiveEvent(event);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.triggerKind).toBe('sprint_plan_changes_requested');
    expect(matches[0]?.targetUserId).toBe('sprint-owner-1');
  });

  it('processes pending events into FleetGraph findings and broadcasts new notifications', async () => {
    const event = createIssueEvent();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: event.id,
            workspace_id: event.workspaceId,
            entity_id: event.entityId,
            entity_type: event.entityType,
            event_kind: event.eventKind,
            route: event.route,
            payload: event.payload,
            matched_trigger_kinds: [],
            findings_created: 0,
            processing_status: 'processing',
            error_message: null,
            created_at: event.createdAt,
            processing_started_at: event.createdAt,
            processed_at: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    persistFindingMock.mockResolvedValue({
      finding: {
        id: 'finding-1',
      },
      shouldNotify: true,
    });

    const result = await processPendingFleetGraphProactiveEvents();

    expect(result.processedEvents).toBe(1);
    expect(result.matchedTriggers).toBe(3);
    expect(result.findingsCreated).toBe(3);
    expect(invokeFleetGraphMock).toHaveBeenCalledTimes(3);
    expect(invokeFleetGraphMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'proactive',
        triggerType: 'event',
        workspaceId: event.workspaceId,
        contextEntity: {
          id: 'sprint-1',
          type: 'week',
        },
        injectedSignals: [
          expect.objectContaining({
            kind: 'issue_unassigned_in_active_sprint',
          }),
        ],
      }),
      expect.objectContaining({
        checkpointNamespace: 'fleetgraph',
      })
    );
    expect(persistFindingMock).toHaveBeenCalledTimes(3);
    expect(persistFindingMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        summary: expect.stringContaining('As the engineer owning this follow-up'),
        payload: expect.objectContaining({
          personalization: expect.objectContaining({
            workPersona: 'engineer',
            applied: true,
          }),
        }),
      })
    );
    expect(broadcastToUserMock).toHaveBeenCalledTimes(3);
    expect(resolveEventRecipientsMock).toHaveBeenCalledTimes(3);
    expect(recordDeliveryMock).toHaveBeenCalledTimes(3);
    expect(recordLangSmithChildRunMock).toHaveBeenCalledTimes(6);
    expect(recordLangSmithChildRunMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentRunId: 'run-1',
        name: 'fleetgraph.proactive.personalize',
        metadata: expect.objectContaining({
          work_persona: 'engineer',
          audience_role: 'responsible_owner',
        }),
      })
    );
    expect(recordLangSmithChildRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        parentRunId: 'run-1',
        name: 'fleetgraph.proactive.delivery',
        metadata: expect.objectContaining({
          work_persona: 'engineer',
          audience_role: 'responsible_owner',
        }),
      })
    );
  });
});
