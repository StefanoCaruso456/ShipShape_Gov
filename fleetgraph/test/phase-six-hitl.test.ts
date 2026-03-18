import { Command } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';
import {
  createFleetGraph,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphActionMemoryStore,
  type FleetGraphRunInput,
  type FleetGraphShipApiClient,
} from '../src/index.js';

function createFlaggedResponses(weekId: string): Record<string, unknown> {
  return {
    [`/api/documents/${weekId}`]: {
      id: weekId,
      document_type: 'sprint',
      title: 'Week 14',
      status: 'active',
      plan: 'Ship a milestone',
      owner_id: 'owner-1',
      owner: null,
      accountable_id: null,
      properties: {},
    },
    [`/api/documents/${weekId}/context`]: {
      current: {
        id: weekId,
        title: 'Week 14',
        document_type: 'sprint',
      },
      breadcrumbs: [],
      belongs_to: [
        { id: 'project-1', title: 'Project', type: 'project' },
        { id: 'program-1', title: 'Program', type: 'program' },
      ],
    },
    [`/api/activity/sprint/${weekId}`]: {
      days: [
        { date: '2026-03-15', count: 0 },
        { date: '2026-03-16', count: 0 },
        { date: '2026-03-17', count: 0 },
      ],
    },
    [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
      context_type: 'review',
      sprint: {
        id: weekId,
        title: 'Week 14',
        number: '14',
        status: 'active',
        plan: 'Ship a milestone',
      },
      program: {
        id: 'program-1',
        name: 'Program',
        description: null,
        goals: null,
      },
      project: {
        id: 'project-1',
        name: 'Project',
        plan: 'Project plan',
        ice_scores: {
          impact: null,
          confidence: null,
          ease: null,
        },
        monetary_impact_expected: null,
      },
      standups: [],
      issues: {
        stats: {
          total: 6,
          completed: 0,
          in_progress: 0,
          planned_at_start: 6,
          added_mid_sprint: 0,
          cancelled: 0,
        },
        completed_items: [],
        incomplete_items: Array.from({ length: 6 }, (_, index) => ({
          id: `issue-${index + 1}`,
        })),
      },
      existing_review: null,
      clarifying_questions_context: [],
    },
  };
}

function createShipApiStub(
  responses: Record<string, unknown>,
  postCalls: Array<{ path: string; body: unknown }>
): FleetGraphShipApiClient {
  return {
    async get<T>(path: string): Promise<T> {
      if (!(path in responses)) {
        throw new Error(`Unexpected GET path in test: ${path}`);
      }

      return responses[path] as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      postCalls.push({ path, body });
      return {
        id: 'comment-1',
      } as T;
    },
  };
}

function createActionMemoryStub(): FleetGraphActionMemoryStore {
  const records = new Map<string, Awaited<ReturnType<FleetGraphActionMemoryStore['recordDecision']>>>();

  return {
    async getLatestDecision(input) {
      return records.get(
        `${input.workspaceId}:${input.weekId}:${input.actorUserId}:${input.actionFingerprint}`
      ) ?? null;
    },
    async recordDecision(input) {
      const key = `${input.workspaceId}:${input.weekId}:${input.actorUserId}:${input.actionFingerprint}`;
      const snoozedUntil =
        input.decision.outcome === 'snooze'
          ? new Date(input.now.getTime() + (input.decision.snoozeMinutes ?? 60) * 60_000).toISOString()
          : null;

      const record = {
        actionFingerprint: input.actionFingerprint,
        actionType: input.actionType,
        status:
          input.decision.outcome === 'approve'
            ? 'approved'
            : input.decision.outcome === 'snooze'
              ? 'snoozed'
              : 'dismissed',
        decisionNote: input.decision.note ?? null,
        snoozedUntil,
        executedCommentId: input.executedCommentId ?? null,
      } as const;

      records.set(key, record);
      return record;
    },
  };
}

function createInput(weekId: string): FleetGraphRunInput {
  return {
    runId: 'run-1',
    mode: 'on_demand',
    triggerType: 'user_invoke',
    workspaceId: 'workspace-1',
    actor: {
      id: 'user-1',
      kind: 'user',
      role: 'pm',
    },
    activeView: {
      entity: {
        id: weekId,
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'document',
      route: `/documents/${weekId}/issues`,
      tab: 'issues',
      projectId: null,
    },
    contextEntity: {
      id: weekId,
      type: 'week',
    },
    prompt: {
      question: 'Why is this sprint at risk?',
    },
    trace: {
      runName: 'fleetgraph-phase-six-test',
      tags: ['fleetgraph', 'phase-six', 'test'],
    },
  };
}

describe('FleetGraph Phase 6 reasoning and HITL', () => {
  it('resumes an approved draft action and posts the sprint comment', async () => {
    const weekId = 'week-phase-six-approve';
    const graph = createFleetGraph();
    const postCalls: Array<{ path: string; body: unknown }> = [];
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId), postCalls),
      actionMemory: createActionMemoryStub(),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });
    const config = createFleetGraphRunnableConfig(runtime, {
      threadId: 'phase-6-approve',
    });

    const firstResult = await graph.invoke(createInput(weekId), config);
    const interruptValue = (firstResult as typeof firstResult & {
      __interrupt__?: Array<{ value?: unknown }>;
    }).__interrupt__?.[0]?.value as { pendingApproval?: unknown } | undefined;

    expect(firstResult.status).toBe('running');
    expect(firstResult.proposedAction).not.toBeNull();
    expect(interruptValue?.pendingApproval).toBeTruthy();

    const resumedResult = await graph.invoke(
      new Command({
        resume: {
          outcome: 'approve',
          note: 'Looks good',
        },
      }),
      config
    );

    expect(resumedResult.status).toBe('completed');
    expect(resumedResult.stage).toBe('action_executed');
    expect(resumedResult.actionResult).toEqual({
      outcome: 'approved',
      summary: 'FleetGraph posted the approved draft comment to the sprint document.',
      note: null,
      snoozedUntil: null,
      executedCommentId: 'comment-1',
    });
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0]).toMatchObject({
      path: `/api/documents/${weekId}/comments`,
    });
  });

  it('resumes a dismissed draft action without mutating Ship', async () => {
    const weekId = 'week-phase-six-dismiss';
    const graph = createFleetGraph();
    const postCalls: Array<{ path: string; body: unknown }> = [];
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId), postCalls),
      actionMemory: createActionMemoryStub(),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });
    const config = createFleetGraphRunnableConfig(runtime, {
      threadId: 'phase-6-dismiss',
    });

    await graph.invoke(createInput(weekId), config);

    const resumedResult = await graph.invoke(
      new Command({
        resume: {
          outcome: 'dismiss',
          note: 'Not now',
        },
      }),
      config
    );

    expect(resumedResult.status).toBe('completed');
    expect(resumedResult.stage).toBe('action_dismissed');
    expect(resumedResult.actionResult).toEqual({
      outcome: 'dismissed',
      summary: 'FleetGraph dismissed this draft action for the current sprint pattern.',
      note: 'Not now',
      snoozedUntil: null,
      executedCommentId: null,
    });
    expect(postCalls).toHaveLength(0);
  });
});
