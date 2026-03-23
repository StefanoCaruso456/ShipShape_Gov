import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type {
  FleetGraphActiveViewContext,
  FleetGraphOnDemandResponse,
  FleetGraphPageContext,
} from '@ship/shared';
import { FleetGraphOnDemandPanel } from './FleetGraphOnDemandPanel';

const mockUseFleetGraphActiveView = vi.fn();
const mockUseFleetGraphPageContext = vi.fn();
const mockInvokeFleetGraphOnDemand = vi.fn();
const mockResumeFleetGraphOnDemand = vi.fn();
const mockReportFleetGraphFeedback = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: {
      to: string;
      children: ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/hooks/useFleetGraphActiveView', () => ({
  useFleetGraphActiveView: () => mockUseFleetGraphActiveView(),
}));

vi.mock('@/hooks/useFleetGraphPageContext', () => ({
  useFleetGraphPageContext: () => mockUseFleetGraphPageContext(),
}));

vi.mock('@/lib/fleetgraph', () => ({
  invokeFleetGraphOnDemand: (request: unknown) => mockInvokeFleetGraphOnDemand(request),
  reportFleetGraphFeedback: (request: unknown) => mockReportFleetGraphFeedback(request),
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

const programsPageContext: FleetGraphPageContext = {
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
      route: '/documents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    },
  ],
};

const issueSurfacePageContext: FleetGraphPageContext = {
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
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <FleetGraphOnDemandPanel />
    </MemoryRouter>
  );
}

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
    answerMode: 'execution',
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
    maxToolCalls: 12,
    toolCallCount: 0,
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
  toolCalls: [],
  approvals: [],
  telemetry: {
    langsmithRunId: null,
    langsmithRunUrl: null,
    langsmithShareUrl: null,
    braintrustSpanId: null,
    totalLatencyMs: null,
    toolCallCount: 0,
    toolFailureCount: 0,
    totalToolLatencyMs: 0,
    approvalCount: 0,
    lastToolName: null,
    loopDetected: false,
  },
  trace: {
    runName: 'fleetgraph-on-demand',
    tags: ['fleetgraph', 'on-demand', 'week', 'document'],
    metadata: {
      schemaVersion: 'v1',
      runId: 'thread-1',
      threadId: 'thread-1',
      mode: 'on_demand',
      triggerType: 'user_invoke',
      workspaceId: 'workspace-1',
      actorId: 'user-1',
      actorKind: 'user',
      actorRole: 'pm',
      actorWorkPersona: null,
      activeViewSurface: 'document',
      activeViewRoute: '/documents/week-1/issues',
      activeViewTab: 'issues',
      activeEntityId: 'week-1',
      activeEntityType: 'week',
      activeEntitySourceDocumentType: 'sprint',
      contextEntityId: 'week-1',
      contextEntityType: 'week',
      issueId: null,
      weekId: 'week-1',
      projectId: 'project-1',
      programId: 'program-1',
      personId: null,
      questionSource: 'typed',
      questionTheme: 'risk',
      answerMode: 'execution',
      status: 'completed',
      stage: 'proposeSprintAction',
      terminalOutcome: 'finding_only',
      signalSeverity: 'warning',
      signalKinds: ['missing_standup'],
      reasoningSource: 'deterministic',
      pendingApproval: false,
      proposedActionType: 'draft_follow_up_comment',
      actionOutcome: null,
      suppressionReason: null,
      lastNode: 'proposeSprintAction',
      nodeCount: 0,
      toolCallCount: 0,
      approvalCount: 0,
    },
  },
};

