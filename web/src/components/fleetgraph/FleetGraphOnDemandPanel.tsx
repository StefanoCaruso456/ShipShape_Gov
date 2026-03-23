import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  FleetGraphActiveViewContext,
  FleetGraphAnswerMode,
  FleetGraphDerivedSignal,
  FleetGraphDerivedSignals,
  FleetGraphFeedbackEventRequest,
  FleetGraphFeedbackSurfaceContext,
  FleetGraphOnDemandResponse,
  FleetGraphPageContext,
  FleetGraphPageContextAction,
  FleetGraphPageContextActionIntent,
  FleetGraphQuestionSource,
} from '@ship/shared';
import { cn } from '@/lib/cn';
import {
  invokeFleetGraphOnDemand,
  reportFleetGraphFeedback,
  resumeFleetGraphOnDemand,
} from '@/lib/fleetgraph';
import { useFleetGraphActiveView } from '@/hooks/useFleetGraphActiveView';
import { useFleetGraphPageContext } from '@/hooks/useFleetGraphPageContext';

type FleetGraphPageContextWithActions = FleetGraphPageContext & {
  actions?: FleetGraphPageContextAction[];
};

const DRAWER_STORAGE_KEY = 'ship:fleetgraphDrawerOpen';

type FleetGraphPromptSurface =
  | 'my_week'
  | 'sprint'
  | 'project_issues'
  | 'project'
  | 'program'
  | 'team'
  | 'document'
  | 'generic';

type FleetGraphPromptTheme =
  | 'impact'
  | 'risk'
  | 'blockers'
  | 'capacity'
  | 'scope'
  | 'status'
  | 'coordination'
  | 'review'
  | 'execution_failure'
  | 'generic';

const SEVERITY_STYLES: Record<
  FleetGraphDerivedSignals['severity'],
  {
    label: string;
    badgeClassName: string;
    accentClassName: string;
  }
> = {
  none: {
    label: 'Stable',
    badgeClassName: 'border-border bg-border/40 text-muted',
    accentClassName: 'from-emerald-400/10 to-cyan-400/10',
  },
  info: {
    label: 'Watch',
    badgeClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    accentClassName: 'from-sky-500/20 to-cyan-500/10',
  },
  warning: {
    label: 'Attention',
    badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    accentClassName: 'from-amber-500/20 to-orange-500/10',
  },
  action: {
    label: 'Needs action',
    badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-200',
    accentClassName: 'from-red-500/20 to-orange-500/10',
  },
};

const ANSWER_MODE_STYLES: Record<
  Exclude<FleetGraphAnswerMode, 'execution'>,
  {
    label: string;
    badgeClassName: string;
    headerLabel: string;
    assistantLabel: string;
    nextStepLabel: string;
  }
> = {
  context: {
    label: 'Page guidance',
    badgeClassName: 'border-white/10 bg-white/5 text-muted',
    headerLabel: 'Page guidance',
    assistantLabel: 'Grounded page guidance',
    nextStepLabel: 'Recommended next step',
  },
  launcher: {
    label: 'Launcher guidance',
    badgeClassName: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    headerLabel: 'Launcher guidance',
    assistantLabel: 'Launcher guidance',
    nextStepLabel: 'Best next surface',
  },
};

const EXECUTION_CONTEXT_BADGE = {
  label: 'Execution view',
  badgeClassName: 'border-white/10 bg-white/5 text-muted',
};

interface FleetGraphOnDemandPanelProps {
  activeView?: FleetGraphActiveViewContext | null;
}

interface FleetGraphChatTurn {
  id: string;
  question: string;
  questionSource: FleetGraphQuestionSource;
  status: 'running' | 'completed' | 'error';
  pageContext: FleetGraphPageContext | null;
  result: FleetGraphOnDemandResponse | null;
  error: string | null;
}

interface FleetGraphErrorGuidance {
  issueDetected: string;
  rootCause: string;
  impact: string;
  immediateFix: string;
  shortTermFix: string;
  longTermFix: string;
  pmInsight: string;
  automation: string | null;
}

