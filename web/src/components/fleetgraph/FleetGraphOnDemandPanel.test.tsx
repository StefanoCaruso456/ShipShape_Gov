import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FleetGraphActiveViewContext, FleetGraphOnDemandResponse } from '@ship/shared';
import { FleetGraphOnDemandPanel } from './FleetGraphOnDemandPanel';

const mockUseFleetGraphActiveView = vi.fn();
const mockInvokeFleetGraphOnDemand = vi.fn();

vi.mock('@/hooks/useFleetGraphActiveView', () => ({
  useFleetGraphActiveView: () => mockUseFleetGraphActiveView(),
}));

vi.mock('@/lib/fleetgraph', () => ({
  invokeFleetGraphOnDemand: (request: unknown) => mockInvokeFleetGraphOnDemand(request),
}));

const activeView: FleetGraphActiveViewContext = {
  entity: {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'week',
    sourceDocumentType: 'sprint',
  },
  surface: 'document',
  route: '/documents/11111111-1111-1111-1111-111111111111/issues',
  tab: 'issues',
  projectId: '22222222-2222-2222-2222-222222222222',
};

const response: FleetGraphOnDemandResponse = {
  status: 'completed',
  stage: 'completed',
  mode: 'on_demand',
  triggerType: 'user_invoke',
  activeView,
  expandedScope: {
    issueId: null,
    weekId: activeView.entity.id,
    projectId: activeView.projectId,
    programId: '33333333-3333-3333-3333-333333333333',
    personId: null,
  },
  fetched: {
    entity: {
      id: activeView.entity.id,
      title: 'Week 14',
      document_type: 'sprint',
    },
    supporting: {
      current: {
        id: activeView.entity.id,
        title: 'Week 14',
        document_type: 'sprint',
        program_id: '33333333-3333-3333-3333-333333333333',
        program_name: 'API Platform',
      },
    },
    activity: {
      days: [
        { date: '2026-03-16', count: 0 },
        { date: '2026-03-17', count: 7 },
      ],
    },
    accountability: {
      project: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'API Platform - Core Features',
      },
      program: {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'API Platform',
      },
    },
    people: {
      owner: null,
      accountableId: null,
    },
  },
  derivedSignals: {
    severity: 'action',
    reasons: [
      'No standups have been logged for this active sprint yet.',
      'All sprint issues are still incomplete and none are marked in progress.',
    ],
    summary:
      'All sprint issues are still incomplete and none are marked in progress. No standups have been logged for this active sprint yet.',
    shouldSurface: true,
    signals: [
      {
        kind: 'missing_standup',
        severity: 'warning',
        summary: 'No standups have been logged for this active sprint yet.',
        evidence: ['Standup count is 0.', 'Sprint has 6 tracked issues.'],
        dedupeKey: 'week-14:missing_standup',
      },
      {
        kind: 'work_not_started',
        severity: 'action',
        summary: 'All sprint issues are still incomplete and none are marked in progress.',
        evidence: ['Incomplete issues: 6 of 6.', 'Completed issues: 0.'],
        dedupeKey: 'week-14:work_not_started',
      },
    ],
    metrics: {
      totalIssues: 6,
      completedIssues: 0,
      inProgressIssues: 0,
      incompleteIssues: 6,
      cancelledIssues: 0,
      standupCount: 0,
      recentActivityCount: 7,
      recentActiveDays: 1,
      completionRate: 0,
    },
  },
  finding: {
    summary:
      'All sprint issues are still incomplete and none are marked in progress. No standups have been logged for this active sprint yet.',
    severity: 'action',
  },
  error: null,
  trace: {
    runName: 'fleetgraph-on-demand',
    tags: ['fleetgraph', 'on-demand', 'week', 'document'],
  },
};

describe('FleetGraphOnDemandPanel', () => {
  beforeEach(() => {
    mockUseFleetGraphActiveView.mockReset();
    mockInvokeFleetGraphOnDemand.mockReset();
  });

  it('invokes FleetGraph for the current tab and renders the resulting evidence', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockInvokeFleetGraphOnDemand.mockResolvedValue(response);

    render(<FleetGraphOnDemandPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Why is this sprint at risk?' }));

    await waitFor(() => {
      expect(mockInvokeFleetGraphOnDemand).toHaveBeenCalledWith({
        active_view: activeView,
        question: 'Why is this sprint at risk?',
      });
    });

    expect(await screen.findByText('FleetGraph answer')).toBeInTheDocument();
    expect(screen.getAllByText(/All sprint issues are still incomplete/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs action').length).toBeGreaterThan(0);
    expect(screen.getByText(/API Platform - Core Features/)).toBeInTheDocument();
    expect(screen.getByText('Standups')).toBeInTheDocument();
    expect(screen.getByText('What FleetGraph saw')).toBeInTheDocument();
  });

  it('shows a context wait state when no active view is available yet', () => {
    mockUseFleetGraphActiveView.mockReturnValue(null);

    render(<FleetGraphOnDemandPanel />);

    expect(
      screen.getByText('FleetGraph is waiting for page context before it can analyze this sprint.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Why is this sprint at risk?' })).toBeDisabled();
  });
});
