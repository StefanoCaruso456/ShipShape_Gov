import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import type { MyWeekResponse } from '@/hooks/useMyWeekQuery';
import type { Issue } from '@/hooks/useIssuesQuery';
import type { Project } from '@/hooks/useProjectsQuery';
import { buildIssueSurfacePageContext, buildMyWeekPageContext } from './useFleetGraphPageContext';

const activeView: FleetGraphActiveViewContext = {
  entity: {
    id: 'person-1',
    type: 'person',
    sourceDocumentType: 'person',
  },
  surface: 'my_week',
  route: '/my-week?week_number=12',
  tab: null,
  projectId: null,
};

const baseMyWeek: MyWeekResponse = {
  person_id: 'person-1',
  person_name: 'Stefano Caruso',
  week: {
    week_number: 12,
    current_week_number: 12,
    start_date: '2026-03-16',
    end_date: '2026-03-22',
    is_current: true,
  },
  plan: {
    id: 'plan-1',
    title: 'Week 12 Plan',
    submitted_at: '2026-03-16T12:00:00.000Z',
    items: [{ text: 'Ship FleetGraph depth improvements', checked: false }],
  },
  retro: {
    id: 'retro-1',
    title: 'Week 12 Retro',
    submitted_at: '2026-03-20T12:00:00.000Z',
    items: [{ text: 'Watch comment writeback quality', checked: false }],
  },
  previous_retro: {
    id: 'retro-0',
    title: 'Week 11 Retro',
    submitted_at: '2026-03-13T12:00:00.000Z',
    week_number: 11,
  },
  standups: [
    {
      date: '2026-03-16',
      day: 'Monday',
      standup: {
        id: 'standup-1',
        title: 'Mon update',
        date: '2026-03-16',
        created_at: '2026-03-16T12:00:00.000Z',
      },
    },
    {
      date: '2026-03-17',
      day: 'Tuesday',
      standup: {
        id: 'standup-2',
        title: 'Tue update',
        date: '2026-03-17',
        created_at: '2026-03-17T12:00:00.000Z',
      },
    },
    {
      date: '2026-03-18',
      day: 'Wednesday',
      standup: {
        id: 'standup-3',
        title: 'Wed update',
        date: '2026-03-18',
        created_at: '2026-03-18T12:00:00.000Z',
      },
    },
    {
      date: '2026-03-19',
      day: 'Thursday',
      standup: {
        id: 'standup-4',
        title: 'Thu update',
        date: '2026-03-19',
        created_at: '2026-03-19T12:00:00.000Z',
      },
    },
    {
      date: '2026-03-20',
      day: 'Friday',
      standup: {
        id: 'standup-5',
        title: 'Fri update',
        date: '2026-03-20',
        created_at: '2026-03-20T12:00:00.000Z',
      },
    },
    { date: '2026-03-21', day: 'Saturday', standup: null },
    { date: '2026-03-22', day: 'Sunday', standup: null },
  ],
  projects: [
    {
      id: 'project-1',
      title: 'Core API',
      program_name: 'API Platform',
      sprint_id: 'sprint-1',
      sprint_title: 'Week 12 - Core API',
      issue_counts: {
        total: 3,
        completed: 0,
        in_progress: 0,
        in_review: 0,
        not_started: 3,
        cancelled: 0,
      },
      activity: {
        updated_issue_count: 0,
        active_days: 0,
        last_issue_update_at: '2026-03-15T10:00:00.000Z',
      },
    },
    {
      id: 'project-2',
      title: 'Docs Cleanup',
      program_name: 'Platform UX',
      sprint_id: 'sprint-2',
      sprint_title: 'Week 12 - Docs Cleanup',
      issue_counts: {
        total: 4,
        completed: 1,
        in_progress: 1,
        in_review: 0,
        not_started: 2,
        cancelled: 0,
      },
      activity: {
        updated_issue_count: 2,
        active_days: 2,
        last_issue_update_at: '2026-03-20T09:00:00.000Z',
      },
    },
  ],
};

