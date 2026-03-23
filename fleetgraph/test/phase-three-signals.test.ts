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

function createPlanningResponses(
  weekId: string,
  projectId: string,
  issues: Array<Record<string, unknown>>,
  scopeChanges: Record<string, unknown>,
  projectWeeks: Array<Record<string, unknown>> = [],
  allocationGrid: Record<string, unknown> | null = null,
  dependencyOverrides: Record<string, unknown> = {}
) {
  const dependencyResponses = issues
    .filter((issue) => issue.state === 'blocked' && typeof issue.id === 'string')
    .reduce<Record<string, unknown>>((responses, issue) => {
      const issueId = String(issue.id);
      responses[`/api/issues/${issueId}/iterations`] = [];
      responses[`/api/documents/${issueId}/associations?type=parent`] = [];
      responses[`/api/documents/${issueId}/reverse-associations?type=parent`] = [];
      return responses;
    }, {});

  return {
    [`/api/weeks/${weekId}/issues`]: issues,
    [`/api/weeks/${weekId}/scope-changes`]: scopeChanges,
    [`/api/projects/${projectId}/weeks`]: projectWeeks,
    [`/api/weekly-plans/project-allocation-grid/${projectId}`]:
      allocationGrid ?? {
        projectId,
        projectTitle: 'Project',
        currentSprintNumber: null,
        weeks: [],
        people: [],
      },
    ...dependencyResponses,
    ...dependencyOverrides,
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
          'project-1',
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
          },
          [
            {
              id: weekId,
              name: 'Week 14',
              sprint_number: 14,
              status: 'active',
              issue_count: 6,
              completed_count: 0,
              started_count: 0,
            },
            {
              id: 'week-13',
              name: 'Week 13',
              sprint_number: 13,
              status: 'completed',
              issue_count: 5,
              completed_count: 5,
              started_count: 1,
            },
            {
              id: 'week-12',
              name: 'Week 12',
              sprint_number: 12,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 1,
            },
          ]
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
          'project-1',
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
          },
          [
            {
              id: weekId,
              name: 'Week 15',
              sprint_number: 15,
              status: 'active',
              issue_count: 5,
              completed_count: 3,
              started_count: 2,
            },
            {
              id: 'week-14',
              name: 'Week 14',
              sprint_number: 14,
              status: 'completed',
              issue_count: 5,
              completed_count: 5,
              started_count: 2,
            },
            {
              id: 'week-13',
              name: 'Week 13',
              sprint_number: 13,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 2,
            },
          ]
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
          'project-1',
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
          },
          [
            {
              id: weekId,
              name: 'Week 16',
              sprint_number: 16,
              status: 'active',
              issue_count: 6,
              completed_count: 1,
              started_count: 1,
            },
            {
              id: 'week-15',
              name: 'Week 15',
              sprint_number: 15,
              status: 'completed',
              issue_count: 5,
              completed_count: 5,
              started_count: 2,
            },
            {
              id: 'week-14',
              name: 'Week 14',
              sprint_number: 14,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 1,
            },
          ]
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

  it('detects dependency-style blocker risk from issue updates and hierarchy', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-dependency';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        [`/api/documents/${weekId}`]: {
          id: weekId,
          document_type: 'sprint',
          title: 'Week 18',
          status: 'active',
          plan: 'Close the integration path',
          owner_id: 'owner-1',
          owner: null,
          accountable_id: null,
          properties: {},
        },
        [`/api/documents/${weekId}/context`]: {
          current: {
            id: weekId,
            title: 'Week 18',
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
            { date: '2026-03-20', count: 1 },
            { date: '2026-03-21', count: 1 },
            { date: '2026-03-22', count: 0 },
          ],
        },
        [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
          context_type: 'review',
          sprint: {
            id: weekId,
            title: 'Week 18',
            number: '18',
            status: 'active',
            plan: 'Close the integration path',
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
              created_at: '2026-03-21T09:00:00.000Z',
            },
          ],
          issues: {
            stats: {
              total: 5,
              completed: 1,
              in_progress: 1,
              planned_at_start: 5,
              added_mid_sprint: 0,
              cancelled: 0,
            },
            completed_items: [{ id: 'issue-1' }],
            incomplete_items: [{ id: 'issue-2' }, { id: 'issue-3' }, { id: 'issue-4' }, { id: 'issue-5' }],
          },
          existing_review: null,
          clarifying_questions_context: [],
        },
        ...createPlanningResponses(
          weekId,
          'project-1',
          [
            {
              id: 'issue-1',
              title: 'Done issue',
              state: 'done',
              priority: 'medium',
              ticket_number: 1,
              display_id: '#1',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 2,
            },
            {
              id: 'issue-2',
              title: 'Blocked integration approval',
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
              title: 'Blocked backend handoff',
              state: 'blocked',
              priority: 'high',
              ticket_number: 3,
              display_id: '#3',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 3,
            },
            {
              id: 'issue-4',
              title: 'Todo issue',
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
              title: 'In progress issue',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 5,
              display_id: '#5',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 2,
            },
          ],
          {
            originalScope: 5,
            currentScope: 5,
            scopeChangePercent: 0,
            sprintStartDate: '2026-03-20T00:00:00.000Z',
            scopeChanges: [],
          },
          [
            {
              id: 'week-17',
              name: 'Week 17',
              sprint_number: 17,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 1,
            },
            {
              id: 'week-16',
              name: 'Week 16',
              sprint_number: 16,
              status: 'completed',
              issue_count: 5,
              completed_count: 5,
              started_count: 2,
            },
          ],
          null,
          {
            '/api/issues/issue-2/iterations': [
              {
                id: 'iteration-1',
                blockers_encountered: 'Waiting on design review approval before we can merge the API change.',
                created_at: '2026-03-21T08:30:00.000Z',
                author: {
                  name: 'Lead Engineer',
                },
              },
            ],
            '/api/documents/issue-2/associations?type=parent': [
              {
                related_id: 'parent-1',
                related_title: 'Integration epic',
              },
            ],
            '/api/documents/issue-2/reverse-associations?type=parent': [],
            '/api/issues/issue-3/iterations': [
              {
                id: 'iteration-2',
                blockers_encountered: 'Blocked by backend dependency, waiting on another team to land the schema update.',
                created_at: '2026-03-21T09:00:00.000Z',
                author: {
                  name: 'Pair Engineer',
                },
              },
            ],
            '/api/documents/issue-3/associations?type=parent': [],
            '/api/documents/issue-3/reverse-associations?type=parent': [
              {
                document_id: 'child-1',
                document_title: 'Follow-up task',
              },
            ],
          }
        ),
      }),
      now: () => new Date('2026-03-21T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        ...createInput(weekId),
        prompt: {
          question: 'Is this sprint blocked by dependencies?',
        },
      },
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-8-dependency-risk',
      })
    );

    expect(result.derivedSignals.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(['blocked_work', 'dependency_risk'])
    );
    expect(result.derivedSignals.metrics.dependencyRiskIssues).toBe(2);
    expect(result.fetched.planning?.dependencySignals?.issues).toHaveLength(2);
    expect(result.reasoning?.summary.toLowerCase()).toContain('depend');
    expect(result.reasoning?.recommendedNextStep?.toLowerCase()).toContain('owner');
  });

  it('detects overcommitment compared to recent delivery history', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-throughput';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        [`/api/documents/${weekId}`]: {
          id: weekId,
          document_type: 'sprint',
          title: 'Week 17',
          status: 'active',
          plan: 'Push the roadmap forward',
          owner_id: 'owner-1',
          owner: null,
          accountable_id: null,
          properties: {},
        },
        [`/api/documents/${weekId}/context`]: {
          current: {
            id: weekId,
            title: 'Week 17',
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
            { date: '2026-03-17', count: 3 },
            { date: '2026-03-18', count: 2 },
            { date: '2026-03-19', count: 1 },
          ],
        },
        [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
          context_type: 'review',
          sprint: {
            id: weekId,
            title: 'Week 17',
            number: '17',
            status: 'active',
            plan: 'Push the roadmap forward',
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
              created_at: '2026-03-19T09:00:00.000Z',
            },
          ],
          issues: {
            stats: {
              total: 9,
              completed: 1,
              in_progress: 1,
              planned_at_start: 9,
              added_mid_sprint: 0,
              cancelled: 0,
            },
            completed_items: [{ id: 'issue-1' }],
            incomplete_items: Array.from({ length: 8 }, (_, index) => ({
              id: `issue-${index + 2}`,
            })),
          },
          existing_review: null,
          clarifying_questions_context: [],
        },
        ...createPlanningResponses(
          weekId,
          'project-1',
          [
            {
              id: 'issue-1',
              title: 'Done issue',
              state: 'done',
              priority: 'medium',
              ticket_number: 1,
              display_id: '#1',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 2,
            },
            {
              id: 'issue-2',
              title: 'Active issue',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 2,
              display_id: '#2',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 3,
            },
            ...Array.from({ length: 7 }, (_, index) => ({
              id: `issue-${index + 3}`,
              title: `Todo issue ${index + 3}`,
              state: 'todo',
              priority: 'medium',
              ticket_number: index + 3,
              display_id: `#${index + 3}`,
              assignee_id: index < 4 ? 'owner-1' : 'owner-2',
              assignee_name: index < 4 ? 'Lead Engineer' : 'Pair Engineer',
              estimate: 3,
            })),
          ],
          {
            originalScope: 9,
            currentScope: 9,
            scopeChangePercent: 0,
            sprintStartDate: '2026-03-17T00:00:00.000Z',
            scopeChanges: [],
          },
          [
            {
              id: weekId,
              name: 'Week 17',
              sprint_number: 17,
              status: 'active',
              issue_count: 9,
              completed_count: 1,
              started_count: 1,
            },
            {
              id: 'week-16',
              name: 'Week 16',
              sprint_number: 16,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 1,
            },
            {
              id: 'week-15',
              name: 'Week 15',
              sprint_number: 15,
              status: 'completed',
              issue_count: 5,
              completed_count: 5,
              started_count: 2,
            },
            {
              id: 'week-14',
              name: 'Week 14',
              sprint_number: 14,
              status: 'completed',
              issue_count: 4,
              completed_count: 4,
              started_count: 1,
            },
          ],
          {
            projectId: 'project-1',
            projectTitle: 'Project',
            currentSprintNumber: 17,
            weeks: [],
            people: [
              {
                id: 'owner-1',
                name: 'Lead Engineer',
                weeks: {
                  17: {
                    isAllocated: true,
                  },
                },
              },
              {
                id: 'owner-2',
                name: 'Pair Engineer',
                weeks: {
                  17: {
                    isAllocated: true,
                  },
                },
              },
            ],
          }
        ),
      }),
      now: () => new Date('2026-03-19T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        ...createInput(weekId),
        prompt: {
          question: 'Are we overcommitted compared to recent velocity?',
        },
      },
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-8-throughput-gap',
      })
    );

    expect(result.derivedSignals.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(['throughput_gap', 'staffing_pressure'])
    );
    expect(result.derivedSignals.metrics.recentAverageCompletedIssues).toBe(4.33);
    expect(result.derivedSignals.metrics.throughputSampleSize).toBe(3);
    expect(result.derivedSignals.metrics.throughputLoadRatio).toBe(1.85);
    expect(result.derivedSignals.metrics.allocatedPeopleCount).toBe(2);
    expect(result.derivedSignals.metrics.incompleteIssuesPerAllocatedPerson).toBe(4);
    expect(result.reasoning?.summary.toLowerCase()).toContain('overcommitted');
    expect(result.reasoning?.recommendedNextStep?.toLowerCase()).toContain('reduce scope');
  });

  it('surfaces injected proactive event signals through the shared graph path', async () => {
    const graph = createFleetGraph();
    const weekId = 'week-event';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        [`/api/documents/${weekId}`]: {
          id: weekId,
          document_type: 'sprint',
          title: 'Week 15',
          status: 'active',
          plan: 'Close milestone tasks',
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
          belongs_to: [{ id: 'project-1', title: 'Project', type: 'project' }],
        },
        [`/api/activity/sprint/${weekId}`]: {
          days: [
            { date: '2026-03-18', count: 2 },
            { date: '2026-03-19', count: 1 },
            { date: '2026-03-20', count: 3 },
          ],
        },
        [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
          context_type: 'review',
          sprint: {
            id: weekId,
            title: 'Week 15',
            number: '15',
            status: 'active',
            plan: 'Close milestone tasks',
          },
          program: null,
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
              content: null,
              author: 'owner-1',
              created_at: '2026-03-20T13:00:00.000Z',
            },
          ],
          issues: {
            stats: {
              total: 3,
              completed: 1,
              in_progress: 1,
              planned_at_start: 3,
              added_mid_sprint: 0,
              cancelled: 0,
            },
            completed_items: [{ id: 'issue-1' }],
            incomplete_items: [{ id: 'issue-2' }, { id: 'issue-3' }],
          },
          existing_review: null,
          clarifying_questions_context: [],
        },
        ...createPlanningResponses(
          weekId,
          'project-1',
          [
            {
              id: 'issue-1',
              title: 'Issue 1',
              state: 'done',
              priority: 'medium',
              ticket_number: 1,
              display_id: '#1',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 3,
            },
            {
              id: 'issue-2',
              title: 'Issue 2',
              state: 'in_progress',
              priority: 'medium',
              ticket_number: 2,
              display_id: '#2',
              assignee_id: 'owner-1',
              assignee_name: 'Lead Engineer',
              estimate: 3,
            },
            {
              id: 'issue-3',
              title: 'Issue 3',
              state: 'todo',
              priority: 'medium',
              ticket_number: 3,
              display_id: '#3',
              assignee_id: 'owner-2',
              assignee_name: 'Pair Engineer',
              estimate: 2,
            },
          ],
          {
            originalScope: 8,
            currentScope: 8,
            scopeChangePercent: 0,
            sprintStartDate: '2026-03-18T00:00:00.000Z',
            scopeChanges: [],
          }
        ),
      }),
      now: () => new Date('2026-03-20T18:00:00.000Z'),
    });

    const input: FleetGraphRunInput = {
      runId: 'run-event',
      mode: 'proactive',
      triggerType: 'event',
      workspaceId: 'workspace-1',
      actor: {
        id: 'user-1',
        kind: 'user',
        role: null,
      },
      contextEntity: {
        id: weekId,
        type: 'week',
      },
      injectedSignals: [
        {
          kind: 'issue_blocker_logged',
          severity: 'warning',
          summary: '#9 logged a blocker in Week 15: Waiting on platform review.',
          evidence: [
            '#9 logged a blocker in Week 15: Waiting on platform review.',
            'Blocker summary: Waiting on platform review.',
            'Iteration status: in_progress.',
          ],
          dedupeKey: `${weekId}:issue_blocker_logged:issue-9`,
        },
      ],
      trace: {
        runName: 'fleetgraph-proactive-event-test',
        tags: ['fleetgraph', 'test', 'event'],
      },
    };

    const result = await graph.invoke(
      input,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'phase-3-event',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.terminalOutcome).toBe('finding_only');
    expect(result.finding).toEqual({
      summary: '#9 logged a blocker in Week 15: Waiting on platform review.',
      severity: 'warning',
    });
    expect(result.derivedSignals.signals.map((signal) => signal.kind)).toContain('issue_blocker_logged');
  });
});