function createTurnId() {
  return `fleetgraph-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTabLabel(tab: string | null): string {
  if (!tab) {
    return 'Current view';
  }

  return tab
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getFallbackEntityLabel(activeView: FleetGraphActiveViewContext | null): string | null {
  if (!activeView) {
    return null;
  }

  switch (activeView.entity.type) {
    case 'week':
      return 'Current sprint';
    case 'project':
      return 'Current project';
    case 'issue':
      return 'Current issue';
    case 'program':
      return 'Current program';
    case 'person':
      return activeView.surface === 'my_week' ? 'My Week' : 'Current person';
    default:
      return 'Current view';
  }
}

function buildFeedbackSurfaceContext(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null
): FleetGraphFeedbackSurfaceContext {
  return {
    route:
      activeView?.route ??
      pageContext?.route ??
      (typeof window === 'undefined' ? '/' : window.location.pathname),
    activeViewSurface: activeView?.surface ?? null,
    entityType: activeView?.entity.type ?? null,
    pageContextKind: pageContext?.kind ?? null,
    tab: activeView?.tab ?? null,
    projectId: activeView?.projectId ?? null,
  };
}

function buildContextSummary(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null,
  result: FleetGraphOnDemandResponse | null
): string {
  const entityTitle =
    result?.fetched.entity?.title ??
    result?.fetched.supporting?.current?.title ??
    pageContext?.title ??
    getFallbackEntityLabel(activeView);
  const projectName = result?.fetched.accountability?.project?.name ?? null;
  const programName =
    result?.fetched.accountability?.program?.name ??
    result?.fetched.supporting?.current?.program_name ??
    null;
  const tabLabel = activeView ? formatTabLabel(activeView.tab ?? null) : null;

  return [entityTitle, projectName, programName, tabLabel].filter(Boolean).join('  •  ');
}

function buildSummary(
  result: FleetGraphOnDemandResponse | null,
  pageContext: FleetGraphPageContext | null
): string | null {
  if (!result || result.error) {
    return null;
  }

  return (
    result.reasoning?.summary ??
    result.finding?.summary ??
    result.derivedSignals.summary ??
    pageContext?.summary ??
    "FleetGraph doesn't see a meaningful sprint-risk signal on this view right now."
  );
}

function inferAnswerModeFromContext(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null
): FleetGraphAnswerMode {
  if (pageContext?.kind === 'issue_surface') {
    return 'execution';
  }

  if (
    activeView?.entity.type === 'week' ||
    activeView?.entity.sourceDocumentType === 'weekly_plan' ||
    activeView?.entity.sourceDocumentType === 'weekly_retro'
  ) {
    return 'execution';
  }

  switch (pageContext?.kind) {
    case 'dashboard':
    case 'programs':
    case 'projects':
    case 'issues':
    case 'documents':
    case 'team_directory':
    case 'settings':
      return 'launcher';
    case 'my_week':
    case 'document':
    case 'person':
    case 'generic':
    default:
      return 'context';
  }
}

function getAnswerMode(
  result: FleetGraphOnDemandResponse | null,
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null
): FleetGraphAnswerMode {
  return result?.reasoning?.answerMode ?? inferAnswerModeFromContext(activeView, pageContext);
}

function getAssistantLabel(answerMode: FleetGraphAnswerMode): string {
  if (answerMode === 'execution') {
    return 'Grounded execution guidance';
  }

  return ANSWER_MODE_STYLES[answerMode].assistantLabel;
}

function getNextStepLabel(answerMode: FleetGraphAnswerMode): string {
  if (answerMode === 'execution') {
    return 'Recommended next step';
  }

  return ANSWER_MODE_STYLES[answerMode].nextStepLabel;
}

function describeCurrentWorkSurface(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null,
  result: FleetGraphOnDemandResponse | null
): string {
  return (
    result?.fetched.entity?.title ??
    result?.fetched.accountability?.project?.name ??
    pageContext?.title ??
    getFallbackEntityLabel(activeView) ??
    'this work surface'
  );
}

function buildErrorGuidance(
  result: FleetGraphOnDemandResponse | null,
  turn: FleetGraphChatTurn,
  activeView: FleetGraphActiveViewContext | null
): FleetGraphErrorGuidance | null {
  const errorCode = result?.error?.code ?? null;
  const errorMessage = result?.error?.message ?? turn.error ?? null;

  if (!errorMessage) {
    return null;
  }

  const workSurface = describeCurrentWorkSurface(activeView, turn.pageContext, result);
  const isCommentWriteFailure =
    errorCode === 'PROPOSED_ACTION_EXECUTION_FAILED' &&
    errorMessage.includes('/comments');
  const isForbidden = errorMessage.includes('status 403');

  if (isCommentWriteFailure && isForbidden) {
    return {
      issueDetected:
        `FleetGraph could analyze ${workSurface}, but Ship rejected the approved follow-up comment before it could be posted.`,
      rootCause:
        'Most likely cause: the writeback request reached a protected Ship endpoint without the session protection data it needs, so Ship treated the mutation as forbidden.',
      impact:
        `The current page stays unchanged, so the team does not get the follow-up comment or escalation FleetGraph tried to add for ${workSurface}.`,
      immediateFix:
        'Retry the approved action after the writeback request includes the same authenticated session protections as the original browser action.',
      shortTermFix:
        'Translate writeback failures into a product-level explanation so users see what failed and what to do next instead of a raw API path.',
      longTermFix:
        'Keep FleetGraph mutations on the same trusted write path as the main app and add integration coverage for approval-to-comment flows.',
      pmInsight:
        'This reveals a product gap between “analyze work” and “mutate work.” The assistant can reason correctly, but the writeback path is not yet using the same safety contract as the rest of Ship.',
      automation:
        'FleetGraph could automatically save the drafted comment, log the failed mutation, and offer a one-click retry instead of dropping the action on the floor.',
    };
  }

  return {
    issueDetected: `FleetGraph hit a product error while analyzing ${workSurface}.`,
    rootCause:
      errorCode === 'PROPOSED_ACTION_EXECUTION_FAILED'
        ? 'Most likely cause: the analysis succeeded, but the follow-up action failed during writeback.'
        : 'Most likely cause: FleetGraph hit a backend or permissions failure while trying to finish this request.',
    impact:
      `You can still inspect ${workSurface}, but FleetGraph could not finish this answer or action cleanly on the current page.`,
    immediateFix: 'Retry the question once. If it fails again, avoid mutating actions on this page until the backend path is verified.',
    shortTermFix:
      'Map FleetGraph failures to user-facing execution guidance with page-aware recovery steps instead of exposing raw backend messages.',
    longTermFix:
      'Add end-to-end coverage for page-context analysis, approval flows, and writeback failures so these errors are caught before deploy.',
    pmInsight:
      'This shows the assistant needs a stronger failure contract. A work assistant should explain execution blockers in plain English, not expose transport details.',
    automation:
      'FleetGraph could capture the failed run, create an internal bug record, and attach the current page context for the engineer who debugs it.',
  };
}

function getPromptSurface(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null
): FleetGraphPromptSurface {
  if (pageContext?.kind === 'my_week' || activeView?.surface === 'my_week') {
    return 'my_week';
  }

  if (
    activeView?.entity.type === 'week' ||
    activeView?.entity.sourceDocumentType === 'weekly_plan' ||
    activeView?.entity.sourceDocumentType === 'weekly_retro'
  ) {
    return 'sprint';
  }

  if (pageContext?.kind === 'issues' || pageContext?.kind === 'issue_surface' || activeView?.tab === 'issues') {
    return 'project_issues';
  }

  if (pageContext?.kind === 'projects' || activeView?.entity.type === 'project') {
    return 'project';
  }

  if (
    pageContext?.kind === 'programs' ||
    pageContext?.kind === 'dashboard' ||
    activeView?.entity.type === 'program'
  ) {
    return 'program';
  }

  if (pageContext?.kind === 'team_directory' || pageContext?.kind === 'person') {
    return 'team';
  }

  if (pageContext?.kind === 'document' || pageContext?.kind === 'documents') {
    return 'document';
  }

  return 'generic';
}

function dedupePrompts(
  prompts: Array<string | null | undefined>,
  limit = 4
): string[] {
  const seen = new Set<string>();

  return prompts.filter((prompt): prompt is string => {
    if (!prompt) {
      return false;
    }

    const normalized = prompt.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  }).slice(0, limit);
}

function getPageContextMetricValue(
  pageContext: FleetGraphPageContext | null,
  label: string
): string | null {
  return pageContext?.metrics.find((metric) => metric.label === label)?.value ?? null;
}

function getPageContextMetricNumber(
  pageContext: FleetGraphPageContext | null,
  label: string
): number | null {
  const rawValue = getPageContextMetricValue(pageContext, label);
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0] ?? '', 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildMyWeekStarterPrompts(pageContext: FleetGraphPageContext | null): string[] {
  const projectSignals = getPageContextMetricValue(pageContext, 'Project signals');
  const weeklyPlan = getPageContextMetricValue(pageContext, 'Weekly plan');
  const dailyUpdates = getPageContextMetricValue(pageContext, 'Daily updates');

  return dedupePrompts([
    projectSignals && projectSignals !== 'No project scope'
      ? 'Which project needs attention first?'
      : null,
    weeklyPlan && weeklyPlan !== 'Submitted'
      ? 'What am I at risk of missing this week?'
      : null,
    dailyUpdates && !dailyUpdates.startsWith('5/') && !dailyUpdates.startsWith('4/')
      ? 'What follow-up should I send now?'
      : null,
    'What needs my attention today?',
    'Which planned work is not moving?',
    'What should I finish before I start new work?',
  ]);
}

function buildIssueSurfaceStarterPrompts(pageContext: FleetGraphPageContext | null): string[] {
  const staleOpen = getPageContextMetricNumber(pageContext, 'Stale open');
  const notStarted = getPageContextMetricNumber(pageContext, 'Not started');
  const inProgress = getPageContextMetricNumber(pageContext, 'In progress');
  const riskCluster = getPageContextMetricValue(pageContext, 'Risk cluster');

  return dedupePrompts([
    staleOpen && staleOpen > 0 ? 'Which issues are stale or stuck?' : null,
    notStarted !== null && inProgress !== null && notStarted > inProgress
      ? 'What should be triaged, moved, or cut?'
      : null,
    riskCluster ? `What is the risk inside ${riskCluster}?` : null,
    'Which issues need attention first?',
    'What is blocking delivery in this project?',
    'Are there dependency risks in this issue set?',
    'Which issue needs an owner follow-up today?',
  ]);
}

function getStarterPrompts(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null
): string[] {
  switch (getPromptSurface(activeView, pageContext)) {
    case 'my_week':
      return buildMyWeekStarterPrompts(pageContext);
    case 'sprint':
      return dedupePrompts([
        'Are we on track to hit the sprint goal?',
        'What is most at risk this week?',
        'What changed since this sprint started?',
        'Which work is blocked or not moving?',
        'Are we carrying too much for this sprint?',
      ]);
    case 'project_issues':
      return buildIssueSurfaceStarterPrompts(pageContext);
    case 'project':
      return dedupePrompts([
        'Is this project healthy right now?',
        'What is the biggest delivery risk in this project?',
        'What should the PM follow up on next?',
        'What changed recently that matters?',
        'Is this project under-scoped, over-scoped, or drifting?',
      ]);
    case 'program':
      return dedupePrompts([
        'Which project needs attention first?',
        'Where are the biggest dependency risks?',
        'Which work is drifting across projects?',
        'What should leadership know right now?',
        'Which teams are overloaded?',
      ]);
    case 'team':
      return dedupePrompts([
        'Who is overloaded right now?',
        'Which important work has no clear owner?',
        'Where are the likely bottlenecks on the team?',
        'Which follow-up conversation should happen today?',
        'Which projects are under-staffed this week?',
      ]);
    case 'document':
      return dedupePrompts([
        'What matters in this document?',
        'What decision or follow-up does this document imply?',
        'What is still unclear or missing here?',
        'Which related work should I open next?',
        'Is this document still aligned with the current project or sprint state?',
      ]);
    default:
      return dedupePrompts([
        'What needs attention first on this page?',
        'What should happen next from this view?',
        'What changed recently that matters here?',
        'Which related work should I open next?',
      ]);
  }
}

function inferPromptTheme(turn: FleetGraphChatTurn): FleetGraphPromptTheme {
  if (turn.result?.error || turn.error) {
    return 'execution_failure';
  }

  const question = turn.question.trim().toLowerCase();
  if (
    question.includes('impact') ||
    question.includes('value') ||
    question.includes('roi') ||
    question.includes('retention') ||
    question.includes('acquisition') ||
    question.includes('growth')
  ) {
    return 'impact';
  }
  if (question.includes('risk') || question.includes('at risk')) {
    return 'risk';
  }
  if (question.includes('block') || question.includes('dependency')) {
    return 'blockers';
  }
  if (
    question.includes('cut') ||
    question.includes('defer') ||
    question.includes('move out') ||
    question.includes('reduce scope')
  ) {
    return 'scope';
  }
  if (question.includes('stalled') || question.includes('stuck') || question.includes('not moving')) {
    return 'status';
  }
  if (question.includes('capacity') || question.includes('overloaded')) {
    return 'capacity';
  }
  if (question.includes('scope') || question.includes('changed')) {
    return 'scope';
  }
  if (question.includes('follow-up') || question.includes('follow up') || question.includes('who')) {
    return 'coordination';
  }
  if (question.includes('status') || question.includes('moving') || question.includes('attention')) {
    return 'status';
  }

  const corpus = [
    turn.question,
    turn.result?.reasoning?.summary,
    turn.result?.reasoning?.recommendedNextStep,
    turn.result?.finding?.summary,
    turn.result?.derivedSignals.summary,
    ...(turn.result?.derivedSignals.reasons ?? []),
    turn.result?.proposedAction?.summary,
    turn.result?.proposedAction?.rationale,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    corpus.includes('impact') ||
    corpus.includes('business value') ||
    corpus.includes('roi') ||
    corpus.includes('retention') ||
    corpus.includes('acquisition') ||
    corpus.includes('growth')
  ) {
    return 'impact';
  }

  if (
    corpus.includes('capacity') ||
    corpus.includes('overloaded') ||
    corpus.includes('overcommitted') ||
    corpus.includes('too much')
  ) {
    return 'capacity';
  }

  if (
    corpus.includes('scope') ||
    corpus.includes('changed') ||
    corpus.includes('added') ||
    corpus.includes('cut') ||
    corpus.includes('drift')
  ) {
    return 'scope';
  }

  if (
    corpus.includes('blocked') ||
    corpus.includes('blocker') ||
    corpus.includes('dependency') ||
    corpus.includes('review') ||
    corpus.includes('approval') ||
    corpus.includes('waiting')
  ) {
    return corpus.includes('review') && !corpus.includes('blocked') ? 'review' : 'blockers';
  }

  if (
    corpus.includes('follow-up') ||
    corpus.includes('follow up') ||
    corpus.includes('owner') ||
    corpus.includes('handoff') ||
    corpus.includes('escalat') ||
    corpus.includes('who should')
  ) {
    return 'coordination';
  }

  if (
    corpus.includes('status') ||
    corpus.includes('progress') ||
    corpus.includes('stale') ||
    corpus.includes('attention') ||
    corpus.includes('milestone') ||
    corpus.includes('moving')
  ) {
    return 'status';
  }

  if (corpus.includes('risk') || corpus.includes('slip')) {
    return 'risk';
  }

  return 'generic';
}

function mapPromptThemeToQuestionTheme(theme: FleetGraphPromptTheme) {
  switch (theme) {
    case 'impact':
      return 'impact';
    case 'risk':
      return 'risk';
    case 'blockers':
      return 'blockers';
    case 'scope':
      return 'scope';
    case 'status':
    case 'capacity':
    case 'review':
      return 'status';
    case 'coordination':
      return 'follow_up';
    case 'execution_failure':
    case 'generic':
    default:
      return 'generic';
  }
}

function getPromptSurfaceForTurn(turn: FleetGraphChatTurn): FleetGraphPromptSurface {
  return getPromptSurface(turn.result?.activeView ?? null, turn.pageContext);
}

function getFollowUpPrompts(turn: FleetGraphChatTurn): string[] {
  const theme = inferPromptTheme(turn);
  const surface = getPromptSurfaceForTurn(turn);
  const prompts: string[] = (() => {
    switch (theme) {
      case 'impact':
        return [
          'Which issue is high business value but not moving?',
          'Where is delivery risk hitting the most valuable work?',
          'What can protect the highest-impact issue this week?',
          'Should lower-value work move out first?',
        ];
      case 'risk':
        if (surface === 'project_issues') {
          return [
            'Which exact issues are driving the risk?',
            'Is this mostly scope, blockers, or not-started work?',
            'Which week or issue cluster is least likely to finish?',
            'What can we cut and still protect delivery?',
          ];
        }

        if (surface === 'my_week') {
          return [
            'Which project needs attention first?',
            'Is this risk coming from plan, updates, or project movement?',
            'What follow-up should I send now?',
            'What can I defer and still protect this week?',
          ];
        }

        return [
          'Is the risk coming from scope, blockers, or capacity?',
          'Which exact issues are driving the risk?',
          'What changed after sprint planning?',
          'What can we cut and still hit the goal?',
        ];
      case 'blockers':
        if (surface === 'project_issues') {
          return [
            'What is blocked, by whom, and for how long?',
            'Which issue needs an unblocker today?',
            'What can move forward without waiting?',
            'Should this be escalated now or watched for another day?',
          ];
        }

        if (surface === 'my_week') {
          return [
            'Which project is blocked right now?',
            'What can I move without waiting?',
            'Who needs a follow-up today?',
            'Should I escalate this now or check again tomorrow?',
          ];
        }

        return [
          'What is blocked, by whom, and for how long?',
          'Which dependency has the highest impact on delivery?',
          'What can move forward without waiting?',
          'Should this be escalated now or watched for another day?',
        ];
      case 'capacity':
        return [
          'Are we overcommitted compared to recent velocity?',
          'Who is carrying too much active work?',
          'Are we starting too much and finishing too little?',
          'Should we reduce scope this sprint?',
        ];
      case 'scope':
        if (surface === 'project_issues') {
          return [
            'Which work should move out first if we need to de-risk delivery?',
            'Which planned work got displaced?',
            'Is this change worth the delivery risk it adds?',
            'Should this stay in sprint or move out?',
          ];
        }

        return [
          'What was added after sprint start?',
          'Which planned work got displaced?',
          'Is this change worth the delivery risk it adds?',
          'Should this stay in sprint or move out?',
        ];
      case 'status':
        if (surface === 'project_issues') {
          return [
            'What has not moved recently?',
            'Which "in progress" issues are actually stalled?',
            'Which week is carrying the most unfinished work?',
            'What is the next milestone that matters?',
          ];
        }

        if (surface === 'my_week') {
          return [
            'Which planned work is not moving?',
            'What should I finish before I start new work?',
            'Which project should I open next?',
            'What follow-up is most likely to unblock the week?',
          ];
        }

        return [
          'What has not moved recently?',
          'Which "in progress" issues are actually stalled?',
          'Where are we waiting on review or approval?',
          'What is the next milestone that matters?',
        ];
      case 'coordination':
        if (surface === 'project_issues') {
          return [
            'Who owns the next action on the risky issues?',
            'Which handoff is unclear?',
            'Which issue needs a same-day follow-up?',
            'Who needs help or relief right now?',
          ];
        }

        return [
          'Who owns the next action?',
          'Which handoff is unclear?',
          'Which person needs help or relief?',
          'Which follow-up conversation should happen today?',
        ];
      case 'review':
        return [
          'What evidence says the goal is actually met?',
          'Which completed work still lacks proof or review?',
          'What should be called out in the sprint review?',
          'What should change next sprint?',
        ];
      case 'execution_failure':
        return [
          'What workflow is blocked right now?',
          'Should I retry this now or use a fallback?',
          'What should the PM or engineer do next?',
          'Is this likely a permissions or session issue?',
        ];
      default:
        if (surface === 'project_issues') {
          return [
            'Which issues need attention first?',
            'What should be triaged, moved, or cut?',
            'Are there dependency risks in this issue set?',
            'Which issue needs an owner follow-up today?',
          ];
        }

        if (surface === 'my_week') {
          return [
            'What needs my attention today?',
            'What follow-up should I send now?',
            'Which planned work is not moving?',
            'Which project should I open next?',
          ];
        }

        return [
          'What should happen next?',
          'Which item needs attention first?',
          'What changed recently that matters?',
          'Which related work should I open next?',
        ];
    }
  })();

  const normalizedQuestion = turn.question.trim().toLowerCase();
  return dedupePrompts(
    prompts.filter((prompt) => prompt.trim().toLowerCase() !== normalizedQuestion)
  );
}

function toRouteActionLabel(label: string): string {
  return /^(Open|Create|Write|Complete)\b/.test(label) ? label : `Open ${label}`;
}

type FleetGraphRouteAction = FleetGraphPageContextAction & {
  source: 'proposed' | 'page_context' | 'item';
  order: number;
};

function isRiskClusterRouteAction(action: FleetGraphPageContextAction): boolean {
  const corpus = [action.label, action.reason ?? ''].join(' ').toLowerCase();
  return corpus.includes('risk cluster');
}

function isCutCandidateRouteAction(action: FleetGraphPageContextAction): boolean {
  const corpus = [action.label, action.reason ?? ''].join(' ').toLowerCase();
  return corpus.includes('cut candidate') || corpus.includes('move out');
}

function getPreferredActionIntentsForTurn(
  turn: FleetGraphChatTurn,
  answerMode: FleetGraphAnswerMode
): FleetGraphPageContextActionIntent[] {
  const theme = inferPromptTheme(turn);

  switch (theme) {
    case 'coordination':
      return ['follow_up', 'prioritize', 'inspect', 'write', 'complete'];
    case 'scope':
    case 'risk':
      return ['prioritize', 'inspect', 'follow_up', 'complete', 'write'];
    case 'status':
    case 'blockers':
      return ['follow_up', 'inspect', 'prioritize', 'complete', 'write'];
    case 'review':
      return ['complete', 'inspect', 'prioritize', 'write', 'follow_up'];
    case 'execution_failure':
      return ['inspect', 'follow_up', 'prioritize', 'write', 'complete'];
    default:
      return answerMode === 'launcher'
        ? ['inspect', 'prioritize', 'follow_up', 'write', 'complete']
        : ['prioritize', 'follow_up', 'inspect', 'write', 'complete'];
  }
}

function getRouteActionQuestionBoost(
  action: FleetGraphPageContextAction,
  question: string
): number {
  const normalizedQuestion = question.trim().toLowerCase();
  const corpus = `${action.label} ${action.reason ?? ''}`.toLowerCase();

  if (
    normalizedQuestion.includes('impact') ||
    normalizedQuestion.includes('value') ||
    normalizedQuestion.includes('roi') ||
    normalizedQuestion.includes('retention') ||
    normalizedQuestion.includes('acquisition') ||
    normalizedQuestion.includes('growth')
  ) {
    return corpus.includes('highest-impact') || corpus.includes('business value') ? 3 : 0;
  }

  if (
    normalizedQuestion.includes('follow-up') ||
    normalizedQuestion.includes('follow up') ||
    normalizedQuestion.includes('who') ||
    normalizedQuestion.includes('owner')
  ) {
    return (action.intent === 'follow_up' ? 2 : 0) + (corpus.includes('owner') ? 1 : 0);
  }

  if (
    normalizedQuestion.includes('risk') ||
    normalizedQuestion.includes('blocked') ||
    normalizedQuestion.includes('stale') ||
    normalizedQuestion.includes('stuck')
  ) {
    if (isRiskClusterRouteAction(action)) {
      return 4;
    }

    if (isCutCandidateRouteAction(action)) {
      return 0;
    }

    return corpus.includes('stale') || corpus.includes('blocked') ? 2 : 0;
  }

  if (
    normalizedQuestion.includes('write') ||
    normalizedQuestion.includes('update') ||
    normalizedQuestion.includes('standup')
  ) {
    return action.intent === 'write' ? 3 : 0;
  }

  if (
    normalizedQuestion.includes('cut') ||
    normalizedQuestion.includes('defer') ||
    normalizedQuestion.includes('move out') ||
    normalizedQuestion.includes('reduce scope')
  ) {
    return corpus.includes('cut candidate') || corpus.includes('move out') ? 3 : 0;
  }

  if (
    normalizedQuestion.includes('stalled') ||
    normalizedQuestion.includes('stuck') ||
    normalizedQuestion.includes('not moving') ||
    normalizedQuestion.includes('in progress')
  ) {
    return corpus.includes('stalled') || corpus.includes('blocked') ? 3 : 0;
  }

  if (
    normalizedQuestion.includes('complete') ||
    normalizedQuestion.includes('finish') ||
    normalizedQuestion.includes('retro') ||
    normalizedQuestion.includes('plan')
  ) {
    return action.intent === 'complete' ? 3 : 0;
  }

  return 0;
}

function getRouteActions(
  turn: FleetGraphChatTurn,
  activeView: FleetGraphActiveViewContext | null
): Array<NonNullable<FleetGraphPageContextWithActions['actions']>[number]> {
  const { pageContext, result } = turn;
  const pageContextWithActions = pageContext as FleetGraphPageContextWithActions | null;
  const answerMode = getAnswerMode(result, activeView, pageContext);
  const preferredIntents = getPreferredActionIntentsForTurn(turn, answerMode);
  const candidates: Array<FleetGraphRouteAction | null> = [
    result?.proposedAction?.targetRoute
      ? {
          label: 'Open target doc',
          route: result.proposedAction.targetRoute,
          intent: 'follow_up',
          reason: result.proposedAction.rationale,
          source: 'proposed',
          order: 0,
        }
      : null,
    ...((pageContextWithActions?.actions ?? []).map((action, index) => ({
      label: action.label,
      route: action.route,
      intent: action.intent,
      reason: action.reason,
      owner: action.owner,
      source: 'page_context' as const,
      order: index + 1,
    }))),
    ...((pageContext?.items ?? [])
      .filter((item) => Boolean(item.route))
      .map((item, index) => ({
        label: toRouteActionLabel(item.label),
        route: item.route as string,
        intent: 'inspect' as const,
        reason: item.detail ?? null,
        source: 'item' as const,
        order: index + 20,
      }))),
  ];
  const seenRoutes = new Set<string>();
  const deduped = candidates.filter((candidate): candidate is FleetGraphRouteAction => {
    if (!candidate || seenRoutes.has(candidate.route)) {
      return false;
    }

    seenRoutes.add(candidate.route);
    return true;
  });

  deduped.sort((left, right) => {
    const questionBoostDelta =
      getRouteActionQuestionBoost(right, turn.question) - getRouteActionQuestionBoost(left, turn.question);
    if (questionBoostDelta !== 0) {
      return questionBoostDelta;
    }

    const leftRank = preferredIntents.indexOf(left.intent ?? 'inspect');
    const rightRank = preferredIntents.indexOf(right.intent ?? 'inspect');
    const normalizedLeftRank = leftRank === -1 ? preferredIntents.length : leftRank;
    const normalizedRightRank = rightRank === -1 ? preferredIntents.length : rightRank;

    if (normalizedLeftRank !== normalizedRightRank) {
      return normalizedLeftRank - normalizedRightRank;
    }

    const sourceRank = {
      proposed: 0,
      page_context: 1,
      item: 2,
    } as const;
    if (sourceRank[left.source] !== sourceRank[right.source]) {
      return sourceRank[left.source] - sourceRank[right.source];
    }

    return left.order - right.order;
  });

  return deduped.slice(0, 4).map(({ source: _source, order: _order, ...action }) => action);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SignalItem({ signal }: { signal: FleetGraphDerivedSignal }) {
  const style = SEVERITY_STYLES[signal.severity];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-foreground">{signal.summary}</p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            style.badgeClassName
          )}
        >
          {style.label}
        </span>
      </div>
      {signal.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted">
          {signal.evidence.slice(0, 2).map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getRouteActionSupportingText(
  action: NonNullable<FleetGraphPageContextWithActions['actions']>[number]
): string | null {
  const reason = action.reason?.trim() ?? '';
  const owner = action.owner?.trim() ?? '';

  if (reason && owner && !reason.toLowerCase().includes(owner.toLowerCase())) {
    return `${reason} Owner: ${owner}.`;
  }

  if (reason) {
    return reason;
  }

  if (owner) {
    return `Owner: ${owner}.`;
  }

  return null;
}

function RouteActionLink({
  action,
  featured = false,
  onInteract,
}: {
  action: NonNullable<FleetGraphPageContextWithActions['actions']>[number];
  featured?: boolean;
  onInteract?: () => void;
}) {
  return (
    <Link
      to={action.route}
      onMouseDownCapture={onInteract}
      onKeyDownCapture={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onInteract) {
          onInteract();
        }
      }}
      className={cn(
        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
        featured
          ? 'inline-flex items-center justify-center border-cyan-500/30 bg-cyan-500/10 text-cyan-50 hover:bg-cyan-500/15'
          : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
      )}
    >
      {action.label}
    </Link>
  );
}

function FleetGraphGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" />
      <path d="M19 14l.9 2.9L22.8 18l-2.9.9L19 21.8l-.9-2.9-2.9-.9 2.9-.9L19 14z" />
      <path d="M5 15l.7 2.1L8 18l-2.3.9L5 21l-.7-2.1L2 18l2.3-.9L5 15z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

export function FleetGraphOnDemandPanel({
  activeView: activeViewProp,
}: FleetGraphOnDemandPanelProps) {
  const contextActiveView = useFleetGraphActiveView();
  const activeView = activeViewProp ?? contextActiveView;
  const pageContext = useFleetGraphPageContext(activeView);
  const hasUsableContext = Boolean(activeView || pageContext);
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(DRAWER_STORAGE_KEY) === 'true';
  });
  const [draftQuestion, setDraftQuestion] = useState('');
  const [turns, setTurns] = useState<FleetGraphChatTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousOpenRef = useRef(open);

  const activeViewKey = useMemo(() => {
    if (activeView) {
      return [
        activeView.entity.id,
        activeView.entity.type,
        activeView.surface,
        activeView.route,
        activeView.tab ?? 'none',
        activeView.projectId ?? 'no-project',
      ].join(':');
    }

    if (pageContext) {
      return [pageContext.kind, pageContext.route, pageContext.title].join(':');
    }

    if (!activeView && !pageContext) {
      return 'missing';
    }

    return 'missing';
  }, [activeView, pageContext]);

  const latestCompletedTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.result)?.result ?? null,
    [turns]
  );
  const latestCompletedTurnRecord = useMemo(
    () => [...turns].reverse().find((turn) => turn.status === 'completed' || turn.status === 'error') ?? null,
    [turns]
  );
  const latestAnswerMode = useMemo(
    () =>
      latestCompletedTurnRecord
        ? getAnswerMode(
            latestCompletedTurnRecord.result,
            activeView,
            latestCompletedTurnRecord.pageContext
          )
        : inferAnswerModeFromContext(activeView, pageContext),
    [activeView, latestCompletedTurnRecord, pageContext]
  );
  const latestSeverity = latestCompletedTurn?.derivedSignals.severity ?? 'none';
  const latestSeverityStyle = SEVERITY_STYLES[latestSeverity];
  const latestExecutionBadgeStyle =
    latestAnswerMode === 'execution' && latestSeverity === 'none'
      ? EXECUTION_CONTEXT_BADGE
      : latestSeverityStyle;
  const contextSummary = buildContextSummary(activeView, pageContext, latestCompletedTurn);
  const unavailableReason = hasUsableContext
    ? null
    : 'FleetGraph could not derive current page context here yet.';
  const starterPrompts = getStarterPrompts(activeView, pageContext);
  const latestFollowUpPrompts = latestCompletedTurnRecord
    ? getFollowUpPrompts(latestCompletedTurnRecord)
    : [];

  const reportFeedback = useCallback((event: FleetGraphFeedbackEventRequest) => {
    void reportFleetGraphFeedback(event).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DRAWER_STORAGE_KEY, open ? 'true' : 'false');
    }
  }, [open]);

  useEffect(() => {
    if (open && !previousOpenRef.current && hasUsableContext) {
      reportFeedback({
        event_name: 'drawer_opened',
        surface: buildFeedbackSurfaceContext(activeView, pageContext),
      });
    }

    previousOpenRef.current = open;
  }, [activeView, hasUsableContext, open, pageContext, reportFeedback]);

  useEffect(() => {
    setTurns([]);
    setDraftQuestion('');
    setActiveTurnId(null);
  }, [activeViewKey]);

  useEffect(() => {
    if (!open || !hasUsableContext) {
      return;
    }

    window.setTimeout(() => {
      textareaRef.current?.focus();
      historyRef.current?.scrollTo?.({
        top: historyRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 0);
  }, [hasUsableContext, open, turns]);

  const submitQuestion = useCallback(
    async (
      questionOverride?: string,
      questionSource: FleetGraphQuestionSource = 'typed'
    ) => {
      const question = (questionOverride ?? draftQuestion).trim();
      if ((!activeView && !pageContext) || !question || activeTurnId) {
        return;
      }

      const turnId = createTurnId();
      setOpen(true);
      setDraftQuestion('');
      setActiveTurnId(turnId);
      setTurns((previous) => [
        ...previous,
        {
          id: turnId,
          question,
          questionSource,
          status: 'running',
          pageContext,
          result: null,
          error: null,
        },
      ]);

      try {
        const response = await invokeFleetGraphOnDemand({
          active_view: activeView ?? null,
          page_context: pageContext ?? null,
          question,
          question_source: questionSource,
        });

        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: 'completed',
                  result: response,
                  error: null,
                }
              : turn
          )
        );
      } catch (invokeError) {
        const message =
          invokeError instanceof Error
            ? invokeError.message
            : 'FleetGraph could not analyze this view.';

        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: 'error',
                  error: message,
                }
              : turn
          )
        );
      } finally {
        setActiveTurnId(null);
      }
    },
    [activeTurnId, activeView, draftQuestion, pageContext]
  );

  const handleDecision = useCallback(
    async (turnId: string, outcome: 'approve' | 'dismiss' | 'snooze') => {
      const turn = turns.find((candidate) => candidate.id === turnId);
      const threadId = turn?.result?.threadId;
      if (!threadId || activeTurnId) {
        return;
      }

      setActiveTurnId(turnId);
      setTurns((previous) =>
        previous.map((candidate) =>
          candidate.id === turnId
            ? {
                ...candidate,
                error: null,
              }
            : candidate
        )
      );

      try {
        const response = await resumeFleetGraphOnDemand({
          thread_id: threadId,
          decision: {
            outcome,
            snooze_minutes: outcome === 'snooze' ? 240 : null,
          },
        });

        setTurns((previous) =>
          previous.map((candidate) =>
            candidate.id === turnId
              ? {
                  ...candidate,
                  status: 'completed',
                  result: response,
                  error: null,
                }
              : candidate
          )
        );
      } catch (resumeError) {
        const message =
          resumeError instanceof Error
            ? resumeError.message
            : 'FleetGraph could not finish the approval flow.';

        setTurns((previous) =>
          previous.map((candidate) =>
            candidate.id === turnId
              ? {
                  ...candidate,
                  error: message,
                }
              : candidate
          )
        );
      } finally {
        setActiveTurnId(null);
      }
    },
    [activeTurnId, turns]
  );

  const handleRouteActionClick = useCallback(
    (
      turn: FleetGraphChatTurn,
      action: NonNullable<FleetGraphPageContextWithActions['actions']>[number],
      featured: boolean
    ) => {
      reportFeedback({
        event_name: 'route_clicked',
        thread_id: turn.result?.threadId ?? null,
        turn_id: turn.id,
        question_source: turn.questionSource,
        question_theme: mapPromptThemeToQuestionTheme(inferPromptTheme(turn)),
        answer_mode: getAnswerMode(turn.result, turn.result?.activeView ?? activeView, turn.pageContext),
        latency_ms: turn.result?.telemetry.totalLatencyMs ?? null,
        surface: buildFeedbackSurfaceContext(turn.result?.activeView ?? activeView, turn.pageContext),
        route_action: {
          label: action.label,
          route: action.route,
          featured,
          intent: action.intent,
        },
      });
    },
    [activeView, reportFeedback]
  );

  const handleComposerKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        await submitQuestion();
      }
    },
    [submitQuestion]
  );

  const composer = hasUsableContext ? (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20">
      <textarea
        ref={textareaRef}
        value={draftQuestion}
        onChange={(event) => setDraftQuestion(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        placeholder="Ask about this page, next steps, or what needs attention..."
        disabled={!!activeTurnId}
        rows={3}
        className="max-h-40 min-h-[72px] w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted">FleetGraph uses the current page as context.</div>
        <button
          type="button"
          onClick={() => {
            void submitQuestion();
          }}
          disabled={!draftQuestion.trim() || !!activeTurnId}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
            !draftQuestion.trim() || activeTurnId
              ? 'cursor-not-allowed bg-white/5 text-muted'
              : 'bg-accent text-white hover:bg-accent/90'
          )}
          aria-label="Send FleetGraph message"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Unavailable here</div>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {unavailableReason}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted">
        FleetGraph should use the page you are on as context. If this still appears, the current
        surface is missing page-context wiring and needs a follow-up fix.
      </p>
    </div>
  );

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close FleetGraph drawer"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[59] bg-black/25 backdrop-blur-[1px]"
        />
      )}

      <aside
        aria-label="FleetGraph assistant"
        className={cn(
          'fixed inset-y-0 right-0 z-[60] w-full max-w-[26rem] transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        )}
      >
        <div className="flex h-full flex-col border-l border-white/10 bg-[#151515]/96 shadow-[-24px_0_64px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 via-cyan-400/10 to-sky-500/20 text-emerald-100">
                    <FleetGraphGlyph className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">FleetGraph</div>
                    <div className="text-xs text-muted">Context-aware work assistant</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                    {pageContext?.kind === 'my_week' || activeView?.surface === 'my_week'
                      ? 'My Week'
                      : 'Current view'}
                  </span>
                  {latestCompletedTurn &&
                    (latestAnswerMode === 'execution' ? (
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          latestExecutionBadgeStyle.badgeClassName
                        )}
                      >
                        {latestExecutionBadgeStyle.label}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          ANSWER_MODE_STYLES[latestAnswerMode].badgeClassName
                        )}
                      >
                        {ANSWER_MODE_STYLES[latestAnswerMode].headerLabel}
                      </span>
                    ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {contextSummary ||
                    pageContext?.summary ||
                    'Ask about the work you are looking at without leaving this page.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted transition-colors hover:bg-white/10 hover:text-foreground"
                aria-label="Close FleetGraph"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={historyRef}
            className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
          >
            {turns.length === 0 ? (
              <div
                className={cn(
                  'rounded-[28px] border border-white/10 bg-gradient-to-br p-5',
                  latestSeverityStyle.accentClassName
                )}
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-black/25 text-emerald-100">
                  <FleetGraphGlyph className="h-8 w-8" />
                </div>
                <div className="mt-5 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Ask FleetGraph about this work
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {unavailableReason ??
                      pageContext?.summary ??
                      'Type a question or use a prompt below to get a grounded answer from the current page context.'}
                  </p>
                </div>

                {starterPrompts.length > 0 && (
                  <div className="mt-5 grid gap-3">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void submitQuestion(prompt, 'starter_prompt');
                        }}
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-black/30"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              turns.map((turn) => {
                const result = turn.result;
                const answerMode = getAnswerMode(result, activeView, turn.pageContext);
                const severity = result?.derivedSignals.severity ?? 'none';
                const severityStyle = SEVERITY_STYLES[severity];
                const summary = buildSummary(result, turn.pageContext);
                const responseError = result?.error?.message ?? turn.error;
                const errorGuidance = buildErrorGuidance(result, turn, activeView);
                const isBusy = activeTurnId === turn.id;
                const pendingApproval = result?.pendingApproval ?? null;
                const routeActions = getRouteActions(turn, activeView);
                const primaryRouteAction = routeActions[0] ?? null;
                const secondaryRouteActions = routeActions.slice(1);
                const derivedMetrics = result?.derivedSignals.metrics ?? null;
                const hasDerivedMetrics = Boolean(
                  derivedMetrics &&
                    (
                      derivedMetrics.totalIssues > 0 ||
                      derivedMetrics.completedIssues > 0 ||
                      derivedMetrics.inProgressIssues > 0 ||
                      derivedMetrics.standupCount > 0 ||
                      derivedMetrics.recentActiveDays > 0
                    )
                );
                const contextMetrics = turn.pageContext?.metrics ?? [];
                const showExecutionSeverityBadge =
                  answerMode === 'execution' && severity !== 'none' && hasDerivedMetrics;

                return (
                  <div key={turn.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[24px] bg-accent px-4 py-3 text-sm leading-6 text-white shadow-lg shadow-black/20">
                        {turn.question}
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="w-full max-w-full rounded-[28px] border border-white/10 bg-[#1b1b1b] p-4 shadow-lg shadow-black/20">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 via-cyan-400/10 to-sky-500/20 text-emerald-100">
                              <FleetGraphGlyph className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">FleetGraph</div>
                              <div className="text-xs text-muted">{getAssistantLabel(answerMode)}</div>
                            </div>
                          </div>
                          {result &&
                            (showExecutionSeverityBadge ? (
                              <span
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                  severityStyle.badgeClassName
                                )}
                              >
                                {severityStyle.label}
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                  answerMode === 'execution'
                                    ? EXECUTION_CONTEXT_BADGE.badgeClassName
                                    : ANSWER_MODE_STYLES[answerMode].badgeClassName
                                )}
                              >
                                {answerMode === 'execution'
                                  ? EXECUTION_CONTEXT_BADGE.label
                                  : ANSWER_MODE_STYLES[answerMode].label}
                              </span>
                            ))}
                        </div>

                        {turn.status === 'running' && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted">
                            FleetGraph is analyzing this view...
                          </div>
                        )}

                        {responseError && (
                          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
                            {errorGuidance ? (
                              <div className="space-y-4">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                    Issue detected
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-red-100">
                                    {errorGuidance.issueDetected}
                                  </p>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                    Root cause
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-red-100">
                                    {errorGuidance.rootCause}
                                  </p>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                    Impact on workflow
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-red-100">
                                    {errorGuidance.impact}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-red-400/20 bg-black/15 px-3 py-3">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                    Recommended actions
                                  </div>
                                  <ul className="mt-2 space-y-2 text-sm leading-6 text-red-100">
                                    <li><span className="font-medium">Immediate:</span> {errorGuidance.immediateFix}</li>
                                    <li><span className="font-medium">Short term:</span> {errorGuidance.shortTermFix}</li>
                                    <li><span className="font-medium">Long term:</span> {errorGuidance.longTermFix}</li>
                                  </ul>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                    PM insight
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-red-100">
                                    {errorGuidance.pmInsight}
                                  </p>
                                </div>
                                {errorGuidance.automation && (
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/75">
                                      Optional automation
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-red-100">
                                      {errorGuidance.automation}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm leading-6 text-red-200">{responseError}</p>
                            )}
                            <p className="mt-3 text-xs leading-5 text-red-200/70">
                              Technical detail: {responseError}
                            </p>
                          </div>
                        )}

                        {!summary && routeActions.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                              {answerMode === 'launcher' ? 'Best next surface' : 'Best route in Ship'}
                            </div>
                            {primaryRouteAction && (
                              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                <RouteActionLink
                                  action={primaryRouteAction}
                                  featured
                                  onInteract={() => {
                                    handleRouteActionClick(turn, primaryRouteAction, true);
                                  }}
                                />
                                {getRouteActionSupportingText(primaryRouteAction) && (
                                  <p className="mt-3 text-xs leading-6 text-muted">
                                    {getRouteActionSupportingText(primaryRouteAction)}
                                  </p>
                                )}
                              </div>
                            )}
                            {secondaryRouteActions.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Open in Ship
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {secondaryRouteActions.map((action) => (
                                    <RouteActionLink
                                      key={`${action.label}-${action.route}`}
                                      action={action}
                                      onInteract={() => {
                                        handleRouteActionClick(turn, action, false);
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {summary && (
                          <div className="mt-4 space-y-4">
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                              <p className="text-sm leading-7 text-foreground">{summary}</p>
                              {result?.reasoning?.whyNow && (
                                <p className="mt-3 text-xs leading-6 text-muted">{result.reasoning.whyNow}</p>
                              )}
                              {result?.reasoning?.recommendedNextStep && (
                                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                    {getNextStepLabel(answerMode)}
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-foreground">
                                    {result.reasoning.recommendedNextStep}
                                  </p>
                                </div>
                              )}
                            </div>

                            {hasDerivedMetrics ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Metric
                                  label="Completed"
                                  value={`${result?.derivedSignals.metrics.completedIssues ?? 0}/${result?.derivedSignals.metrics.totalIssues ?? 0}`}
                                />
                                <Metric
                                  label="In Progress"
                                  value={String(result?.derivedSignals.metrics.inProgressIssues ?? 0)}
                                />
                                <Metric
                                  label="Standups"
                                  value={String(result?.derivedSignals.metrics.standupCount ?? 0)}
                                />
                                <Metric
                                  label="Active Days"
                                  value={String(result?.derivedSignals.metrics.recentActiveDays ?? 0)}
                                />
                              </div>
                            ) : contextMetrics.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {contextMetrics.map((metric: FleetGraphPageContext['metrics'][number]) => (
                                  <Metric
                                    key={`${metric.label}-${metric.value}`}
                                    label={metric.label}
                                    value={metric.value}
                                  />
                                ))}
                              </div>
                            ) : null}

                            {result && result.derivedSignals.signals.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  What FleetGraph saw
                                </div>
                                <div className="space-y-2">
                                  {result.derivedSignals.signals.slice(0, 3).map((signal) => (
                                    <SignalItem key={signal.dedupeKey} signal={signal} />
                                  ))}
                                </div>
                              </div>
                            )}

                            {result?.reasoning?.evidence && result.reasoning.evidence.length > 0 && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Grounding evidence
                                </div>
                                <ul className="mt-2 space-y-1 text-sm leading-6 text-muted">
                                  {result.reasoning.evidence.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {routeActions.length > 0 && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  {answerMode === 'launcher' ? 'Best next surface' : 'Best route in Ship'}
                                </div>
                                {primaryRouteAction && (
                                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                    <RouteActionLink
                                      action={primaryRouteAction}
                                      featured
                                      onInteract={() => {
                                        handleRouteActionClick(turn, primaryRouteAction, true);
                                      }}
                                    />
                                    {getRouteActionSupportingText(primaryRouteAction) && (
                                      <p className="mt-3 text-xs leading-6 text-muted">
                                        {getRouteActionSupportingText(primaryRouteAction)}
                                      </p>
                                    )}
                                  </div>
                                )}
                                {secondaryRouteActions.length > 0 && (
                                  <div className="mt-3">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                      Open in Ship
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {secondaryRouteActions.map((action) => (
                                        <RouteActionLink
                                          key={`${action.label}-${action.route}`}
                                          action={action}
                                          onInteract={() => {
                                            handleRouteActionClick(turn, action, false);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {result?.proposedAction && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Proposed action
                                </div>
                                <p className="mt-2 text-sm leading-6 text-foreground">
                                  {result.proposedAction.summary}
                                </p>
                                <p className="mt-2 text-xs leading-6 text-muted">
                                  {result.proposedAction.rationale}
                                </p>
                                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                    Draft comment
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-foreground">
                                    {result.proposedAction.draftComment}
                                  </p>
                                </div>

                                {pendingApproval && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'approve');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed bg-border/70 text-muted'
                                          : 'bg-accent text-white hover:bg-accent/90'
                                      )}
                                    >
                                      Approve and post
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'dismiss');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed border-white/10 text-muted'
                                          : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                                      )}
                                    >
                                      Dismiss
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'snooze');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed border-white/10 text-muted'
                                          : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                                      )}
                                    >
                                      Snooze 4h
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {result?.actionResult && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Action outcome
                                </div>
                                <p className="mt-2 text-sm leading-6 text-foreground">
                                  {result.actionResult.summary}
                                </p>
                              </div>
                            )}

                            {turn.id === latestCompletedTurnRecord?.id &&
                              latestFollowUpPrompts.length > 0 &&
                              !pendingApproval && (
                                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                    Suggested follow-up questions
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {latestFollowUpPrompts.map((prompt) => (
                                      <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => {
                                          void submitQuestion(prompt, 'follow_up_prompt');
                                        }}
                                        disabled={!!activeTurnId}
                                        className={cn(
                                          'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                                          activeTurnId
                                            ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted'
                                            : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                                        )}
                                      >
                                        {prompt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 bg-[#121212]/90 px-5 py-4">
            {composer}
          </div>
        </div>
      </aside>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open FleetGraph"
          className="fixed bottom-5 right-5 z-[58] flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400 via-cyan-400 to-sky-500 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
        >
          <FleetGraphGlyph className="h-6 w-6" />
        </button>
      )}
    </>
  );
}

export default FleetGraphOnDemandPanel;
