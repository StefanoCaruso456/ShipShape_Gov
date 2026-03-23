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
      throw new Error('POST not expected in context-resolution tests');
    },
  };
}

function createSprintContextResponses(
  weekId: string,
  projectId: string,
  programId: string
): Record<string, unknown> {
  return {
    [`/api/documents/${weekId}`]: {
      id: weekId,
      document_type: 'sprint',
      title: 'Week 15',
      status: 'active',
      plan: 'Finish the sprint cleanly',
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
        { id: programId, title: 'Program', type: 'program' },
        { id: projectId, title: 'Project', type: 'project' },
      ],
    },
    [`/api/activity/sprint/${weekId}`]: {
      days: [
        { date: '2026-03-15', count: 2 },
        { date: '2026-03-16', count: 3 },
        { date: '2026-03-17', count: 4 },
      ],
    },
    [`/api/claude/context?context_type=review&sprint_id=${weekId}`]: {
      context_type: 'review',
      sprint: {
        id: weekId,
        title: 'Week 15',
        number: '15',
        status: 'active',
        plan: 'Finish the sprint cleanly',
      },
      program: {
        id: programId,
        name: 'Program',
        description: null,
        goals: null,
      },
      project: {
        id: projectId,
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
          total: 4,
          completed: 2,
          in_progress: 2,
          planned_at_start: 4,
          added_mid_sprint: 0,
          cancelled: 0,
        },
        completed_items: [{ id: 'issue-1' }, { id: 'issue-2' }],
        incomplete_items: [{ id: 'issue-3' }, { id: 'issue-4' }],
      },
      existing_review: null,
      clarifying_questions_context: [],
    },
    [`/api/weeks/${weekId}/issues`]: [
      {
        id: 'issue-1',
        title: 'Issue 1',
        state: 'done',
        priority: 'high',
        ticket_number: 1,
        display_id: '#1',
        assignee_id: 'owner-1',
        assignee_name: 'Owner 1',
        estimate: 3,
      },
      {
        id: 'issue-2',
        title: 'Issue 2',
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
        title: 'Issue 3',
        state: 'in_progress',
        priority: 'medium',
        ticket_number: 3,
        display_id: '#3',
        assignee_id: 'owner-1',
        assignee_name: 'Owner 1',
        estimate: 2,
      },
      {
        id: 'issue-4',
        title: 'Issue 4',
        state: 'in_progress',
        priority: 'medium',
        ticket_number: 4,
        display_id: '#4',
        assignee_id: 'owner-2',
        assignee_name: 'Owner 2',
        estimate: 2,
      },
    ],
    [`/api/weeks/${weekId}/scope-changes`]: {
      originalScope: 10,
      currentScope: 10,
      scopeChangePercent: 0,
      sprintStartDate: '2026-03-15T00:00:00.000Z',
      scopeChanges: [],
    },
    [`/api/projects/${projectId}/weeks`]: [
      {
        id: weekId,
        name: 'Week 15',
        sprint_number: 15,
        status: 'active',
        issue_count: 4,
        completed_count: 2,
        started_count: 2,
      },
      {
        id: 'week-14',
        name: 'Week 14',
        sprint_number: 14,
        status: 'completed',
        issue_count: 5,
        completed_count: 5,
        started_count: 1,
      },
      {
        id: 'week-13',
        name: 'Week 13',
        sprint_number: 13,
        status: 'completed',
        issue_count: 4,
        completed_count: 4,
        started_count: 1,
      },
    ],
    [`/api/weekly-plans/project-allocation-grid/${projectId}`]: {
      projectId,
      projectTitle: 'Project',
      currentSprintNumber: 15,
      weeks: [],
      people: [
        {
          id: 'owner-1',
          name: 'Owner 1',
          weeks: {
            15: {
              isAllocated: true,
            },
          },
        },
        {
          id: 'owner-2',
          name: 'Owner 2',
          weeks: {
            15: {
              isAllocated: true,
            },
          },
        },
      ],
    },
  };
}

