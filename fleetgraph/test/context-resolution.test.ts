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
                label: 'Open Week 3',
                route: '/documents/week-3/issues',
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
    expect(result.reasoning?.whyNow).toContain('visible issues on the current tab');
    expect(result.reasoning?.recommendedNextStep).toContain('Open Week 3');
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
              },
              {
                label: 'Open Week 3',
                route: '/documents/week-3/issues',
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
});