const issueSurfaceIssues: Issue[] = [
  {
    id: 'issue-1',
    title: 'Implement core workflow',
    state: 'in_progress',
    priority: 'high',
    ticket_number: 12,
    display_id: '#12',
    assignee_id: 'user-1',
    assignee_name: 'stefano caruso',
    estimate: 3,
    belongs_to: [
      { id: 'program-1', type: 'program', title: 'API Platform' },
      { id: 'project-1', type: 'project', title: 'Core Features' },
      { id: 'week-3', type: 'sprint', title: 'Week 3' },
    ],
    source: 'internal',
    rejection_reason: null,
    updated_at: '2026-03-20T02:00:00.000Z',
  },
  {
    id: 'issue-2',
    title: 'Add validation and edge-case handling',
    state: 'todo',
    priority: 'medium',
    ticket_number: 13,
    display_id: '#13',
    assignee_id: 'user-1',
    assignee_name: 'stefano caruso',
    estimate: 2,
    belongs_to: [
      { id: 'program-1', type: 'program', title: 'API Platform' },
      { id: 'project-1', type: 'project', title: 'Core Features' },
      { id: 'week-3', type: 'sprint', title: 'Week 3' },
    ],
    source: 'internal',
    rejection_reason: null,
    updated_at: '2026-03-20T02:00:00.000Z',
  },
  {
    id: 'issue-3',
    title: 'Expand test coverage',
    state: 'todo',
    priority: 'medium',
    ticket_number: 14,
    display_id: '#14',
    assignee_id: 'user-1',
    assignee_name: 'stefano caruso',
    estimate: 2,
    belongs_to: [
      { id: 'program-1', type: 'program', title: 'API Platform' },
      { id: 'project-2', type: 'project', title: 'Performance' },
      { id: 'week-3', type: 'sprint', title: 'Week 3' },
    ],
    source: 'internal',
    rejection_reason: null,
    updated_at: '2026-03-16T02:00:00.000Z',
  },
  {
    id: 'issue-4',
    title: 'Explore stretch improvements',
    state: 'backlog',
    priority: 'low',
    ticket_number: 15,
    display_id: '#15',
    assignee_id: 'user-1',
    assignee_name: 'stefano caruso',
    estimate: 1,
    belongs_to: [
      { id: 'program-1', type: 'program', title: 'API Platform' },
      { id: 'project-2', type: 'project', title: 'Performance' },
    ],
    source: 'internal',
    rejection_reason: null,
    updated_at: '2026-03-20T02:00:00.000Z',
  },
  {
    id: 'issue-5',
    title: 'Define acceptance criteria',
    state: 'done',
    priority: 'high',
    ticket_number: 11,
    display_id: '#11',
    assignee_id: 'user-1',
    assignee_name: 'stefano caruso',
    estimate: 1,
    belongs_to: [
      { id: 'program-1', type: 'program', title: 'API Platform' },
      { id: 'project-1', type: 'project', title: 'Core Features' },
      { id: 'week-1', type: 'sprint', title: 'Week 1' },
    ],
    source: 'internal',
    rejection_reason: null,
    updated_at: '2026-03-20T02:00:00.000Z',
  },
];

const issueSurfaceProjects: Project[] = [
  {
    id: 'project-1',
    title: 'Core Features',
    impact: 4,
    confidence: 4,
    ease: 3,
    ice_score: 48,
    roi: 3,
    retention: 3,
    acquisition: 2,
    growth: 3,
    business_value_score: 56,
    color: '#6366f1',
    emoji: null,
    program_id: 'program-1',
    owner: {
      id: 'user-1',
      name: 'stefano caruso',
      email: 'stefano@example.com',
    },
    owner_id: 'user-1',
    accountable_id: null,
    consulted_ids: [],
    informed_ids: [],
    sprint_count: 2,
    issue_count: 3,
    inferred_status: 'active',
    archived_at: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    is_complete: true,
    missing_fields: [],
    has_design_review: null,
    design_review_notes: null,
    converted_from_id: null,
  },
  {
    id: 'project-2',
    title: 'Performance',
    impact: 5,
    confidence: 4,
    ease: 3,
    ice_score: 60,
    roi: 5,
    retention: 4,
    acquisition: 3,
    growth: 5,
    business_value_score: 87,
    color: '#0ea5e9',
    emoji: null,
    program_id: 'program-1',
    owner: {
      id: 'user-1',
      name: 'stefano caruso',
      email: 'stefano@example.com',
    },
    owner_id: 'user-1',
    accountable_id: null,
    consulted_ids: [],
    informed_ids: [],
    sprint_count: 1,
    issue_count: 2,
    inferred_status: 'active',
    archived_at: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    is_complete: true,
    missing_fields: [],
    has_design_review: null,
    design_review_notes: null,
    converted_from_id: null,
  },
];