describe('FleetGraphOnDemandPanel', () => {
  beforeEach(() => {
    mockUseFleetGraphActiveView.mockReset();
    mockUseFleetGraphPageContext.mockReset();
    mockInvokeFleetGraphOnDemand.mockReset();
    mockResumeFleetGraphOnDemand.mockReset();
    mockReportFleetGraphFeedback.mockReset();
    mockReportFleetGraphFeedback.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it('opens the drawer, sends a typed question, and renders the returned answer', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockUseFleetGraphPageContext.mockReturnValue(null);
    mockInvokeFleetGraphOnDemand.mockResolvedValue(baseResponse);

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Why is this sprint at risk?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    await waitFor(() => {
      expect(mockInvokeFleetGraphOnDemand).toHaveBeenCalledWith({
        active_view: activeView,
        page_context: null,
        question: 'Why is this sprint at risk?',
        question_source: 'typed',
      });
    });

    expect(await screen.findByText('Grounded execution guidance')).toBeInTheDocument();
    expect(screen.getAllByText('Needs action').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FleetGraph sees clear execution drift/).length).toBeGreaterThan(0);
    expect(screen.getByText('Recommended next step')).toBeInTheDocument();
    expect(screen.getByText('What FleetGraph saw')).toBeInTheDocument();
    expect(screen.getByText(/API Platform - Core Features/)).toBeInTheDocument();
    expect(screen.getByText('Suggested follow-up questions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Is the risk coming from scope, blockers, or capacity?' })
    ).toBeInTheDocument();
  });

  it('uses page context on non-sprint pages instead of showing an unavailable state', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(null);
    mockUseFleetGraphPageContext.mockReturnValue(programsPageContext);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      activeView: null,
      expandedScope: {
        issueId: null,
        weekId: null,
        projectId: null,
        programId: null,
        personId: null,
      },
      fetched: {
        entity: null,
        supporting: null,
        activity: null,
        accountability: null,
        people: null,
      },
      derivedSignals: {
        ...baseResponse.derivedSignals,
        severity: 'none',
        reasons: [
          'Visible issues are still mixed across triage, backlog, and todo.',
          'The current tab has not turned into a clean stable state yet.',
        ],
        summary:
          'API Platform does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet. 3 visible issues are still sitting in triage, backlog, or todo, led by Week 3.',
        shouldSurface: false,
        signals: [
          {
            kind: 'scope_growth',
            severity: 'warning',
            summary: 'Delivery risk is building in the current issue set.',
            evidence: ['Visible issues are still mixed.', 'No named blocker is present yet.'],
            dedupeKey: 'program-1:scope_growth',
          },
        ],
        metrics: {
          totalIssues: 5,
          completedIssues: 2,
          inProgressIssues: 1,
          incompleteIssues: 2,
          cancelledIssues: 0,
          standupCount: 0,
          recentActivityCount: 4,
          recentActiveDays: 2,
          completionRate: 40,
        },
      },
      finding: null,
      reasoning: {
        answerMode: 'launcher',
        summary: 'Programs shows 5 active programs in this workspace.',
        evidence: ['Active programs: 5', 'Programs with owner: 5'],
        whyNow:
          'This answer is grounded in the current page snapshot. FleetGraph is using this launcher surface to guide what to open next rather than score execution health from the list alone.',
        recommendedNextStep: 'Open the program that looks most active or least clear so you can inspect its projects, issues, and current sprint.',
        confidence: 'high',
      },
      reasoningSource: 'deterministic',
      terminalOutcome: 'quiet',
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.click(screen.getByRole('button', { name: 'Which project needs attention first?' }));

    await waitFor(() => {
      expect(mockInvokeFleetGraphOnDemand).toHaveBeenCalledWith({
        active_view: null,
        page_context: programsPageContext,
        question: 'Which project needs attention first?',
        question_source: 'starter_prompt',
      });
    });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(await screen.findByText('Programs shows 5 active programs in this workspace.')).toBeInTheDocument();
    expect(screen.getAllByText('Launcher guidance').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Best next surface').length).toBeGreaterThan(0);
    expect(screen.queryByText('Stable')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open API Platform' })).toHaveAttribute(
      'href',
      '/documents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    );
  });

  it('renders scoped issue-surface answers as execution guidance instead of generic page guidance', async () => {
    mockUseFleetGraphActiveView.mockReturnValue({
      ...activeView,
      entity: {
        id: 'program-1',
        type: 'program',
        sourceDocumentType: 'program',
      },
      route: '/documents/program-1/issues',
      tab: 'issues',
      projectId: null,
    });
    mockUseFleetGraphPageContext.mockReturnValue(issueSurfacePageContext);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      activeView: {
        ...activeView,
        entity: {
          id: 'program-1',
          type: 'program',
          sourceDocumentType: 'program',
        },
        route: '/documents/program-1/issues',
        tab: 'issues',
        projectId: null,
      },
      fetched: {
        entity: null,
        supporting: null,
        activity: null,
        accountability: null,
        people: null,
      },
      derivedSignals: {
        ...baseResponse.derivedSignals,
        severity: 'none',
        reasons: [],
        summary: null,
        shouldSurface: false,
        signals: [],
        metrics: {
          totalIssues: 0,
          completedIssues: 0,
          inProgressIssues: 0,
          incompleteIssues: 0,
          cancelledIssues: 0,
          standupCount: 0,
          recentActivityCount: 0,
          recentActiveDays: 0,
          completionRate: null,
        },
      },
      finding: null,
      reasoning: {
        answerMode: 'execution',
        summary:
          'API Platform does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet. 3 visible issues are still sitting in triage, backlog, or todo, led by Week 3.',
        evidence: [
          'Visible issues: 5',
          'Not started: 3',
          'Stale open: 1',
          'Risk cluster: Week 3',
        ],
        whyNow:
          'This answer is grounded in the visible issues on the current tab, including state mix, freshness, week grouping, and ownership in the worklist.',
        recommendedNextStep:
          'Open risk cluster Week 3. Week 3 holds 3 open issues with 2 issues still not started.',
        confidence: 'high',
      },
      reasoningSource: 'deterministic',
      terminalOutcome: 'quiet',
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    expect(screen.getByRole('button', { name: 'What, if anything, still needs triage on this tab?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Which issues are stale or stuck?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What, if anything, still needs triage on this tab?' }));

    expect(await screen.findByText('Grounded execution guidance')).toBeInTheDocument();
    expect(screen.getAllByText('Execution view').length).toBeGreaterThan(1);
    expect(
      screen.getByText(/does not show a named blocker on this issues surface/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Stable')).not.toBeInTheDocument();
    expect(screen.getByText('Recommended next step')).toBeInTheDocument();
    expect(screen.getByText('Best route in Ship')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open risk cluster Week 3' })).toHaveAttribute(
      'href',
      '/documents/week-3/issues'
    );
    expect(screen.getByText('Suggested follow-up questions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Which status cluster is carrying the most unfinished risk?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open highest-impact #14' })).toHaveAttribute(
      'href',
      '/documents/issue-3'
    );
    expect(screen.queryByText('Page guidance')).not.toBeInTheDocument();
  });

  it('promotes a cut candidate route for cut questions on issue surfaces', async () => {
    const cutContext: FleetGraphPageContext = {
      ...issueSurfacePageContext,
      items: [
        {
          label: '#15 Explore stretch improvements',
          detail:
            'Cut candidate • State: Backlog • Backlog • Business value: 24/100 • Not started and safer to move out than the active or higher-value work on this tab',
          route: '/documents/issue-15',
        },
      ],
      actions: [
        {
          label: 'Review cut candidate #15',
          route: '/documents/issue-15',
          intent: 'prioritize',
          reason:
            '#15 is not started yet. Business value 24/100. Safer to move out than the active or higher-value work on this tab. Keeps #14 protected.',
        },
        ...(issueSurfacePageContext.actions ?? []),
      ],
    };

    mockUseFleetGraphActiveView.mockReturnValue({
      ...activeView,
      entity: {
        id: 'program-1',
        type: 'program',
        sourceDocumentType: 'program',
      },
      route: '/documents/program-1/issues',
      tab: 'issues',
      projectId: null,
    });
    mockUseFleetGraphPageContext.mockReturnValue(cutContext);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      activeView: {
        ...activeView,
        entity: {
          id: 'program-1',
          type: 'program',
          sourceDocumentType: 'program',
        },
        route: '/documents/program-1/issues',
        tab: 'issues',
        projectId: null,
      },
      fetched: {
        entity: null,
        supporting: null,
        activity: null,
        accountability: null,
        people: null,
      },
      derivedSignals: {
        ...baseResponse.derivedSignals,
        severity: 'none',
        reasons: [],
        summary: null,
        shouldSurface: false,
        signals: [],
        metrics: {
          totalIssues: 0,
          completedIssues: 0,
          inProgressIssues: 0,
          incompleteIssues: 0,
          cancelledIssues: 0,
          standupCount: 0,
          recentActivityCount: 0,
          recentActiveDays: 0,
          completionRate: null,
        },
      },
      finding: null,
      reasoning: {
        answerMode: 'execution',
        summary:
          'If you need to cut scope, start with #15 Explore stretch improvements. It is not started and lower value than #14, so it is safer to move out first.',
        evidence: [
          'Not started: 3',
          'Highest impact issue: #14',
          '#15 Explore stretch improvements: Cut candidate • State: Backlog • Backlog • Business value: 24/100',
        ],
        whyNow:
          'I treated not-started, lower-value backlog work as safer to move out than blocked, active, or highest-impact work.',
        recommendedNextStep:
          'Review cut candidate #15. #15 is not started yet. Business value 24/100. Safer to move out than the active or higher-value work on this tab. Keeps #14 protected.',
        confidence: 'high',
      },
      reasoningSource: 'deterministic',
      terminalOutcome: 'quiet',
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'What can we cut and still protect delivery?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    expect(await screen.findByRole('link', { name: 'Review cut candidate #15' })).toHaveAttribute(
      'href',
      '/documents/issue-15'
    );
    expect(screen.getAllByText(/Safer to move out than the active or higher-value work/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'What can move out without hurting the highest-value work?' })
    ).toBeInTheDocument();
  });

  it('keeps the risk-cluster route featured for risk questions even when a cut candidate is present', async () => {
    const riskContext: FleetGraphPageContext = {
      ...issueSurfacePageContext,
      summary:
        'API Platform shows risk building inside Week 2, where the visible issue mix has shifted toward work that is not started or still stale.',
      metrics: [
        { label: 'Visible issues', value: '18' },
        { label: 'Not started', value: '10' },
        { label: 'In progress', value: '5' },
        { label: 'Risk cluster', value: 'Week 2' },
      ],
      items: [
        {
          label: '#19 Untitled',
          detail:
            'Highest impact • State: Backlog • Week: Week 2 • Business value: 64/100 • Drivers: ICE fallback 80/125 • Risk: not started inside Week 2',
          route: '/documents/issue-19',
        },
        {
          label: '#15 Performance: Explore stretch improvements',
          detail:
            'Cut candidate • State: Backlog • Week: Week 2 • Business value: 24/100 • Not started and safer to move out than the active or higher-value work on this tab',
          route: '/documents/issue-15',
        },
        {
          label: 'Week 2',
          detail: '5 open issues • 3 issues active • 2 issues not started',
          route: '/documents/week-2/issues',
        },
      ],
      actions: [
        {
          label: 'Review cut candidate #15',
          route: '/documents/issue-15',
          intent: 'prioritize',
          reason:
            '#15 is not started yet. Business value 24/100. Safer to move out than the active or higher-value work on this tab. Keeps #19 protected.',
        },
        {
          label: 'Open risk cluster Week 2',
          route: '/documents/week-2/issues',
          intent: 'prioritize',
          reason: 'Week 2 holds the current risk cluster. 4 issues are not started and 1 issue is stalled.',
        },
        {
          label: 'Open highest-impact #19',
          route: '/documents/issue-19',
          intent: 'prioritize',
          reason: '#19 carries the strongest business value signal on this tab. Business value 64/100.',
        },
      ],
    };

    mockUseFleetGraphActiveView.mockReturnValue({
      ...activeView,
      entity: {
        id: 'program-1',
        type: 'program',
        sourceDocumentType: 'program',
      },
      route: '/documents/program-1/issues',
      tab: 'issues',
      projectId: null,
    });
    mockUseFleetGraphPageContext.mockReturnValue(riskContext);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      activeView: {
        ...activeView,
        entity: {
          id: 'program-1',
          type: 'program',
          sourceDocumentType: 'program',
        },
        route: '/documents/program-1/issues',
        tab: 'issues',
        projectId: null,
      },
      fetched: {
        entity: null,
        supporting: null,
        activity: null,
        accountability: null,
        people: null,
      },
      derivedSignals: {
        ...baseResponse.derivedSignals,
        severity: 'none',
        reasons: [],
        summary: null,
        shouldSurface: false,
        signals: [],
        metrics: {
          totalIssues: 0,
          completedIssues: 0,
          inProgressIssues: 0,
          incompleteIssues: 0,
          cancelledIssues: 0,
          standupCount: 0,
          recentActivityCount: 0,
          recentActiveDays: 0,
          completionRate: null,
        },
      },
      finding: null,
      reasoning: {
        answerMode: 'execution',
        summary: 'Week 2 is the clearest risk cluster on this tab. 10 issues are still not started.',
        evidence: ['Not started: 10', 'Risk cluster: Week 2'],
        whyNow: 'This answer is grounded in the visible issues on the current tab.',
        recommendedNextStep:
          'Open risk cluster Week 2. Then inspect the week or cluster with the most not-started, stale, or blocked work before considering any scope cuts.',
        confidence: 'high',
      },
      reasoningSource: 'deterministic',
      terminalOutcome: 'quiet',
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'What is the risk inside Week 2?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    const routeLinks = (await screen.findAllByRole('link')).filter((element) =>
      element.getAttribute('href')?.startsWith('/documents/')
    );
    expect(routeLinks[0]).toHaveTextContent('Open risk cluster Week 2');
    expect(routeLinks[0]).toHaveAttribute('href', '/documents/week-2/issues');
    expect(screen.queryByText('Stable')).not.toBeInTheDocument();
  });

  it('records drawer-open evaluation events for the current surface', async () => {
    mockUseFleetGraphActiveView.mockReturnValue({
      ...activeView,
      entity: {
        id: 'program-1',
        type: 'program',
        sourceDocumentType: 'program',
      },
      route: '/documents/program-1/issues',
      tab: 'issues',
      projectId: null,
    });
    mockUseFleetGraphPageContext.mockReturnValue(issueSurfacePageContext);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      activeView: {
        ...activeView,
        entity: {
          id: 'program-1',
          type: 'program',
          sourceDocumentType: 'program',
        },
        route: '/documents/program-1/issues',
        tab: 'issues',
        projectId: null,
      },
      fetched: {
        entity: null,
        supporting: null,
        activity: null,
        accountability: null,
        people: null,
      },
      reasoning: {
        answerMode: 'execution',
        summary:
          'API Platform does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet.',
        evidence: ['Visible issues: 5', 'Risk cluster: Week 3'],
        whyNow: 'This answer is grounded in the visible issues on the current tab.',
        recommendedNextStep: 'Open risk cluster Week 3.',
        confidence: 'high',
      },
      telemetry: {
        ...baseResponse.telemetry,
        totalLatencyMs: 245,
      },
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));

    await waitFor(() => {
      expect(mockReportFleetGraphFeedback).toHaveBeenCalledWith({
        event_name: 'drawer_opened',
        surface: {
          route: '/documents/program-1/issues',
          activeViewSurface: 'document',
          entityType: 'program',
          pageContextKind: 'issue_surface',
          tab: 'issues',
          projectId: null,
        },
      });
    });
  });

  it('still shows an unavailable state only when neither active view nor page context exists', () => {
    mockUseFleetGraphActiveView.mockReturnValue(null);
    mockUseFleetGraphPageContext.mockReturnValue(null);

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));

    expect(screen.getAllByText(/FleetGraph could not derive current page context/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('supports HITL decisions from the drawer', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockUseFleetGraphPageContext.mockReturnValue(null);
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

    renderPanel();

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

  it('translates writeback failures into structured execution guidance', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockUseFleetGraphPageContext.mockReturnValue(null);
    mockInvokeFleetGraphOnDemand.mockResolvedValue({
      ...baseResponse,
      status: 'failed',
      stage: 'fallback',
      reasoning: null,
      finding: null,
      proposedAction: null,
      pendingApproval: null,
      actionResult: null,
      error: {
        code: 'PROPOSED_ACTION_EXECUTION_FAILED',
        message:
          'Ship API POST /api/documents/11111111-1111-1111-1111-111111111111/comments failed with status 403',
        retryable: true,
        source: 'executeProposedAction',
      },
      terminalOutcome: 'failed_retryable',
    });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Summarize the key risk signals.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    expect(await screen.findByText('Issue detected')).toBeInTheDocument();
    expect(
      screen.getByText(/Ship rejected the approved follow-up comment before it could be posted/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Root cause')).toBeInTheDocument();
    expect(screen.getByText('Impact on workflow')).toBeInTheDocument();
    expect(screen.getByText('Recommended actions')).toBeInTheDocument();
    expect(screen.getByText('PM insight')).toBeInTheDocument();
    expect(screen.getByText(/Technical detail:/i)).toBeInTheDocument();
  });

  it('marks follow-up prompt questions with the correct question source', async () => {
    mockUseFleetGraphActiveView.mockReturnValue(activeView);
    mockUseFleetGraphPageContext.mockReturnValue(null);
    mockInvokeFleetGraphOnDemand
      .mockResolvedValueOnce(baseResponse)
      .mockResolvedValueOnce(baseResponse);

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Open FleetGraph' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Why is this sprint at risk?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send FleetGraph message' }));

    await screen.findByText('Suggested follow-up questions');

    fireEvent.click(
      screen.getByRole('button', { name: 'Is the risk coming from scope, blockers, or capacity?' })
    );

    await waitFor(() => {
      expect(mockInvokeFleetGraphOnDemand).toHaveBeenLastCalledWith({
        active_view: activeView,
        page_context: null,
        question: 'Is the risk coming from scope, blockers, or capacity?',
        question_source: 'follow_up_prompt',
      });
    });
  });
});
