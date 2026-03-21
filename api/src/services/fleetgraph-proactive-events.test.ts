import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, broadcastToUserMock, persistFindingMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  broadcastToUserMock: vi.fn(),
  persistFindingMock: vi.fn(),
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
  createFleetGraphLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('./fleetgraph-proactive.js', () => ({
  persistFleetGraphProactiveFinding: persistFindingMock,
}));

import type { FleetGraphProactiveEventRecord } from '@ship/shared';
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

describe('FleetGraph proactive event trigger registry', () => {
  beforeEach(() => {
    queryMock.mockReset();
    broadcastToUserMock.mockReset();
    persistFindingMock.mockReset();
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
    expect(persistFindingMock).toHaveBeenCalledTimes(3);
    expect(broadcastToUserMock).toHaveBeenCalledTimes(3);
  });
});