describe('buildMyWeekPageContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces top attention projects with sprint routes and execution detail', () => {
    const context = buildMyWeekPageContext('/my-week?week_number=12', activeView, baseMyWeek);

    expect(context.summary).toContain('My Week covers 2 assigned projects.');
    expect(context.summary).toContain('Core API has 3 tracked issues and none are started yet.');
    expect(context.metrics).toEqual(
      expect.arrayContaining([
        { label: 'Project signals', value: '1/2 flagged' },
      ])
    );
    expect(context.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Core API',
          route: '/documents/sprint-1/issues',
        }),
      ])
    );
    expect(context.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Open Core API sprint',
          route: '/documents/sprint-1/issues',
        }),
      ])
    );
  });

  it('falls back to the project document when sprint scope is not yet linked', () => {
    const futureWeek: MyWeekResponse = {
      ...baseMyWeek,
      week: {
        week_number: 13,
        current_week_number: 12,
        start_date: '2026-03-23',
        end_date: '2026-03-29',
        is_current: false,
      },
      projects: [
        {
          ...baseMyWeek.projects[0],
          sprint_id: null,
          sprint_title: null,
          issue_counts: {
            total: 0,
            completed: 0,
            in_progress: 0,
            in_review: 0,
            not_started: 0,
            cancelled: 0,
          },
          activity: {
            updated_issue_count: 0,
            active_days: 0,
            last_issue_update_at: null,
          },
        },
      ],
    };

    const context = buildMyWeekPageContext('/my-week?week_number=13', activeView, futureWeek);

    expect(context.summary).toContain('Core API is assigned for Week 13, but no sprint issues are linked yet.');
    expect(context.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Core API',
          route: '/documents/project-1',
        }),
      ])
    );
    expect(context.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Open Core API',
          route: '/documents/project-1',
          intent: 'inspect',
          reason: expect.stringContaining('Program: API Platform'),
        }),
      ])
    );
  });
});

describe('buildIssueSurfacePageContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds issue-surface execution context from visible issue rows', () => {
    const context = buildIssueSurfacePageContext(
      '/documents/program-1/issues',
      {
        type: 'program',
        id: 'program-1',
        title: 'API Platform',
      },
      issueSurfaceIssues,
      issueSurfaceProjects
    );

    expect(context.kind).toBe('issue_surface');
    expect(context.summary).toContain('API Platform has visible delivery risk from stale work.');
    expect(context.metrics).toEqual(
      expect.arrayContaining([
        { label: 'Visible issues', value: '5' },
        { label: 'Not started', value: '3' },
        { label: 'Stale open', value: '1' },
        { label: 'Risk cluster', value: 'Week 3' },
        { label: 'Highest impact issue', value: '#14' },
        { label: 'Highest impact project', value: 'Performance' },
        { label: 'Business value', value: '87/100' },
      ])
    );
    expect(context.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '#14 Expand test coverage',
          route: '/documents/issue-3',
        }),
        expect.objectContaining({
          label: 'Week 3',
          route: '/documents/week-3/issues',
        }),
      ])
    );
    expect(context.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Open highest-impact #14',
          route: '/documents/issue-3',
          intent: 'prioritize',
          reason: expect.stringContaining('Business value 87/100'),
        }),
        expect.objectContaining({
          label: 'Open risk cluster Week 3',
          route: '/documents/week-3/issues',
          intent: 'prioritize',
          reason: expect.stringContaining('holds 3 open issues'),
        }),
      ])
    );
  });
});
