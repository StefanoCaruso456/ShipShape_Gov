import { describe, expect, it } from 'vitest';
import {
  buildFleetGraphActiveViewContext,
  buildFleetGraphDashboardActiveViewContext,
  buildFleetGraphMyWeekActiveViewContext,
  buildFleetGraphProactiveFindingToastCopy,
  extractFleetGraphProjectIdFromDocument,
  resolveFleetGraphActiveView,
} from './fleetgraph';
import type { FleetGraphProactiveFinding } from '@ship/shared';

describe('buildFleetGraphActiveViewContext', () => {
  it('maps sprint documents to a week active-view entity', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '11111111-1111-1111-1111-111111111111',
      currentDocumentType: 'sprint',
      currentDocumentProjectId: '22222222-2222-2222-2222-222222222222',
      currentDocumentTab: 'issues',
      pathname: '/documents/11111111-1111-1111-1111-111111111111/issues',
    });

    expect(activeView).toEqual({
      entity: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'document',
      route: '/documents/11111111-1111-1111-1111-111111111111/issues',
      tab: 'issues',
      projectId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('maps weekly plan documents back to the owning project scope when project context is present', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '33333333-3333-3333-3333-333333333333',
      currentDocumentType: 'weekly_plan',
      currentDocumentProjectId: '22222222-2222-2222-2222-222222222222',
      currentDocumentTab: null,
      pathname: '/documents/33333333-3333-3333-3333-333333333333',
    });

    expect(activeView).toEqual({
      entity: {
        id: '22222222-2222-2222-2222-222222222222',
        type: 'project',
        sourceDocumentType: 'weekly_plan',
      },
      surface: 'document',
      route: '/documents/33333333-3333-3333-3333-333333333333',
      tab: null,
      projectId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('returns null for document types that do not yet map into FleetGraph MVP context', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '33333333-3333-3333-3333-333333333333',
      currentDocumentType: 'weekly_plan',
      currentDocumentProjectId: null,
      currentDocumentTab: null,
      pathname: '/documents/33333333-3333-3333-3333-333333333333',
    });

    expect(activeView).toBeNull();
  });

  it('maps My Week to a person-scoped active view', () => {
    const activeView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
    });

    expect(activeView).toEqual({
      entity: {
        id: '44444444-4444-4444-4444-444444444444',
        type: 'person',
        sourceDocumentType: 'person',
      },
      surface: 'my_week',
      route: '/my-week?week_number=14',
      tab: null,
      projectId: null,
    });
  });

  it('preserves a narrowed project when My Week already has a single project in scope', () => {
    const activeView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
      projectId: '55555555-5555-5555-5555-555555555555',
    });

    expect(activeView).toEqual({
      entity: {
        id: '44444444-4444-4444-4444-444444444444',
        type: 'person',
        sourceDocumentType: 'person',
      },
      surface: 'my_week',
      route: '/my-week?week_number=14',
      tab: null,
      projectId: '55555555-5555-5555-5555-555555555555',
    });
  });
});

describe('extractFleetGraphProjectIdFromDocument', () => {
  it('prefers the real project association when a weekly plan has belongs_to context', () => {
    expect(
      extractFleetGraphProjectIdFromDocument({
        document_type: 'weekly_plan',
        properties: {},
        belongs_to: [
          { id: 'project-from-association', type: 'project' },
          { id: 'program-1', type: 'program' },
        ],
      })
    ).toBe('project-from-association');
  });

  it('falls back to the legacy weekly plan project_id when associations are missing', () => {
    expect(
      extractFleetGraphProjectIdFromDocument({
        document_type: 'weekly_plan',
        properties: { project_id: 'legacy-project-id' },
        belongs_to: [],
      })
    ).toBe('legacy-project-id');
  });

  it('returns null when neither associations nor legacy project context exist', () => {
    expect(
      extractFleetGraphProjectIdFromDocument({
        document_type: 'weekly_plan',
        properties: {},
        belongs_to: [],
      })
    ).toBeNull();
  });
});

