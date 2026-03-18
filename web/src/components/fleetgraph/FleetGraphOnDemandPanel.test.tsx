import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetGraphActiveViewContext, FleetGraphOnDemandResponse } from '@ship/shared';
import { FleetGraphOnDemandPanel } from './FleetGraphOnDemandPanel';

const mockUseFleetGraphActiveView = vi.fn();
const mockInvokeFleetGraphOnDemand = vi.fn();
const mockResumeFleetGraphOnDemand = vi.fn();

vi.mock('@/hooks/useFleetGraphActiveView', () => ({
  useFleetGraphActiveView: () => mockUseFleetGraphActiveView(),
}));

vi.mock('@/lib/fleetgraph', () => ({
  invokeFleetGraphOnDemand: (request: unknown) => mockInvokeFleetGraphOnDemand(request),
  resumeFleetGraphOnDemand: (request: unknown) => mockResumeFleetGraphOnDemand(request),
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

const baseResponse: FleetGraphOnDemandResponse = {
  threadId: 'thread-1',
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
  reasoning: {
    summary:
      'FleetGraph sees clear execution drift because all work is still untouched and no standup has been logged.',
    evidence: ['Completed issues: 0 of 6.', 'Standups logged: 0.'],
    whyNow:
      'You are already on the issues tab for this sprint, so the current execution risk is directly relevant.',
    recommendedNextStep:
      'Ask for a same-day owner update, post a standup, and either move work in progress or reduce scope.',
    confidence: 'high',
  },
  proposedAction: null,
  pendingApproval: null,
  actionResult: null,
  attempts: {
    reasoning: 1,
    resume: 0,
    actionExecution: 0,
  },
  guard: {
    maxTransitions: 24,
    transitionCount: 7,
    maxRetries: 2,
    maxResumeCount: 2,
    maxReasoningAttempts: 2,
    circuitBreakerOpen: false,
    lastTripReason: null,
  },
  timing: {
    startedAt: '2026-03-17T12:00:00.000Z',
    lastNodeAt: '2026-03-17T12:00:01.000Z',
    deadlineAt: '2026-03-17T12:02:00.000Z',
  },
  reasoningSource: 'deterministic',
  suppressionReason: null,
  terminalOutcome: 'finding_only',
  error: null,
  lastNode: 'proposeSprintAction',
  nodeHistory: [],
  telemetry: {
    langsmithRunId: null,
    langsmithRunUrl: null,
    langsmithShareUrl: null,
    braintrustSpanId: null,
  },
  trace: {
    runName: 'fleetgraph-on-demand',
    tags: ['fleetgraph', 'on-demand', 'week', 'document'],
  },
};

describe('FleetGraphOnDemandPanel', () => {
  beforeEach(() => {
    mockUseFleetGraphActiveView.mockReset();
    mockInvokeFleetGraphOnDemand.mockReset();
    mockResumeFleetGraphOnDemand.mockReset();
    window.localStorage.clear();
  });

  it('opens the drawer, sends a typed question, and renders the returned answer', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockInvokeFleetGraphOnDemand.mockResolvedValue(baseResponse);

    render(<FleetGraphOnDemandPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Why is this sprint at risk?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    await waitFor(() => {
      expect(mockInvokeFleetGraphOnDemand).toHaveBeenCalledWith({
        active_view: activeView,
        question: 'Why is this sprint at risk?',
      });
    });

    expect(await screen.findByText('Grounded answer')).toBeInTheDocument();
    expect(screen.getAllByText(/FleetGraph sees clear execution drift/).length).toBeGreaterThan(0);
    expect(screen.getByText('Recommended next step')).toBeInTheDocument();
    expect(screen.getByText('What FleetGraph saw')).toBeInTheDocument();
    expect(screen.getByText(/API Platform - Core Features/)).toBeInTheDocument();
  });

  it('shows the wait state when page context is not available', () => {
    mockUseFleetGraphActiveView.mockReturnValue(null);

    render(<FleetGraphOnDemandPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));

    expect(
      screen.getAllByText('Open a sprint, project, or My Week view to use FleetGraph here.')
        .length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('supports HITL decisions from the drawer', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      status: 'waiting_on_human',
      stage: 'waiting_on_human',
      terminalOutcome: 'waiting_on_human',
      proposedAction: {
        type: 'draft_follow_up_comment',
        targetId: activeView.entity.id,
        summary: 'Draft a same-day status follow-up for Week 14.',
        rationale: 'No standup has been logged and work has not started.',
        draftComment: 'Can you post a same-day status update and confirm the next checkpoint?',
        targetRoute: activeView.route,
        fingerprint: 'follow-up-1',
      },
      pendingApproval: {
        actionType: 'draft_follow_up_comment',
        reason: 'Draft a same-day status follow-up for Week 14.',
        proposal: {
          type: 'draft_follow_up_comment',
          targetId: activeView.entity.id,
          summary: 'Draft a same-day status follow-up for Week 14.',
          rationale: 'No standup has been logged and work has not started.',
          draftComment: 'Can you post a same-day status update and confirm the next checkpoint?',
          targetRoute: activeView.route,
          fingerprint: 'follow-up-1',
        },
      },
    });
    mockResumeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      proposedAction: {
        type: 'draft_follow_up_comment',
        targetId: activeView.entity.id,
        summary: 'Draft a same-day status follow-up for Week 14.',
        rationale: 'No standup has been logged and work has not started.',
        draftComment: 'Can you post a same-day status update and confirm the next checkpoint?',
        targetRoute: activeView.route,
        fingerprint: 'follow-up-1',
      },
      pendingApproval: null,
      actionResult: {
        outcome: 'dismissed',
        summary: 'FleetGraph dismissed this draft action for the current sprint pattern.',
        note: null,
        snoozedUntil: null,
        executedCommentId: null,
      },
      stage: 'action_dismissed',
      terminalOutcome: 'suppressed',
    });

    render(<FleetGraphOnDemandPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'What should happen next?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    expect(await screen.findByText('Approve and post')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(mockResumeFleetGraphOnDemand).toHaveBeenCalledWith({
        thread_id: 'thread-1',
        decision: {
          outcome: 'dismiss',
          snooze_minutes: null,
        },
      });
    });

    expect(
      await screen.findByText('FleetGraph dismissed this draft action for the current sprint pattern.')
    ).toBeInTheDocument();
  });
});
