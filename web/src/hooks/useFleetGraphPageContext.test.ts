import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import type { MyWeekResponse } from '@/hooks/useMyWeekQuery';
import { buildMyWeekPageContext } from './useFleetGraphPageContext';

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
        }),
      ])
    );
  });
});