describe('resolveFleetGraphActiveView', () => {
  it('keeps a dashboard current view when the route still matches', () => {
    const currentView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
    });

    const resolved = resolveFleetGraphActiveView({
      currentView,
      currentRoute: '/my-week?week_number=14',
      currentDocumentId: '11111111-1111-1111-1111-111111111111',
      currentDocumentType: 'project',
      currentDocumentProjectId: '11111111-1111-1111-1111-111111111111',
      currentDocumentTab: null,
    });

    expect(resolved).toEqual(currentView);
  });

  it('falls back to document context when a stale dashboard view no longer matches the route', () => {
    const currentView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
    });

    const resolved = resolveFleetGraphActiveView({
      currentView,
      currentRoute: '/documents/33333333-3333-3333-3333-333333333333',
      currentDocumentId: '33333333-3333-3333-3333-333333333333',
      currentDocumentType: 'project',
      currentDocumentProjectId: '33333333-3333-3333-3333-333333333333',
      currentDocumentTab: 'overview',
    });

    expect(resolved).toEqual({
      entity: {
        id: '33333333-3333-3333-3333-333333333333',
        type: 'project',
        sourceDocumentType: 'project',
      },
      surface: 'document',
      route: '/documents/33333333-3333-3333-3333-333333333333',
      tab: 'overview',
      projectId: '33333333-3333-3333-3333-333333333333',
    });
  });
});

