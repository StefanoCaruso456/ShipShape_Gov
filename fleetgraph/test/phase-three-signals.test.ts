import { describe, expect, it } from 'vitest';
import {
  createFleetGraph,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphRunInput,
  type FleetGraphShipApiClient,
} from '../src/index.js';

function createShipApiStub(responses: Record<string, unknown>): FleetGraphShipApiClient {
  return {
    async get<T>(path: string): Promise<T> {
      if (!(path in responses)) {
        throw new Error(`Unexpected GET path in test: ${path}`);
      }

      return responses[path] as T;
    },
    async post<T>(): Promise<T> {
      throw new Error('POST not expected in phase-three graph tests');
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
      runName: 'fleetgraph-on-demand-test',
      tags: ['fleetgraph', 'test'],
    },
  };
}

function createPlanningResponses(weekId: string, issues: Array<Record<string, unknown>>, scopeChanges: Record<string, unknown>) {
  return {
    [`/api/weeks/${weekId}/issues`]: issues,
    [`/api/weeks/${weekId}/scope-changes`]: scopeChanges,
  };
}

describe('FleetGraph Phase 3 deterministic signals', () => {
  it('records a signal finding for an active sprint with missing rituals and no progress', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-flagged';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
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
        ...createPlanningResponses(
          weekId,
          Array.from({ length: 6 }, (_, index) => ({
            id: `issue-${index + 1}`,
            title: `Issue ${index + 1}`,
            state: 'todo',
            priority: 'medium',
            ticket_number: index + 1,
            display_id: `#${index + 1}`,
            assignee_id: index < 4 ? 'owner-1' : 'owner-2',
            assignee_name: index < 4 ? 'Lead Engineer' : 'Pair Engineer',
            estimate: 3,
          })),
          {
            originalScope: 18,
            currentScope: 18,
            scopeChangePercent: 0,
            sprintStartDate: '2026-03-15T00:00:00.000Z',
            scopeChanges: [],
          }
        ),
      }),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      createInput(weekId),
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-3-flagged',
      })
    );

    const interruptValue = (result as typeof result & {
      __interrupt__?: Array<{ value?: unknown }>;
    }).__interrupt__?.[0]?.value as { pendingApproval?: unknown } | undefined;

    expect(result.status).toBe('running');
    expect(result.derivedSignals.shouldSurface).toBe(true);
    expect(result.derivedSignals.severity).toBe('action');
    expect(result.finding).not.toBeNull();
    expect(result.reasoning).not.toBeNull();
    expect(result.proposedAction).not.toBeNull();
    expect(interruptValue?.pendingApproval).toBeTruthy();
    expect(result.derivedSignals.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(['missing_standup', 'no_completed_work', 'work_not_started', 'low_recent_activity'])
    );
  });

  it('takes the quiet path when recent activity and execution signals look healthy', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-quiet';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        [`/api/documents/${weekId}`]: {
          id: weekId,
          document_type: 'sprint',
          title: 'Week 15',
          status: 'active',
          plan: 'Finish work cleanly',
          owner_id: 'owner-1',
          owner: null,
          accountable_id: null,
          properties: {},
        },
        [`/api/documents/${weekId}/context`]: {
          current: {
            id: weekId,
            title: 'Week 15',
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
            { date: '2026-03-15', count: 3 },
            { date: '2026-03-16', count: 4 },
            { date: '2026-03-17', count: 5 },
          ],
        },
        [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
          context_type: 'review',
          sprint: {
            id: weekId,
            title: 'Week 15',
            number: '15',
            status: 'active',
            plan: 'Finish work cleanly',
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
          standups: [
            {
              id: 'standup-1',
              title: 'Standup',
              content: {},
              author: 'user-1',
              created_at: '2026-03-17T09:00:00.000Z',
            },
          ],
          issues: {
            stats: {
              total: 5,
              completed: 3,
              in_progress: 2,
              planned_at_start: 5,
              added_mid_sprint: 0,
              cancelled: 0,
            },
            completed_items: [{ id: 'issue-1' }, { id: 'issue-2' }, { id: 'issue-3' }],
            incomplete_items: [{ id: 'issue-4' }, { id: 'issue-5' }],
          },
          existing_review: null,
          clarifying_questions_context: [],
        },
        ...createPlanningResponses(
          weekId,
          [
            {
              id: 'issue-1',
              title: 'Closed issue',
              state: 'done',
              priority: 'high',
              ticket_number: 1,
              display_id: '#1',
              assignee_id: 'owner-1',
              assignee_name: 'Owner',
              estimate: 3,
            },
            {
              id: 'issue-2',
              title: 'Closed issue 2',
              state: 'done',
              priority: 'high',
              ticket_number: 2,
              display_id: '#2',
              assignee_id: 'owner-2',
              assignee_name: 'Owner 2',
              estimate: 3,
            },
            {
              id: 'issue-3',
              title: 'Closed issue 3',
              state: 'done',
              priority: 'medium',
              ticket_number: 3,
              display_id: '#3',
              assignee_id: 'owner-3',
              assignee_name: 'Owner 3',
              estimate: 2,
            },
            {
              id: 'issue-4',
              title: 'In progress 1',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 4,
              display_id: '#4',
              assignee_id: 'owner-1',
              assignee_name: 'Owner',
              estimate: 2,
            },
            {
              id: 'issue-5',
              title: 'In progress 2',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 5,
              display_id: '#5',
              assignee_id: 'owner-2',
              assignee_name: 'Owner 2',
              estimate: 2,
            },
          ],
          {
            originalScope: 12,
            currentScope: 12,
            scopeChangePercent: 0,
            sprintStartDate: '2026-03-15T00:00:00.000Z',
            scopeChanges: [],
          }
        ),
      }),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      createInput(weekId),
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-3-quiet',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.derivedSignals.shouldSurface).toBe(false);
    expect(result.derivedSignals.severity).toBe('none');
    expect(result.finding).toBeNull();
    expect(result.derivedSignals.signals).toEqual([]);
  });

  it('detects planning-intelligence signals for scope growth, blocked work, and workload concentration', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-planning';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        [`/api/documents/${weekId}`]: {
          id: weekId,
          document_type: 'sprint',
          title: 'Week 16',
          status: 'active',
          plan: 'Land expansion work',
          owner_id: 'owner-1',
          owner: null,
          accountable_id: null,
          properties: {},
        },
        [`/api/documents/${weekId}/context`]: {
          current: {
            id: weekId,
            title: 'Week 16',
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
            { date: '2026-03-16', count: 1 },
            { date: '2026-03-17', count: 2 },
            { date: '2026-03-18', count: 0 },
          ],
        },
        [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
          context_type: 'review',
          sprint: {
            id: weekId,
            title: 'Week 16',
            number: '16',
            status: 'active',
            plan: 'Land expansion work',
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
          standups: [
            {
              id: 'standup-1',
              title: 'Standup',
              content: {},
              author: 'user-1',
              created_at: '2026-03-17T09:00:00.000Z',
            },
          ],
          issues: {
            stats: {
              total: 6,
              completed: 1,
              in_progress: 1,
              planned_at_start: 4,
              added_mid_sprint: 2,
              cancelled: 0,
            },
            completed_items: [{ id: 'issue-1' }],
            incomplete_items: [{ id: 'issue-2' }, { id: 'issue-3' }, { id: 'issue-4' }, { id: 'issue-5' }, { id: 'issue-6' }],
          },
          existing_review: null,
          clarifying_questions_context: [],
        },
        ...createPlanningResponses(
          weekId,
          [
            {
              id: 'issue-1',
              title: 'Done issue',
              state: 'done',
              priority: 'high',
              ticket_number: 1,
              display_id: '#1',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 3,
            },
            {
              id: 'issue-2',
              title: 'Blocked migration',
              state: 'blocked',
              priority: 'high',
              ticket_number: 2,
              display_id: '#2',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 5,
            },
            {
              id: 'issue-3',
              title: 'Blocked integration',
              state: 'blocked',
              priority: 'high',
              ticket_number: 3,
              display_id: '#3',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 5,
            },
            {
              id: 'issue-4',
              title: 'Todo 1',
              state: 'todo',
              priority: 'medium',
              ticket_number: 4,
              display_id: '#4',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 3,
            },
            {
              id: 'issue-5',
              title: 'Todo 2',
              state: 'todo',
              priority: 'medium',
              ticket_number: 5,
              display_id: '#5',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 3,
            },
            {
              id: 'issue-6',
              title: 'In progress',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 6,
              display_id: '#6',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 2,
            },
          ],
          {
            originalScope: 10,
            currentScope: 16,
            scopeChangePercent: 60,
            sprintStartDate: '2026-03-16T00:00:00.000Z',
            scopeChanges: [
              {
                timestamp: '2026-03-17T12:00:00.000Z',
                scopeAfter: 13,
                changeType: 'added',
                estimateChange: 3,
              },
              {
                timestamp: '2026-03-18T09:30:00.000Z',
                scopeAfter: 16,
                changeType: 'added',
                estimateChange: 3,
              },
            ],
          }
        ),
      }),
      now: () => new Date('2026-03-18T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        ...createInput(weekId),
        prompt: {
          question: 'Is the risk coming from scope, blockers, or capacity?',
        },
      },
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-8-planning-signals',
      })
    );

    expect(result.derivedSignals.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(['scope_growth', 'blocked_work', 'workload_concentration'])
    );
    expect(result.derivedSignals.metrics.scopeChangePercent).toBe(60);
    expect(result.derivedSignals.metrics.blockedIssues).toBe(2);
    expect(result.reasoning?.summary).toContain('scope');
    expect(result.fetched.planning?.workload?.owners[0]?.assigneeName).toBe('Lead Engineer');
  });
});
