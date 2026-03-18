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
  postCalls: Array<{ path: string; body: unknown }> = []
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
          ? new Date(
              input.now.getTime() + (input.decision.snoozeMinutes ?? 60) * 60_000
            ).toISOString()
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

function createInput(weekId: string, runId = 'run-1'): FleetGraphRunInput {
  return {
    runId,
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
      runName: 'fleetgraph-phase-seven-test',
      tags: ['fleetgraph', 'phase-seven', 'test'],
    },
  };
}

describe('FleetGraph Phase 7 hardening', () => {
  it('records deterministic reasoning source and node timing history on the on-demand path', async () => {
    const weekId = 'week-phase-seven-observability';
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId)),
      actionMemory: createActionMemoryStub(),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      createInput(weekId),
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-7-observability',
      })
    );

    expect(result.reasoningSource).toBe('deterministic');
    expect(result.attempts.reasoning).toBe(1);
    expect(result.guard.transitionCount).toBeGreaterThan(0);
    expect(result.timing.startedAt).toBeTruthy();
    expect(result.timing.deadlineAt).toBeTruthy();
    expect(result.lastNode).toBeTruthy();
    expect(result.nodeHistory.length).toBeGreaterThan(0);
    expect(result.nodeHistory.at(-1)?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('fails terminally when the transition budget is exceeded', async () => {
    const weekId = 'week-phase-seven-max-transitions';
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId)),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
      guardrails: {
        maxTransitions: 3,
        maxRetries: 2,
        maxResumeCount: 2,
        maxReasoningAttempts: 2,
        deadlineMs: 120_000,
        maxNodeHistoryEntries: 40,
      },
    });

    const result = await graph.invoke(
      createInput(weekId),
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-7-max-transitions',
      })
    );

    expect(result.status).toBe('failed');
    expect(result.error).toMatchObject({
      code: 'MAX_TRANSITIONS_EXCEEDED',
      retryable: false,
    });
    expect(result.terminalOutcome).toBe('failed_terminal');
    expect(result.guard.circuitBreakerOpen).toBe(true);
  });

  it('fails terminally when the human resume budget is exceeded', async () => {
    const weekId = 'week-phase-seven-max-resumes';
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId)),
      actionMemory: createActionMemoryStub(),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
      guardrails: {
        maxTransitions: 24,
        maxRetries: 2,
        maxResumeCount: 0,
        maxReasoningAttempts: 2,
        deadlineMs: 120_000,
        maxNodeHistoryEntries: 40,
      },
    });
    const config = createFleetGraphRunnableConfig(runtime, {
      threadId: 'phase-7-max-resumes',
    });

    await graph.invoke(createInput(weekId), config);

    const resumedResult = await graph.invoke(
      new Command({
        resume: {
          outcome: 'approve',
          note: 'Proceed',
        },
      }),
      config
    );

    expect(resumedResult.status).toBe('failed');
    expect(resumedResult.error).toMatchObject({
      code: 'MAX_RESUMES_EXCEEDED',
      retryable: false,
    });
    expect(resumedResult.terminalOutcome).toBe('failed_terminal');
  });

  it('suppresses a previously dismissed proposal using action memory', async () => {
    const weekId = 'week-phase-seven-suppressed';
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub(createFlaggedResponses(weekId)),
      actionMemory: createActionMemoryStub(),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });
    const firstConfig = createFleetGraphRunnableConfig(runtime, {
      threadId: 'phase-7-dismiss-first',
    });

    await graph.invoke(createInput(weekId, 'run-dismiss-first'), firstConfig);
    await graph.invoke(
      new Command({
        resume: {
          outcome: 'dismiss',
          note: 'Not now',
        },
      }),
      firstConfig
    );

    const secondResult = await graph.invoke(
      createInput(weekId, 'run-dismiss-second'),
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-7-dismiss-second',
      })
    );

    expect(secondResult.stage).toBe('action_suppressed_by_memory');
    expect(secondResult.suppressionReason).toBe('dismissed_before');
    expect(secondResult.terminalOutcome).toBe('suppressed');
  });
});