describe('buildFleetGraphDashboardActiveViewContext', () => {
  it('prefers an overdue dashboard action item and maps it back to the sprint tab that needs attention', () => {
    const activeView = buildFleetGraphDashboardActiveViewContext({
      pathname: '/dashboard?view=my-work',
      view: 'my-work',
      activeWeeks: [
        {
          id: 'week-1',
          name: 'Week 12',
          sprint_number: 12,
          status: 'active',
          owner: null,
          issue_count: 4,
          completed_count: 1,
          started_count: 2,
          program_id: 'program-1',
          program_name: 'Core Platform',
          days_remaining: 4,
        },
      ],
      actionItems: [
        {
          id: 'retro-1',
          type: 'retro',
          sprint_id: 'week-overdue',
          sprint_title: 'Week 11',
          program_id: 'program-1',
          program_name: 'Core Platform',
          sprint_number: 11,
          urgency: 'overdue',
          days_until_due: -2,
          message: 'Retro is overdue',
        },
      ],
      projects: [],
    });

    expect(activeView).toEqual({
      entity: {
        id: 'week-overdue',
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'dashboard',
      route: '/dashboard?view=my-work',
      tab: 'retro',
      projectId: null,
    });
  });

  it('falls back to the most urgent active week when there is no overdue action item', () => {
    const activeView = buildFleetGraphDashboardActiveViewContext({
      pathname: '/dashboard?view=overview',
      view: 'overview',
      activeWeeks: [
        {
          id: 'week-later',
          name: 'Week 13',
          sprint_number: 13,
          status: 'active',
          owner: null,
          issue_count: 5,
          completed_count: 0,
          started_count: 1,
          program_id: 'program-1',
          program_name: 'Core Platform',
          days_remaining: 5,
        },
        {
          id: 'week-soon',
          name: 'Week 12',
          sprint_number: 12,
          status: 'active',
          owner: null,
          issue_count: 6,
          completed_count: 2,
          started_count: 3,
          program_id: 'program-2',
          program_name: 'Growth',
          days_remaining: 2,
        },
      ],
      actionItems: [],
      projects: [],
    });

    expect(activeView).toEqual({
      entity: {
        id: 'week-soon',
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'dashboard',
      route: '/dashboard?view=overview',
      tab: 'issues',
      projectId: null,
    });
  });

  it('falls back to the strongest active project when there is no focused week to inspect', () => {
    const activeView = buildFleetGraphDashboardActiveViewContext({
      pathname: '/dashboard?view=overview',
      view: 'overview',
      activeWeeks: [],
      actionItems: [],
      projects: [
        {
          id: 'project-low',
          title: 'Backlog cleanup',
          impact: null,
          confidence: null,
          ease: null,
          ice_score: 24,
          roi: null,
          retention: null,
          acquisition: null,
          growth: null,
          business_value_score: 40,
          color: '#000000',
          emoji: null,
          program_id: null,
          owner: null,
          sprint_count: 1,
          issue_count: 3,
          inferred_status: 'active',
          archived_at: null,
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-21T00:00:00.000Z',
          is_complete: null,
          missing_fields: [],
        },
        {
          id: 'project-high',
          title: 'Release planning',
          impact: null,
          confidence: null,
          ease: null,
          ice_score: 80,
          roi: null,
          retention: null,
          acquisition: null,
          growth: null,
          business_value_score: 92,
          color: '#111111',
          emoji: null,
          program_id: null,
          owner: null,
          sprint_count: 2,
          issue_count: 7,
          inferred_status: 'active',
          archived_at: null,
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-21T00:00:00.000Z',
          is_complete: null,
          missing_fields: [],
        },
      ],
    });

    expect(activeView).toEqual({
      entity: {
        id: 'project-high',
        type: 'project',
        sourceDocumentType: 'project',
      },
      surface: 'dashboard',
      route: '/dashboard?view=overview',
      tab: 'issues',
      projectId: 'project-high',
    });
  });

  it('returns null when the dashboard has no actionable focus yet', () => {
    expect(buildFleetGraphDashboardActiveViewContext({
      pathname: '/dashboard?view=my-work',
      view: 'my-work',
      activeWeeks: [],
      actionItems: [],
      projects: [],
    })).toBeNull();
  });
});

describe('buildFleetGraphProactiveFindingToastCopy', () => {
  it('uses severity-based copy and an issue-specific action label for issue findings', () => {
    const finding: FleetGraphProactiveFinding = {
      id: 'finding-1',
      workspaceId: 'workspace-1',
      weekId: 'week-1',
      projectId: 'project-1',
      programId: null,
      title: 'Week 12',
      summary: 'A blocker was logged on a critical issue.',
      severity: 'warning',
      route: '/documents/issue-1',
      surface: 'issue',
      tab: null,
      audienceRole: 'issue_assignee',
      audienceScope: 'individual',
      deliverySource: 'event',
      deliveryReason: 'test fixture',
      signalKinds: ['issue_blocker_logged'],
      lastDetectedAt: '2026-03-22T10:00:00.000Z',
      lastNotifiedAt: '2026-03-22T10:00:00.000Z',
    };

    expect(buildFleetGraphProactiveFindingToastCopy(finding)).toEqual({
      message: 'FleetGraph noticed Week 12: A blocker was logged on a critical issue.',
      actionLabel: 'Open Issue',
    });
  });

  it('uses tab-specific action labels for review surfaces', () => {
    const finding: FleetGraphProactiveFinding = {
      id: 'finding-2',
      workspaceId: 'workspace-1',
      weekId: 'week-2',
      projectId: 'project-2',
      programId: 'program-1',
      title: 'Week 13',
      summary: 'Review follow-up is overdue.',
      severity: 'action',
      route: '/documents/week-2/review',
      surface: 'document',
      tab: 'review',
      audienceRole: 'manager',
      audienceScope: 'individual',
      deliverySource: 'event',
      deliveryReason: 'test fixture',
      signalKinds: ['changes_requested_review'],
      lastDetectedAt: '2026-03-22T10:00:00.000Z',
      lastNotifiedAt: '2026-03-22T10:00:00.000Z',
    };

    expect(buildFleetGraphProactiveFindingToastCopy(finding)).toEqual({
      message: 'FleetGraph flagged Week 13: Review follow-up is overdue.',
      actionLabel: 'Open Review',
    });
  });

  it('uses persona-aware copy when a work persona is provided', () => {
    const finding: FleetGraphProactiveFinding = {
      id: 'finding-3',
      workspaceId: 'workspace-1',
      weekId: 'week-3',
      projectId: 'project-3',
      programId: null,
      title: 'Week 14',
      summary: 'An issue was reopened after completion.',
      severity: 'warning',
      route: '/documents/issue-3',
      surface: 'issue',
      tab: null,
      audienceRole: 'issue_assignee',
      audienceScope: 'individual',
      deliverySource: 'event',
      deliveryReason: 'test fixture',
      signalKinds: ['issue_reopened_after_done'],
      lastDetectedAt: '2026-03-22T10:00:00.000Z',
      lastNotifiedAt: '2026-03-22T10:00:00.000Z',
    };

    expect(buildFleetGraphProactiveFindingToastCopy(finding, 'engineer')).toEqual({
      message: 'FleetGraph noticed engineering follow-up: An issue was reopened after completion.',
      actionLabel: 'Open Issue',
    });
  });
});