describe('FleetGraph non-week context resolution', () => {
  it('resolves a project document into the current sprint before fetching context', async () => {
    const graph = createFleetGraph();
    const projectId = 'project-1';
    const weekId = 'week-15';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        '/api/weeks': {
          current_sprint_number: 15,
        },
        [`/api/weeks/lookup?project_id=${projectId}&sprint_number=15`]: {
          id: weekId,
        },
        ...createSprintContextResponses(weekId, projectId, 'program-1'),
      }),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'project-context',
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
            id: projectId,
            type: 'project',
            sourceDocumentType: 'project',
          },
          surface: 'document',
          route: `/documents/${projectId}/weeks`,
          tab: 'weeks',
          projectId,
        },
        contextEntity: {
          id: projectId,
          type: 'project',
        },
        prompt: {
          question: 'Why is this sprint at risk?',
        },
        trace: {
          runName: 'fleetgraph-project-context-test',
          tags: ['fleetgraph', 'test', 'project'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'project-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.expandedScope.weekId).toBe(weekId);
    expect(result.expandedScope.projectId).toBe(projectId);
    expect(result.activeView?.entity.type).toBe('project');
    expect(result.fetched.entity?.id).toBe(weekId);
    expect(result.toolCalls).toHaveLength(6);
    expect(result.toolCalls.map((trace) => trace.toolName)).toEqual([
      'get_surface_context',
      'get_sprint_snapshot',
      'get_visible_issue_worklist',
      'get_scope_change_signals',
      'get_recent_delivery_history',
      'get_team_ownership_and_capacity',
    ]);
    expect(result.telemetry.toolCallCount).toBe(6);
    expect(result.telemetry.toolFailureCount).toBe(0);
  });

  it('resolves a single-project My Week view into that project sprint', async () => {
    const graph = createFleetGraph();
    const projectId = 'project-2';
    const weekId = 'week-16';
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        '/api/dashboard/my-week?week_number=16': {
          week: {
            week_number: 16,
          },
          projects: [{ id: projectId }],
        },
        [`/api/weeks/lookup?project_id=${projectId}&sprint_number=16`]: {
          id: weekId,
        },
        ...createSprintContextResponses(weekId, projectId, 'program-2'),
      }),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'my-week-context',
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
            id: 'person-1',
            type: 'person',
            sourceDocumentType: 'person',
          },
          surface: 'my_week',
          route: '/my-week?week_number=16',
          tab: null,
          projectId: null,
        },
        contextEntity: {
          id: 'person-1',
          type: 'person',
        },
        prompt: {
          question: 'Why is this sprint at risk?',
        },
        trace: {
          runName: 'fleetgraph-my-week-context-test',
          tags: ['fleetgraph', 'test', 'my-week'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'my-week-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.expandedScope.weekId).toBe(weekId);
    expect(result.expandedScope.projectId).toBe(projectId);
    expect(result.activeView?.projectId).toBe(projectId);
    expect(result.fetched.entity?.id).toBe(weekId);
    expect(result.toolCalls).toHaveLength(6);
    expect(result.toolCalls.map((trace) => trace.toolName)).toEqual([
      'get_surface_context',
      'get_sprint_snapshot',
      'get_visible_issue_worklist',
      'get_scope_change_signals',
      'get_recent_delivery_history',
      'get_team_ownership_and_capacity',
    ]);
    expect(result.telemetry.toolCallCount).toBe(6);
    expect(result.telemetry.toolFailureCount).toBe(0);
  });

  it('fails clearly when My Week covers multiple projects and no narrower project is in scope', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      shipApi: createShipApiStub({
        '/api/dashboard/my-week': {
          week: {
            week_number: 15,
          },
          projects: [{ id: 'project-1' }, { id: 'project-2' }],
        },
      }),
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'my-week-ambiguous',
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
            id: 'person-1',
            type: 'person',
            sourceDocumentType: 'person',
          },
          surface: 'my_week',
          route: '/my-week',
          tab: null,
          projectId: null,
        },
        contextEntity: {
          id: 'person-1',
          type: 'person',
        },
        prompt: {
          question: 'Why is this sprint at risk?',
        },
        trace: {
          runName: 'fleetgraph-my-week-ambiguous-test',
          tags: ['fleetgraph', 'test', 'my-week'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'my-week-ambiguous',
      })
    );

    expect(result.status).toBe('failed');
    expect(result.stage).toBe('fallback');
    expect(result.error?.code).toBe('MY_WEEK_AMBIGUOUS_SCOPE');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.toolName).toBe('get_surface_context');
    expect(result.telemetry.toolCallCount).toBe(1);
  });

  it('answers from page context when there is no sprint entity but the current page snapshot is available', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-17T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'page-context-only',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What should I look at next?',
          pageContext: {
            kind: 'programs',
            route: '/programs',
            title: 'Programs',
            summary: 'Programs shows 5 active programs in this workspace.',
            emptyState: false,
            metrics: [
              { label: 'Active programs', value: '5' },
              { label: 'Programs with owner', value: '5' },
            ],
            items: [
              {
                label: 'API Platform',
                detail: 'Owner: stefano caruso • 11 issues',
                route: '/documents/program-1',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-page-context-test',
          tags: ['fleetgraph', 'test', 'page-context'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'page-context-only',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.stage).toBe('current_view_reasoned');
    expect(result.reasoningSource).toBe('deterministic');
    expect(result.reasoning?.summary).toContain('Programs shows 5 active programs');
    expect(result.reasoning?.evidence).toContain('Active programs: 5');
  });

  it('treats a scoped issue surface as execution guidance instead of generic page guidance', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What is blocking delivery in this project?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet. 3 visible issues are still sitting in triage, backlog, or todo, led by Week 3.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '5' },
              { label: 'Not started', value: '3' },
              { label: 'In progress', value: '1' },
              { label: 'Stale open', value: '1' },
              { label: 'Risk cluster', value: 'Week 3' },
            ],
            items: [
              {
                label: 'Week 3',
                detail: '3 open issues • 1 issue active • 2 issues not started',
                route: '/documents/week-3/issues',
              },
              {
                label: '#14 Expand test coverage',
                detail: 'State: todo • Week: Week 3 • Owner: stefano caruso • Updated 4d ago',
                route: '/documents/issue-3',
              },
            ],
            actions: [
              {
                label: 'Open risk cluster Week 3',
                route: '/documents/week-3/issues',
                intent: 'prioritize',
                reason: 'Week 3 holds 3 open issues with 2 issues still not started.',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-context-test',
          tags: ['fleetgraph', 'test', 'issue-surface'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.stage).toBe('current_view_reasoned');
    expect(result.reasoningSource).toBe('deterministic');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('does not show a named blocker');
    expect(result.reasoning?.whyNow).toContain('explicit blocker evidence');
    expect(result.reasoning?.recommendedNextStep).toContain('Open risk cluster Week 3');
  });

  it('answers highest-impact issue questions from issue-surface business value signals', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-impact-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What issue is high impact?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform has visible delivery risk from stale work. 1 open issue has not moved in at least 3 days, and Week 3 is carrying the heaviest open cluster.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '5' },
              { label: 'Stale open', value: '1' },
              { label: 'Risk cluster', value: 'Week 3' },
              { label: 'Highest impact issue', value: '#14' },
              { label: 'Highest impact project', value: 'Performance' },
              { label: 'Business value', value: '87/100' },
            ],
            items: [
              {
                label: '#14 Expand test coverage',
                detail: 'Highest impact • Project: Performance • Business value: 87/100 • Drivers: ROI 5/5 + Growth 5/5',
                route: '/documents/issue-3',
              },
            ],
            actions: [
              {
                label: 'Open highest-impact #14',
                route: '/documents/issue-3',
                intent: 'prioritize',
                reason: '#14 carries the strongest business value signal on this tab. Business value 87/100.',
                owner: 'stefano caruso',
              },
              {
                label: 'Open risk cluster Week 3',
                route: '/documents/week-3/issues',
                intent: 'prioritize',
                reason: 'Week 3 holds 3 open issues with 2 issues still not started.',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-impact-context-test',
          tags: ['fleetgraph', 'test', 'issue-surface', 'business-value'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-impact-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.stage).toBe('current_view_reasoned');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('#14 is the highest-impact visible issue');
    expect(result.reasoning?.summary).toContain('87/100');
    expect(result.reasoning?.recommendedNextStep).toContain('Open highest-impact #14');
  });

  it('answers blocker questions from explicit issue-surface blocker evidence', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-blocker-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What is blocked, by whom, and for how long?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform has explicit blocker evidence on this issues surface. #12 is currently blocked and has been sitting for 4 days under stefano caruso.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '5' },
              { label: 'Blocked issues', value: '1' },
              { label: 'Stale blockers', value: '1' },
              { label: 'Oldest blocker', value: '4 days' },
              { label: 'Risk cluster', value: 'Week 3' },
            ],
            items: [
              {
                label: '#12 Implement core workflow',
                detail:
                  'Blocked 4 days • Owner: stefano caruso • Logged by: stefano caruso • Blocker: Waiting on API review from platform team',
                route: '/documents/issue-1',
              },
            ],
            actions: [
              {
                label: 'Follow up on blocker #12',
                route: '/documents/issue-1',
                intent: 'follow_up',
                reason:
                  '#12 has been blocked for 4 days. Owner: stefano caruso. Blocker: Waiting on API review from platform team',
                owner: 'stefano caruso',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-blocker-context-test',
          tags: ['fleetgraph', 'test', 'issue-surface', 'blockers'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-blocker-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.stage).toBe('current_view_reasoned');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('#12 Implement core workflow is the clearest visible blocker right now');
    expect(result.reasoning?.summary).toContain('Oldest blocker: 4 days');
    expect(result.reasoning?.recommendedNextStep).toContain('Follow up on blocker #12');
  });

  it('answers stalled-work questions with a direct stalled issue instead of generic risk copy', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-stalled-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'Which "in progress" issues are actually stalled?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform has active work that looks stalled on this issues surface. #12 is still in progress under stefano caruso and has gone stale.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '5' },
              { label: 'In progress', value: '2' },
              { label: 'Stalled active', value: '1' },
              { label: 'Not started', value: '3' },
            ],
            items: [
              {
                label: '#12 Implement core workflow',
                detail:
                  'Stalled in progress • State: In Progress • Week: Week 3 • Owner: stefano caruso • Updated 4d ago',
                route: '/documents/issue-1',
              },
            ],
            actions: [
              {
                label: 'Follow up on stalled #12',
                route: '/documents/issue-1',
                intent: 'follow_up',
                reason:
                  '#12 looks stalled while still in progress. Owner: stefano caruso. Updated 4d ago.',
                owner: 'stefano caruso',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-stalled-test',
          tags: ['fleetgraph', 'test', 'issue-surface', 'stalled'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-stalled-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('#12 Implement core workflow is the clearest in-progress issue that looks stalled right now');
    expect(result.reasoning?.recommendedNextStep).toContain('Follow up on stalled #12');
  });

  it('answers cut questions with named cut candidates instead of generic highest-impact guidance', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-cut-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What can we cut and still protect delivery?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '15' },
              { label: 'Not started', value: '9' },
              { label: 'Risk cluster', value: 'Backlog' },
              { label: 'Highest impact issue', value: '#9' },
              { label: 'Business value', value: '64/100' },
            ],
            items: [
              {
                label: '#15 Explore stretch improvements',
                detail:
                  'Cut candidate • State: Backlog • Backlog • Business value: 24/100 • Not started and safer to move out than the active or higher-value work on this tab',
                route: '/documents/issue-15',
              },
              {
                label: '#10 Explore stretch improvements',
                detail:
                  'Cut candidate • State: Backlog • Backlog • Business value: 28/100 • Not started and safer to move out than the active or higher-value work on this tab',
                route: '/documents/issue-10',
              },
              {
                label: '#9 Expand test coverage',
                detail:
                  'Highest impact • State: Todo • Week: Week 3 • Business value: 64/100 • Drivers: ROI 4/5 + Growth 4/5 • Risk: not started inside Backlog',
                route: '/documents/issue-9',
              },
            ],
            actions: [
              {
                label: 'Review cut candidate #15',
                route: '/documents/issue-15',
                intent: 'prioritize',
                reason:
                  '#15 is not started yet. Business value 24/100. Safer to move out than the active or higher-value work on this tab. Keeps #9 protected.',
              },
              {
                label: 'Open highest-impact #9',
                route: '/documents/issue-9',
                intent: 'prioritize',
                reason:
                  '#9 carries the strongest business value signal on this tab. Business value 64/100. Current risk: not started inside Backlog.',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-cut-test',
          tags: ['fleetgraph', 'test', 'issue-surface', 'cut'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-cut-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('If you need to cut scope, start with #15 Explore stretch improvements, then #10 Explore stretch improvements');
    expect(result.reasoning?.summary).toContain('lower value than #9');
    expect(result.reasoning?.recommendedNextStep).toContain('Review cut candidate #15');
  });

  it('answers risk questions inside a week with the risk cluster CTA instead of a cut candidate', async () => {
    const graph = createFleetGraph();
    const runtime = createFleetGraphRuntime({
      now: () => new Date('2026-03-20T12:00:00.000Z'),
    });

    const result = await graph.invoke(
      {
        runId: 'issue-surface-risk-context',
        mode: 'on_demand',
        triggerType: 'user_invoke',
        workspaceId: 'workspace-1',
        actor: {
          id: 'user-1',
          kind: 'user',
          role: 'pm',
        },
        activeView: null,
        contextEntity: null,
        prompt: {
          question: 'What is the risk inside Week 2?',
          pageContext: {
            kind: 'issue_surface',
            route: '/documents/program-1/issues',
            title: 'API Platform Issues',
            summary:
              'API Platform shows risk building inside Week 2, where the visible issue mix has shifted toward work that is not started or still stale.',
            emptyState: false,
            metrics: [
              { label: 'Visible issues', value: '8' },
              { label: 'Not started', value: '4' },
              { label: 'Stalled active', value: '1' },
              { label: 'Blocked issues', value: '1' },
              { label: 'Risk cluster', value: 'Week 2' },
            ],
            items: [
              {
                label: '#15 Explore stretch improvements',
                detail:
                  'Cut candidate • State: Backlog • Week: Week 2 • Business value: 24/100 • Not started and safer to move out than the active or higher-value work on this tab',
                route: '/documents/issue-15',
              },
              {
                label: 'Week 2',
                detail: '2 open issues • 1 issue active • 1 issue not started',
                route: '/documents/week-2/issues',
              },
            ],
            actions: [
              {
                label: 'Review cut candidate #15',
                route: '/documents/issue-15',
                intent: 'prioritize',
                reason:
                  '#15 is not started yet. Business value 24/100. Safer to move out than the active or higher-value work on this tab.',
              },
              {
                label: 'Open risk cluster Week 2',
                route: '/documents/week-2/issues',
                intent: 'prioritize',
                reason:
                  'Week 2 holds the current risk cluster. 4 issues are not started and 1 issue is stalled.',
              },
            ],
          },
        },
        trace: {
          runName: 'fleetgraph-issue-surface-risk-test',
          tags: ['fleetgraph', 'test', 'issue-surface', 'risk'],
        },
      } satisfies FleetGraphRunInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: 'issue-surface-risk-context',
      })
    );

    expect(result.status).toBe('completed');
    expect(result.reasoning?.answerMode).toBe('execution');
    expect(result.reasoning?.summary).toContain('Week 2 is the clearest risk cluster on this tab');
    expect(result.reasoning?.recommendedNextStep).toContain('Open risk cluster Week 2');
    expect(result.reasoning?.recommendedNextStep).not.toContain('Review cut candidate #15');
  });
});
