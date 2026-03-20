import { useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type {
  FleetGraphActiveViewContext,
  FleetGraphPageContext,
  FleetGraphPageContextAction,
  FleetGraphPageContextActionIntent,
} from '@ship/shared';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { useDocuments } from '@/contexts/DocumentsContext';
import { useIssues } from '@/contexts/IssuesContext';
import { usePrograms } from '@/contexts/ProgramsContext';
import { useProjects } from '@/contexts/ProjectsContext';
import { apiGet } from '@/lib/api';
import type { DocumentResponse } from '@/lib/document-tabs';
import {
  getProgramId,
  getProgramTitle,
  getProjectId,
  getProjectTitle,
  getSprintId,
  getSprintTitle,
  type Issue,
} from '@/hooks/useIssuesQuery';
import { useDashboardActionItems } from '@/hooks/useDashboardActionItems';
import { useMyWeekQuery, type MyWeekResponse, type StandupSlot } from '@/hooks/useMyWeekQuery';
import { useTeamMembersQuery } from '@/hooks/useTeamMembersQuery';
import { useActiveWeeksQuery } from '@/hooks/useWeeksQuery';

type FleetGraphPageContextWithActions = FleetGraphPageContext & {
  actions?: FleetGraphPageContextAction[];
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildMetrics(
  metrics: Array<FleetGraphPageContext['metrics'][number] | null | undefined>
): FleetGraphPageContext['metrics'] {
  return metrics.filter((metric): metric is FleetGraphPageContext['metrics'][number] => Boolean(metric));
}

function buildItems(
  items: Array<FleetGraphPageContext['items'][number] | null | undefined>,
  limit = 4
): FleetGraphPageContext['items'] {
  return items.filter((item): item is FleetGraphPageContext['items'][number] => Boolean(item)).slice(0, limit);
}

function buildActions(
  actions: Array<NonNullable<FleetGraphPageContextWithActions['actions']>[number] | null | undefined>,
  limit = 4
): NonNullable<FleetGraphPageContextWithActions['actions']> {
  const seenRoutes = new Set<string>();

  return actions.filter((action): action is NonNullable<FleetGraphPageContextWithActions['actions']>[number] => {
    if (!action || seenRoutes.has(action.route)) {
      return false;
    }

    seenRoutes.add(action.route);
    return true;
  }).slice(0, limit);
}

function inferActionIntentFromLabel(label: string): FleetGraphPageContextActionIntent {
  if (/^Write\b/i.test(label)) {
    return 'write';
  }

  if (/^(Complete|Create)\b/i.test(label)) {
    return 'complete';
  }

  if (/^(Open highest-impact|Open top attention|Open risk cluster)\b/i.test(label)) {
    return 'prioritize';
  }

  if (/follow-up|follow up/i.test(label)) {
    return 'follow_up';
  }

  return 'inspect';
}

function createPageAction(
  label: string,
  route: string,
  options?: {
    intent?: FleetGraphPageContextActionIntent;
    reason?: string | null;
    owner?: string | null;
  }
): FleetGraphPageContextAction {
  return {
    label,
    route,
    intent: options?.intent ?? inferActionIntentFromLabel(label),
    reason: options?.reason ?? null,
    owner: options?.owner ?? null,
  };
}

function appendRouteSearch(
  route: string,
  params: Record<string, string | number | null | undefined>
): string {
  const [pathname, search = ''] = route.split('?');
  const searchParams = new URLSearchParams(search);

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      searchParams.delete(key);
      return;
    }

    searchParams.set(key, String(value));
  });

  const nextSearch = searchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function isDateToday(date: string): boolean {
  return date === new Date().toISOString().split('T')[0];
}

function isDateInPast(date: string): boolean {
  return date < new Date().toISOString().split('T')[0];
}

function isFridayOrLater(): boolean {
  const todayDay = new Date().getDay();
  return todayDay === 0 || todayDay >= 5;
}

function getStandupActionRoute(route: string, slot: StandupSlot | null): string | null {
  if (!slot) {
    return null;
  }

  if (slot.standup) {
    return `/documents/${slot.standup.id}`;
  }

  return appendRouteSearch(route, {
    action: 'create-standup',
    action_date: slot.date,
  });
}

type MyWeekProjectInsight = {
  project: MyWeekResponse['projects'][number];
  needsAttention: boolean;
  hasFreshActivity: boolean;
  score: number;
  summary: string;
  detail: string;
  route: string;
  actionLabel: string;
};

function formatShortUtcDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getMyWeekProjectRoute(project: MyWeekResponse['projects'][number]): string {
  return project.sprint_id ? `/documents/${project.sprint_id}/issues` : `/documents/${project.id}`;
}

function buildMyWeekProjectInsight(
  project: MyWeekResponse['projects'][number],
  week: MyWeekResponse['week']
): MyWeekProjectInsight {
  const route = getMyWeekProjectRoute(project);
  const trackedIssues = Math.max(project.issue_counts.total - project.issue_counts.cancelled, 0);
  const completedIssues = Math.min(project.issue_counts.completed, trackedIssues);
  const activeIssues = project.issue_counts.in_progress + project.issue_counts.in_review;
  const hasFreshActivity = project.activity.active_days > 0 || project.activity.updated_issue_count > 0;
  const lastUpdateDetail = project.activity.last_issue_update_at
    ? `Last issue update ${formatShortUtcDate(project.activity.last_issue_update_at)}`
    : null;

  let needsAttention = false;
  let statusLabel = 'Watching';
  let score = 25;
  let summary = `${project.title} has scoped work, but it still needs a clearer next move.`;

  if (trackedIssues === 0) {
    statusLabel = week.week_number > week.current_week_number ? 'Planning' : 'Unscoped';
    score = week.is_current ? 45 : 20;
    summary =
      week.week_number > week.current_week_number
        ? `${project.title} is assigned for Week ${week.week_number}, but no sprint issues are linked yet.`
        : `${project.title} is assigned this week, but no sprint issues are linked yet.`;
  } else if (week.week_number < week.current_week_number && completedIssues < trackedIssues) {
    needsAttention = true;
    statusLabel = 'Needs attention';
    score = 100 + (trackedIssues - completedIssues);
    summary = `${project.title} still has ${pluralize(trackedIssues - completedIssues, 'incomplete issue')} from Week ${week.week_number}.`;
  } else if (week.is_current && completedIssues === 0 && activeIssues === 0) {
    needsAttention = true;
    statusLabel = 'Needs attention';
    score = 95 + trackedIssues;
    summary = `${project.title} has ${pluralize(trackedIssues, 'tracked issue')} and none are started yet.`;
  } else if (week.is_current && !hasFreshActivity) {
    needsAttention = true;
    statusLabel = 'Needs attention';
    score = 85 + Math.max(trackedIssues - completedIssues, 0);
    summary = `${project.title} has no visible issue movement this week.`;
  } else if (week.is_current && activeIssues === 0 && completedIssues < trackedIssues) {
    needsAttention = true;
    statusLabel = 'Needs attention';
    score = 75 + Math.max(trackedIssues - completedIssues, 0);
    summary = `${project.title} still has open work, but nothing is currently in progress or review.`;
  } else if (trackedIssues > 0 && completedIssues >= trackedIssues) {
    statusLabel = 'On track';
    score = 10;
    summary = `${project.title} already has all scoped issues completed for this week.`;
  } else if (activeIssues > 0 || hasFreshActivity) {
    statusLabel = week.week_number > week.current_week_number ? 'Planning' : 'In flight';
    score = 30 + activeIssues + completedIssues;
    summary = `${project.title} has visible movement in the scoped week and is already in flight.`;
  }

  const detail = [
    statusLabel,
    trackedIssues > 0 ? `${completedIssues}/${trackedIssues} complete` : null,
    trackedIssues > completedIssues
      ? activeIssues > 0
        ? `${pluralize(activeIssues, 'issue')} active`
        : 'No active issues'
      : null,
    project.activity.active_days > 0
      ? `${pluralize(project.activity.active_days, 'active day')} in scope`
      : trackedIssues > 0
        ? week.is_current
          ? 'No issue movement this week'
          : `No issue movement in Week ${week.week_number}`
        : null,
    lastUpdateDetail,
    project.program_name ? `Program: ${project.program_name}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' • ');

  return {
    project,
    needsAttention,
    hasFreshActivity,
    score,
    summary,
    detail,
    route,
    actionLabel: project.sprint_title ? `Open ${project.title} sprint` : `Open ${project.title}`,
  };
}

function buildGenericPageContext(route: string, title: string, summary: string): FleetGraphPageContext {
  return {
    kind: 'generic',
    route,
    title,
    summary,
    emptyState: false,
    metrics: [],
    items: [],
  };
}

function buildProgramsPageContext(
  route: string,
  programs: ReturnType<typeof usePrograms>['programs']
): FleetGraphPageContext {
  const activePrograms = programs.filter((program) => !program.archived_at);
  const totalIssues = activePrograms.reduce((sum, program) => sum + (program.issue_count ?? 0), 0);
  const programsWithOwners = activePrograms.filter((program) => Boolean(program.owner)).length;
  const items = buildItems(
    [...activePrograms]
      .sort((left, right) => (right.issue_count ?? 0) - (left.issue_count ?? 0))
      .map((program) => ({
        label: program.name,
        detail: [
          program.owner?.name ? `Owner: ${program.owner.name}` : null,
          `${program.issue_count ?? 0} issues`,
          `${program.sprint_count ?? 0} weeks`,
        ]
          .filter(Boolean)
          .join(' • '),
        route: `/documents/${program.id}`,
      }))
  );

  return {
    kind: 'programs',
    route,
    title: 'Programs',
    summary:
      activePrograms.length === 0
        ? 'Programs is empty in this workspace right now.'
        : `Programs shows ${pluralize(activePrograms.length, 'active program')}. ${items[0]?.label ?? 'The first program'} is one of the main places to drill into next.`,
    emptyState: activePrograms.length === 0,
    metrics: buildMetrics([
      { label: 'Active programs', value: String(activePrograms.length) },
      { label: 'Programs with owner', value: String(programsWithOwners) },
      { label: 'Tracked issues', value: String(totalIssues) },
    ]),
    items,
  };
}

function buildProjectsPageContext(
  route: string,
  projects: ReturnType<typeof useProjects>['projects'],
  search: string
): FleetGraphPageContext {
  const searchParams = new URLSearchParams(search);
  const statusFilter = searchParams.get('status') ?? '';
  const visibleProjects = projects.filter((project) => {
    if (statusFilter === 'archived') {
      return project.inferred_status === 'archived';
    }
    if (!statusFilter) {
      return project.inferred_status !== 'archived';
    }
    return project.inferred_status === statusFilter;
  });

  const activeCount = visibleProjects.filter((project) => project.inferred_status === 'active').length;
  const ownerCount = visibleProjects.filter((project) => Boolean(project.owner)).length;
  const items = buildItems(
    [...visibleProjects]
      .sort((left, right) => (right.ice_score ?? 0) - (left.ice_score ?? 0))
      .map((project) => ({
        label: project.title,
        detail: [
          project.owner?.name ? `Owner: ${project.owner.name}` : null,
          project.ice_score !== null ? `ICE ${project.ice_score}` : null,
          `${project.issue_count} issues`,
        ]
          .filter(Boolean)
          .join(' • '),
        route: `/documents/${project.id}`,
      }))
  );

  return {
    kind: 'projects',
    route,
    title: 'Projects',
    summary:
      visibleProjects.length === 0
        ? 'Projects is empty for the current workspace or filter.'
        : `Projects shows ${pluralize(visibleProjects.length, 'project')}${statusFilter ? ` for the "${statusFilter}" filter` : ''}. ${items[0]?.label ?? 'The top project'} is a strong next place to inspect.`,
    emptyState: visibleProjects.length === 0,
    metrics: buildMetrics([
      { label: 'Visible projects', value: String(visibleProjects.length) },
      { label: 'Active', value: String(activeCount) },
      { label: 'With owner', value: String(ownerCount) },
    ]),
    items,
  };
}

function buildIssuesPageContext(
  route: string,
  issues: ReturnType<typeof useIssues>['issues'],
  search: string
): FleetGraphPageContext {
  const searchParams = new URLSearchParams(search);
  const stateFilter = searchParams.get('state') ?? '';
  const visibleIssues = stateFilter
    ? issues.filter((issue) => issue.state === stateFilter)
    : issues;
  const inProgressCount = visibleIssues.filter((issue) => issue.state === 'in_progress').length;
  const completedCount = visibleIssues.filter((issue) => issue.state === 'done').length;
  const items = buildItems(
    [...visibleIssues]
      .sort((left, right) => right.ticket_number - left.ticket_number)
      .map((issue) => ({
        label: issue.display_id ? `${issue.display_id} ${issue.title}` : issue.title,
        detail: [
          `State: ${issue.state}`,
          issue.priority ? `Priority: ${issue.priority}` : null,
          getProjectTitle(issue) ? `Project: ${getProjectTitle(issue)}` : null,
        ]
          .filter(Boolean)
          .join(' • '),
        route: `/documents/${issue.id}`,
      }))
  );

  return {
    kind: 'issues',
    route,
    title: 'Issues',
    summary:
      visibleIssues.length === 0
        ? 'Issues is empty for the current workspace or filter.'
        : `Issues shows ${pluralize(visibleIssues.length, 'issue')}${stateFilter ? ` in the "${stateFilter}" state` : ''}. ${items[0]?.label ?? 'The latest issue'} is one of the first places to inspect.`,
    emptyState: visibleIssues.length === 0,
    metrics: buildMetrics([
      { label: 'Visible issues', value: String(visibleIssues.length) },
      { label: 'In progress', value: String(inProgressCount) },
      { label: 'Completed', value: String(completedCount) },
    ]),
    items,
  };
}

function buildDocumentsPageContext(
  route: string,
  documents: ReturnType<typeof useDocuments>['documents']
): FleetGraphPageContext {
  const privateCount = documents.filter((document) => document.visibility === 'private').length;
  const workspaceCount = documents.length - privateCount;
  const items = buildItems(
    [...documents]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      )
      .map((document) => ({
        label: document.title,
        detail: `${document.visibility === 'private' ? 'Private' : 'Workspace'} ${document.document_type}`,
        route: `/documents/${document.id}`,
      }))
  );

  return {
    kind: 'documents',
    route,
    title: 'Documents',
    summary:
      documents.length === 0
        ? 'Documents is empty in this workspace right now.'
        : `Documents shows ${pluralize(documents.length, 'document')}. ${items[0]?.label ?? 'The latest document'} is the freshest item on this page.`,
    emptyState: documents.length === 0,
    metrics: buildMetrics([
      { label: 'Documents', value: String(documents.length) },
      { label: 'Workspace docs', value: String(workspaceCount) },
      { label: 'Private docs', value: String(privateCount) },
    ]),
    items,
  };
}

type IssueSurfaceScope = {
  type: 'program' | 'project';
  id: string;
  title: string;
};

type IssueSurfaceBucket = {
  id: string | null;
  title: string;
  route: string | null;
  total: number;
  open: number;
  notStarted: number;
  active: number;
};

type IssueSurfaceProject = ReturnType<typeof useProjects>['projects'][number];

type ScoredIssueSurfaceIssue = {
  issue: Issue;
  project: IssueSurfaceProject | null;
  businessValueScore: number | null;
  businessDrivers: string | null;
  executionAttentionScore: number;
  combinedAttentionScore: number;
};

function getPriorityRank(priority: string | null | undefined): number {
  switch (priority) {
    case 'urgent':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
    default:
      return 4;
  }
}

function getIssuePriorityAttentionWeight(priority: string | null | undefined): number {
  switch (priority) {
    case 'urgent':
      return 28;
    case 'high':
      return 22;
    case 'medium':
      return 14;
    case 'low':
      return 8;
    default:
      return 4;
  }
}

function formatRelativeIssueUpdate(updatedAt: string | undefined): string | null {
  if (!updatedAt) {
    return null;
  }

  const timestamp = new Date(updatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) {
    return `Updated ${diffHours}h ago`;
  }

  const diffDays = Math.max(1, Math.round(diffHours / 24));
  return `Updated ${diffDays}d ago`;
}

function isIssueStale(issue: Issue): boolean {
  if (!issue.updated_at || issue.state === 'done' || issue.state === 'cancelled') {
    return false;
  }

  const diffMs = Date.now() - new Date(issue.updated_at).getTime();
  return diffMs >= 1000 * 60 * 60 * 24 * 3;
}

function getProjectBusinessValueScore(project: IssueSurfaceProject | null): number | null {
  if (!project) {
    return null;
  }

  if (typeof project.business_value_score === 'number') {
    return project.business_value_score;
  }

  if (typeof project.ice_score === 'number') {
    return Math.round((project.ice_score / 125) * 100);
  }

  return null;
}

function describeProjectBusinessDrivers(project: IssueSurfaceProject | null): string | null {
  if (!project) {
    return null;
  }

  const scoredDrivers = [
    { label: 'ROI', value: project.roi },
    { label: 'Retention', value: project.retention },
    { label: 'Acquisition', value: project.acquisition },
    { label: 'Growth', value: project.growth },
  ]
    .filter((driver): driver is { label: string; value: number } => typeof driver.value === 'number')
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  if (scoredDrivers.length === 0) {
    return typeof project.ice_score === 'number' ? `ICE fallback ${project.ice_score}/125` : null;
  }

  return scoredDrivers
    .slice(0, 2)
    .map((driver) => `${driver.label} ${driver.value}/5`)
    .join(' + ');
}

function computeIssueExecutionAttentionScore(issue: Issue, focusBucket: IssueSurfaceBucket | null): number {
  let score = getIssuePriorityAttentionWeight(issue.priority);

  if (issue.state === 'triage' || issue.state === 'backlog' || issue.state === 'todo') {
    score += 16;
  }

  if (issue.state === 'in_progress' || issue.state === 'in_review') {
    score += 8;
  }

  if (isIssueStale(issue)) {
    score += 20;
  }

  if (!issue.assignee_id) {
    score += 10;
  }

  const sprintId = getSprintId(issue);
  const sprintTitle = getSprintTitle(issue);
  if (focusBucket && ((focusBucket.id && focusBucket.id === sprintId) || focusBucket.title === sprintTitle)) {
    score += 10;
  }

  return Math.min(score, 100);
}

function getIssueSurfaceScopeIssueFilter(scope: IssueSurfaceScope) {
  return (issue: Issue) =>
    scope.type === 'program' ? getProgramId(issue) === scope.id : getProjectId(issue) === scope.id;
}

export function buildIssueSurfacePageContext(
  route: string,
  scope: IssueSurfaceScope,
  scopedIssues: Issue[],
  projects: IssueSurfaceProject[]
): FleetGraphPageContextWithActions {
  const visibleIssues = [...scopedIssues].sort((left, right) => {
    const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.ticket_number - left.ticket_number;
  });
  const openIssues = visibleIssues.filter(
    (issue) => issue.state !== 'done' && issue.state !== 'cancelled'
  );
  const doneCount = visibleIssues.filter((issue) => issue.state === 'done').length;
  const cancelledCount = visibleIssues.filter((issue) => issue.state === 'cancelled').length;
  const inProgressCount = visibleIssues.filter((issue) => issue.state === 'in_progress').length;
  const inReviewCount = visibleIssues.filter((issue) => issue.state === 'in_review').length;
  const notStartedIssues = visibleIssues.filter((issue) =>
    issue.state === 'triage' || issue.state === 'backlog' || issue.state === 'todo'
  );
  const staleOpenIssues = openIssues.filter(isIssueStale);
  const assigneeCount = new Set(
    openIssues
      .map((issue) => issue.assignee_name?.trim().toLowerCase() ?? null)
      .filter((value): value is string => Boolean(value))
  ).size;

  const sprintBuckets = new Map<string, IssueSurfaceBucket>();
  for (const issue of openIssues) {
    const sprintId = getSprintId(issue);
    const sprintTitle = getSprintTitle(issue) ?? 'Backlog';
    const key = sprintId ?? `backlog:${sprintTitle}`;
    const existing = sprintBuckets.get(key) ?? {
      id: sprintId,
      title: sprintTitle,
      route: sprintId ? `/documents/${sprintId}/issues` : null,
      total: 0,
      open: 0,
      notStarted: 0,
      active: 0,
    };

    existing.total += 1;
    existing.open += 1;
    if (issue.state === 'in_progress' || issue.state === 'in_review') {
      existing.active += 1;
    }
    if (issue.state === 'triage' || issue.state === 'backlog' || issue.state === 'todo') {
      existing.notStarted += 1;
    }

    sprintBuckets.set(key, existing);
  }

  const focusBucket =
    [...sprintBuckets.values()].sort((left, right) => {
      if (right.open !== left.open) {
        return right.open - left.open;
      }
      if (right.notStarted !== left.notStarted) {
        return right.notStarted - left.notStarted;
      }
      return right.active - left.active;
    })[0] ?? null;

  const topAttentionIssues = [...openIssues].sort((left, right) => {
    const staleDelta = Number(isIssueStale(right)) - Number(isIssueStale(left));
    if (staleDelta !== 0) {
      return staleDelta;
    }

    const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.ticket_number - left.ticket_number;
  });

  const projectById = new Map(projects.map((project) => [project.id, project] as const));
  const scoredOpenIssues = openIssues
    .map((issue): ScoredIssueSurfaceIssue => {
      const project = projectById.get(getProjectId(issue) ?? '') ?? null;
      const businessValueScore = getProjectBusinessValueScore(project);
      const executionAttentionScore = computeIssueExecutionAttentionScore(issue, focusBucket);

      return {
        issue,
        project,
        businessValueScore,
        businessDrivers: describeProjectBusinessDrivers(project),
        executionAttentionScore,
        combinedAttentionScore:
          businessValueScore === null
            ? executionAttentionScore
            : Math.round(executionAttentionScore * 0.6 + businessValueScore * 0.4),
      };
    })
    .sort((left, right) => {
      if (right.combinedAttentionScore !== left.combinedAttentionScore) {
        return right.combinedAttentionScore - left.combinedAttentionScore;
      }

      if ((right.businessValueScore ?? -1) !== (left.businessValueScore ?? -1)) {
        return (right.businessValueScore ?? -1) - (left.businessValueScore ?? -1);
      }

      return right.issue.ticket_number - left.issue.ticket_number;
    });

  const topImpactIssue =
    [...scoredOpenIssues].sort((left, right) => {
      if ((right.businessValueScore ?? -1) !== (left.businessValueScore ?? -1)) {
        return (right.businessValueScore ?? -1) - (left.businessValueScore ?? -1);
      }

      if (right.executionAttentionScore !== left.executionAttentionScore) {
        return right.executionAttentionScore - left.executionAttentionScore;
      }

      return right.issue.ticket_number - left.issue.ticket_number;
    })[0] ?? null;

  const topAttentionIssue = scoredOpenIssues[0] ?? null;

  const summary = (() => {
    if (visibleIssues.length === 0) {
      return `${scope.title} has no visible issues on this tab yet.`;
    }

    if (openIssues.length === 0) {
      return `${scope.title} does not show an active delivery blocker on this issues surface right now. All visible issues are already done or cancelled.`;
    }

    if (staleOpenIssues.length > 0) {
      return `${scope.title} has visible delivery risk from stale work. ${pluralize(staleOpenIssues.length, 'open issue')} have not moved in at least 3 days${focusBucket ? `, and ${focusBucket.title} is carrying the heaviest open cluster.` : '.'}`;
    }

    if (notStartedIssues.length > inProgressCount + inReviewCount) {
      return `${scope.title} does not show a named blocker on this issues surface, but delivery risk is building in scope that has not started yet. ${pluralize(notStartedIssues.length, 'visible issue')} are still sitting in triage, backlog, or todo${focusBucket ? `, led by ${focusBucket.title}.` : '.'}`;
    }

    if (focusBucket && focusBucket.notStarted > 0) {
      return `${scope.title} has active delivery work, but ${focusBucket.title} carries the biggest risk cluster with ${pluralize(focusBucket.open, 'open issue')} and ${pluralize(focusBucket.notStarted, 'issue')} still not started.${topImpactIssue?.issue.display_id ? ` The highest-value visible issue is ${topImpactIssue.issue.display_id}.` : ''}`;
    }

    return `${scope.title} shows active movement on this issues surface. ${pluralize(inProgressCount + inReviewCount, 'issue')} are already in progress or review, so the main question is scope balance rather than a visible blocker.${topImpactIssue?.issue.display_id ? ` The highest-value visible issue is ${topImpactIssue.issue.display_id}.` : ''}`;
  })();
  const topImpactActionReason = topImpactIssue
    ? [
        `${topImpactIssue.issue.display_id ?? `#${topImpactIssue.issue.ticket_number}`} carries the strongest business value signal on this tab.`,
        topImpactIssue.businessValueScore !== null
          ? `Business value ${topImpactIssue.businessValueScore}/100.`
          : null,
        topImpactIssue.businessDrivers ? `${topImpactIssue.businessDrivers}.` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;
  const focusBucketActionReason = focusBucket
    ? `${focusBucket.title} holds ${pluralize(focusBucket.open, 'open issue')} with ${pluralize(focusBucket.notStarted, 'issue')} still not started.`
    : null;

  return {
    kind: 'issue_surface',
    route,
    title: `${scope.title} Issues`,
    summary,
    emptyState: visibleIssues.length === 0,
    metrics: buildMetrics([
      { label: 'Visible issues', value: String(visibleIssues.length) },
      { label: 'Not started', value: String(notStartedIssues.length) },
      { label: 'In progress', value: String(inProgressCount) },
      { label: 'In review', value: String(inReviewCount) },
      { label: 'Stale open', value: String(staleOpenIssues.length) },
      focusBucket ? { label: 'Risk cluster', value: focusBucket.title } : null,
      topImpactIssue?.issue.display_id
        ? { label: 'Highest impact issue', value: topImpactIssue.issue.display_id }
        : null,
      topImpactIssue?.project?.title
        ? { label: 'Highest impact project', value: topImpactIssue.project.title }
        : null,
      topImpactIssue?.businessValueScore !== null && topImpactIssue?.businessValueScore !== undefined
        ? { label: 'Business value', value: `${topImpactIssue.businessValueScore}/100` }
        : null,
      topAttentionIssue?.issue.display_id
        ? { label: 'Top attention issue', value: topAttentionIssue.issue.display_id }
        : null,
      assigneeCount > 0 ? { label: 'Assignees', value: String(assigneeCount) } : null,
      doneCount > 0 || cancelledCount > 0
        ? { label: 'Closed', value: String(doneCount + cancelledCount) }
        : null,
    ]),
    items: buildItems([
      topImpactIssue
        ? {
            label: topImpactIssue.issue.display_id
              ? `${topImpactIssue.issue.display_id} ${topImpactIssue.issue.title}`
              : topImpactIssue.issue.title,
            detail: [
              'Highest impact',
              topImpactIssue.project?.title ? `Project: ${topImpactIssue.project.title}` : null,
              topImpactIssue.businessValueScore !== null
                ? `Business value: ${topImpactIssue.businessValueScore}/100`
                : null,
              topImpactIssue.businessDrivers ? `Drivers: ${topImpactIssue.businessDrivers}` : null,
            ]
              .filter(Boolean)
              .join(' • '),
            route: `/documents/${topImpactIssue.issue.id}`,
          }
        : null,
      focusBucket
        ? {
            label: focusBucket.title,
            detail: `${pluralize(focusBucket.open, 'open issue')} • ${pluralize(focusBucket.active, 'issue')} active • ${pluralize(focusBucket.notStarted, 'issue')} not started`,
            route: focusBucket.route,
          }
        : null,
      ...topAttentionIssues
        .filter((issue) => issue.id !== topImpactIssue?.issue.id)
        .slice(0, 2)
        .map((issue) => ({
        label: issue.display_id ? `${issue.display_id} ${issue.title}` : issue.title,
        detail: [
          `State: ${issue.state}`,
          getSprintTitle(issue) ? `Week: ${getSprintTitle(issue)}` : 'Backlog',
          issue.assignee_name ? `Owner: ${issue.assignee_name}` : null,
          formatRelativeIssueUpdate(issue.updated_at),
        ]
          .filter(Boolean)
          .join(' • '),
        route: `/documents/${issue.id}`,
        })),
    ]),
    actions: buildActions([
      topImpactIssue
        ? createPageAction(
            `Open highest-impact ${topImpactIssue.issue.display_id ?? `#${topImpactIssue.issue.ticket_number}`}`,
            `/documents/${topImpactIssue.issue.id}`,
            {
              intent: 'prioritize',
              reason: topImpactActionReason,
              owner: topImpactIssue.issue.assignee_name,
            }
          )
        : null,
      focusBucket?.route
        ? createPageAction(`Open risk cluster ${focusBucket.title}`, focusBucket.route, {
            intent: 'prioritize',
            reason: focusBucketActionReason,
          })
        : null,
      ...topAttentionIssues
        .filter((issue) => issue.id !== topImpactIssue?.issue.id)
        .slice(0, 2)
        .map((issue) =>
          createPageAction(`Open ${issue.display_id ?? `#${issue.ticket_number}`}`, `/documents/${issue.id}`, {
            intent:
              isIssueStale(issue) || !issue.assignee_id
                ? 'follow_up'
                : 'inspect',
            reason: [
              `State: ${issue.state}.`,
              getSprintTitle(issue) ? `${getSprintTitle(issue)}.` : null,
              issue.assignee_name ? `Owner: ${issue.assignee_name}.` : 'Owner is still unclear.',
              formatRelativeIssueUpdate(issue.updated_at)
                ? `${formatRelativeIssueUpdate(issue.updated_at)}.`
                : null,
            ]
              .filter(Boolean)
              .join(' '),
            owner: issue.assignee_name,
          })
        ),
    ]),
  };
}

function buildDashboardPageContext(
  route: string,
  view: string | null,
  activeWeeks: ReturnType<typeof useActiveWeeksQuery>['data'],
  projects: ReturnType<typeof useProjects>['projects'],
  actionItems: ReturnType<typeof useDashboardActionItems>['data']
): FleetGraphPageContext {
  const weeks = activeWeeks?.weeks ?? [];
  const actions = actionItems?.action_items ?? [];
  const activeProjects = projects.filter((project) => !project.archived_at);
  const overdueCount = actions.filter((item) => item.urgency === 'overdue').length;
  const items = buildItems(
    overdueCount > 0
      ? actions
          .filter((item) => item.urgency === 'overdue')
          .map((item) => ({
            label: `${item.program_name} Week ${item.sprint_number}`,
            detail: item.message,
            route: `/documents/${item.sprint_id}`,
          }))
      : weeks.map((week) => ({
          label: week.name,
          detail: `${week.program_name} • ${week.days_remaining} days remaining`,
          route: `/documents/${week.id}`,
        }))
  );

  return {
    kind: 'dashboard',
    route,
    title: view === 'overview' ? 'Dashboard' : 'My Work',
    summary:
      overdueCount > 0
        ? `Dashboard is surfacing ${pluralize(overdueCount, 'overdue action item')} right now.`
        : `Dashboard shows ${pluralize(weeks.length, 'active week')} and ${pluralize(activeProjects.length, 'active project')}.`,
    emptyState: weeks.length === 0 && activeProjects.length === 0 && actions.length === 0,
    metrics: buildMetrics([
      { label: 'Active weeks', value: String(weeks.length) },
      { label: 'Active projects', value: String(activeProjects.length) },
      { label: 'Action items', value: String(actions.length) },
    ]),
    items,
  };
}

function buildTeamDirectoryPageContext(
  route: string,
  people: NonNullable<ReturnType<typeof useTeamMembersQuery>['data']>
): FleetGraphPageContext {
  const pendingCount = people.filter((person) => person.isPending).length;
  const items = buildItems(
    people.map((person) => ({
      label: person.name,
      detail: person.email ?? (person.isPending ? 'Pending invite' : null),
      route: `/team/${person.id}`,
    }))
  );

  return {
    kind: 'team_directory',
    route,
    title: 'Team Directory',
    summary:
      people.length === 0
        ? 'Team Directory is empty in this workspace right now.'
        : `Team Directory shows ${pluralize(people.length, 'team member')}. ${pendingCount > 0 ? `${pluralize(pendingCount, 'invite')} are still pending.` : 'Everyone shown here is already in the workspace.'}`,
    emptyState: people.length === 0,
    metrics: buildMetrics([
      { label: 'Team members', value: String(people.length) },
      { label: 'Pending invites', value: String(pendingCount) },
    ]),
    items,
  };
}

function buildPersonPageContext(
  route: string,
  person: { id: string; name: string; email?: string } | null
): FleetGraphPageContext {
  if (!person) {
    return {
      kind: 'person',
      route,
      title: 'Person',
      summary: 'This person page is loading or the person is not available in the current workspace.',
      emptyState: true,
      metrics: [],
      items: [],
    };
  }

  return {
    kind: 'person',
    route,
    title: person.name,
    summary: `${person.name}'s profile is open on this page.`,
    emptyState: false,
    metrics: buildMetrics([
      person.email ? { label: 'Email', value: person.email } : null,
    ]),
    items: [],
  };
}

export function buildMyWeekPageContext(
  route: string,
  activeView: FleetGraphActiveViewContext | null,
  myWeek: MyWeekResponse | undefined
): FleetGraphPageContextWithActions {
  if (!myWeek) {
    return {
      kind: 'my_week',
      route,
      title: 'My Week',
      summary: activeView?.projectId
        ? 'My Week is currently narrowed to a single project, so FleetGraph can reason about both this page and the linked weekly work.'
        : 'My Week is the current weekly planning and execution surface for your work.',
      emptyState: false,
      metrics: buildMetrics([
        activeView?.projectId ? { label: 'Single project scope', value: 'Yes' } : null,
      ]),
      items: [],
    };
  }

  const { week, plan, retro, previous_retro, standups, projects } = myWeek;
  const isScopedToSingleProject = Boolean(activeView?.projectId);
  const scopedProject =
    projects.find((project) => project.id === activeView?.projectId) ??
    (projects.length === 1 ? projects[0] : null);
  const projectInsights = (isScopedToSingleProject && scopedProject ? [scopedProject] : projects)
    .map((project) => buildMyWeekProjectInsight(project, week))
    .sort((left, right) => right.score - left.score || left.project.title.localeCompare(right.project.title));
  const relevantStandupSlots = standups.filter((slot) => !(!isDateInPast(slot.date) && !isDateToday(slot.date)));
  const loggedStandupCount = relevantStandupSlots.filter((slot) => Boolean(slot.standup)).length;
  const missingPastStandups = standups.filter((slot) => !slot.standup && isDateInPast(slot.date)).length;
  const todayStandupSlot = standups.find((slot) => isDateToday(slot.date)) ?? null;
  const lastLoggedStandup =
    [...standups]
      .filter((slot) => Boolean(slot.standup))
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  const hasProjects = projects.length > 0;
  const planIsDue = hasProjects && week.week_number <= week.current_week_number;
  const retroIsDue =
    hasProjects &&
    (week.week_number < week.current_week_number ||
      (week.week_number === week.current_week_number && isFridayOrLater()));
  const showPreviousRetroNudge =
    week.is_current &&
    previous_retro &&
    (previous_retro.id ? !previous_retro.submitted_at : true);
  const previousRetroRoute = previous_retro
    ? previous_retro.id
      ? `/documents/${previous_retro.id}`
      : appendRouteSearch(route, {
          action: 'create-retro',
          action_week_number: previous_retro.week_number,
        })
    : null;
  const planItemCount = plan?.items?.length ?? 0;
  const retroItemCount = retro?.items?.length ?? 0;
  const standupMetricValue =
    relevantStandupSlots.length > 0 ? `${loggedStandupCount}/${relevantStandupSlots.length}` : '0';

  const planStatus = (() => {
    if (!plan) {
      return {
        metric: planIsDue ? 'Missing' : 'Not started',
        detail: planIsDue
          ? `No weekly plan exists for Week ${week.week_number}, and it should be in flight now.`
          : `No weekly plan exists for Week ${week.week_number} yet.`,
        route: appendRouteSearch(route, { action: 'create-plan', action_week_number: null }),
        actionLabel: 'Create plan',
        needsAttention: planIsDue,
      };
    }

    if (plan.submitted_at) {
      return {
        metric: 'Submitted',
        detail: `Weekly plan is submitted with ${pluralize(planItemCount, 'item')}.`,
        route: `/documents/${plan.id}`,
        actionLabel: 'Open plan',
        needsAttention: false,
      };
    }

    if (planItemCount > 0) {
      return {
        metric: 'Unsubmitted',
        detail: planIsDue
          ? `Weekly plan has ${pluralize(planItemCount, 'item')} but is still unsubmitted.`
          : `Weekly plan has ${pluralize(planItemCount, 'item')} and is still in draft.`,
        route: `/documents/${plan.id}`,
        actionLabel: 'Open plan',
        needsAttention: planIsDue,
      };
    }

    return {
      metric: planIsDue ? 'Due today' : 'Blank',
      detail: planIsDue
        ? 'Weekly plan exists, but it is still blank and unsubmitted.'
        : 'Weekly plan exists, but it is still blank.',
      route: `/documents/${plan.id}`,
      actionLabel: 'Open plan',
      needsAttention: planIsDue,
    };
  })();

  const retroStatus = (() => {
    if (!retro) {
      return {
        metric: retroIsDue ? 'Missing' : 'Not started',
        detail: retroIsDue
          ? `No weekly retro exists for Week ${week.week_number}, and review follow-up is due.`
          : `No weekly retro exists for Week ${week.week_number} yet.`,
        route: appendRouteSearch(route, { action: 'create-retro', action_week_number: null }),
        actionLabel: 'Create retro',
        needsAttention: retroIsDue,
      };
    }

    if (retro.submitted_at) {
      return {
        metric: 'Submitted',
        detail: `Weekly retro is submitted with ${pluralize(retroItemCount, 'item')}.`,
        route: `/documents/${retro.id}`,
        actionLabel: 'Open retro',
        needsAttention: false,
      };
    }

    if (retroItemCount > 0) {
      return {
        metric: 'Unsubmitted',
        detail: retroIsDue
          ? `Weekly retro has ${pluralize(retroItemCount, 'item')} but is still unsubmitted.`
          : `Weekly retro has ${pluralize(retroItemCount, 'item')} and is still in draft.`,
        route: `/documents/${retro.id}`,
        actionLabel: 'Open retro',
        needsAttention: retroIsDue,
      };
    }

    return {
      metric: retroIsDue ? 'Due today' : 'Blank',
      detail: retroIsDue
        ? 'Weekly retro exists, but it is still blank and unsubmitted.'
        : 'Weekly retro exists, but it is still blank.',
      route: `/documents/${retro.id}`,
      actionLabel: 'Open retro',
      needsAttention: retroIsDue,
    };
  })();

  const standupStatus = (() => {
    if (todayStandupSlot?.standup) {
      return {
        metric: 'Up to date',
        detail: `Today’s update is logged. ${loggedStandupCount}/${Math.max(relevantStandupSlots.length, 1)} in-scope updates are posted.`,
        route: `/documents/${todayStandupSlot.standup.id}`,
        actionLabel: 'Open today update',
        needsAttention: false,
      };
    }

    if (todayStandupSlot && !todayStandupSlot.standup) {
      return {
        metric: 'Missing today',
        detail:
          missingPastStandups > 0
            ? `Today’s update is still missing, and ${pluralize(missingPastStandups, 'earlier update')} are also missing.`
            : 'Today’s update is still missing.',
        route: getStandupActionRoute(route, todayStandupSlot),
        actionLabel: 'Write today update',
        needsAttention: true,
      };
    }

    if (missingPastStandups > 0) {
      const oldestMissingSlot = standups.find((slot) => !slot.standup && isDateInPast(slot.date)) ?? null;

      return {
        metric: 'Missing updates',
        detail: `${pluralize(missingPastStandups, 'daily update')} are still missing for this week.`,
        route: getStandupActionRoute(route, oldestMissingSlot),
        actionLabel: 'Write update',
        needsAttention: true,
      };
    }

    if (lastLoggedStandup?.standup) {
      return {
        metric: 'Logged',
        detail: `Latest daily update was posted on ${lastLoggedStandup.day}.`,
        route: `/documents/${lastLoggedStandup.standup.id}`,
        actionLabel: 'Open latest update',
        needsAttention: false,
      };
    }

    const firstAvailableStandupSlot = relevantStandupSlots[0] ?? standups[0] ?? null;

    return {
      metric: 'Not started',
      detail: 'No daily updates have been logged for this week yet.',
      route: getStandupActionRoute(route, firstAvailableStandupSlot),
      actionLabel: firstAvailableStandupSlot ? 'Write first update' : null,
      needsAttention: relevantStandupSlots.length > 0,
    };
  })();

  const workflowStage =
    week.week_number > week.current_week_number
      ? 'Planning'
      : showPreviousRetroNudge || retroStatus.needsAttention
        ? 'Review'
        : planStatus.needsAttention
          ? 'Planning'
          : week.is_current
            ? 'Execution'
            : 'Review';

  const attentionSignals = [
    planStatus.needsAttention ? planStatus.detail : null,
    standupStatus.needsAttention ? standupStatus.detail : null,
    showPreviousRetroNudge
      ? previous_retro?.id
        ? `Week ${previous_retro.week_number} retro still needs your input.`
        : `Week ${previous_retro?.week_number} retro still needs to be created.`
      : null,
    retroStatus.needsAttention ? retroStatus.detail : null,
  ].filter((signal): signal is string => Boolean(signal));
  const attentionProjectInsights = projectInsights.filter((project) => project.needsAttention);
  const freshProjectCount = projectInsights.filter((project) => project.hasFreshActivity).length;
  const topProjectInsight = attentionProjectInsights[0] ?? projectInsights[0] ?? null;

  const projectSummary =
    projects.length === 0
      ? 'My Week has no assigned projects in scope right now.'
      : isScopedToSingleProject && scopedProject
        ? `My Week is narrowed to ${scopedProject.title}.`
        : `My Week covers ${pluralize(projects.length, 'assigned project')}.`;
  const steadyStateSummary =
    `${planStatus.detail} ${retroStatus.detail} ${standupStatus.detail}`;
  const topProjectSummary = topProjectInsight?.summary ?? null;
  const projectSignalMetricValue =
    projectInsights.length === 0
      ? 'No project scope'
      : isScopedToSingleProject && projectInsights[0]
        ? projectInsights[0].needsAttention
          ? 'Needs attention'
          : projectInsights[0].hasFreshActivity
            ? 'Fresh activity'
            : 'In scope'
        : attentionProjectInsights.length > 0
          ? `${attentionProjectInsights.length}/${projectInsights.length} flagged`
          : `${freshProjectCount}/${projectInsights.length} fresh`;

  return {
    kind: 'my_week',
    route,
    title: 'My Week',
    summary:
      attentionSignals.length > 0 || topProjectSummary
        ? `${projectSummary} ${topProjectSummary ? `${topProjectSummary} ` : ''}${attentionSignals.length > 0 ? `Right now, ${attentionSignals.slice(0, 3).join(' ')}` : ''}`.trim()
        : `${projectSummary} ${steadyStateSummary}`,
    emptyState: false,
    metrics: buildMetrics([
      { label: 'Workflow stage', value: workflowStage },
      { label: 'Project signals', value: projectSignalMetricValue },
      { label: 'Weekly plan', value: planStatus.metric },
      { label: 'Weekly retro', value: retroStatus.metric },
      { label: 'Daily updates', value: standupMetricValue },
      activeView?.projectId ? { label: 'Single project scope', value: 'Yes' } : null,
    ]),
    items: buildItems([
      { label: 'Weekly plan', detail: planStatus.detail, route: planStatus.route },
      showPreviousRetroNudge && previous_retro
        ? {
            label: `Week ${previous_retro.week_number} retro`,
            detail: previous_retro.id
              ? 'Last week’s retro is still open and needs input.'
              : 'Last week’s retro has not been created yet.',
            route: previousRetroRoute,
          }
        : {
            label: 'Weekly retro',
            detail: retroStatus.detail,
            route: retroStatus.route,
          },
      { label: 'Daily updates', detail: standupStatus.detail, route: standupStatus.route },
      ...projectInsights.slice(0, isScopedToSingleProject ? 1 : 2).map((projectInsight) => ({
        label: projectInsight.project.title,
        detail: projectInsight.detail,
        route: projectInsight.route,
      })),
    ], isScopedToSingleProject ? 4 : 5),
    actions: buildActions([
      ...attentionProjectInsights
        .slice(0, isScopedToSingleProject ? 1 : 2)
        .map((projectInsight) =>
          createPageAction(projectInsight.actionLabel, projectInsight.route, {
            intent: projectInsight.needsAttention ? 'follow_up' : 'inspect',
            reason: projectInsight.detail,
          })
        ),
      standupStatus.route && standupStatus.actionLabel
        ? createPageAction(standupStatus.actionLabel, standupStatus.route, {
            intent: standupStatus.actionLabel.startsWith('Write') ? 'write' : 'inspect',
            reason: standupStatus.detail,
          })
        : null,
      planStatus.route && planStatus.actionLabel
        ? createPageAction(planStatus.actionLabel, planStatus.route, {
            intent: planStatus.actionLabel.startsWith('Complete') ? 'complete' : 'inspect',
            reason: planStatus.detail,
          })
        : null,
      previousRetroRoute && showPreviousRetroNudge
        ? createPageAction(
            previous_retro?.id ? 'Complete last retro' : 'Create last retro',
            previousRetroRoute,
            {
              intent: 'complete',
              reason: previous_retro?.id
                ? `Week ${previous_retro.week_number} retro is still open and needs to be closed out.`
                : `Week ${previous_retro?.week_number} retro still needs to be created.`,
            }
          )
        : null,
      retroStatus.route && retroStatus.actionLabel
        ? createPageAction(retroStatus.actionLabel, retroStatus.route, {
            intent: retroStatus.actionLabel.startsWith('Complete') ? 'complete' : 'inspect',
            reason: retroStatus.detail,
          })
        : null,
      ...projectInsights.slice(0, isScopedToSingleProject ? 1 : 2).map((projectInsight) =>
        createPageAction(projectInsight.actionLabel, projectInsight.route, {
          intent: projectInsight.needsAttention ? 'follow_up' : 'inspect',
          reason: projectInsight.detail,
        })
      ),
    ]),
  };
}

function buildDocumentPageContext(
  route: string,
  document: DocumentResponse,
  activeView: FleetGraphActiveViewContext | null,
  programs: ReturnType<typeof usePrograms>['programs'],
  projects: ReturnType<typeof useProjects>['projects'],
  issues: ReturnType<typeof useIssues>['issues'],
  people: NonNullable<ReturnType<typeof useTeamMembersQuery>['data']>
): FleetGraphPageContext {
  const program = programs.find((candidate) => candidate.id === document.id);
  const project = projects.find((candidate) => candidate.id === document.id);
  const issue = issues.find((candidate) => candidate.id === document.id);
  const person = people.find((candidate) => candidate.id === document.id);
  const tabLabel = activeView?.tab ? `Tab: ${activeView.tab}` : null;

  if (activeView?.tab === 'issues' && document.document_type === 'program') {
    return buildIssueSurfacePageContext(
      route,
      {
        type: 'program',
        id: document.id,
        title: document.title,
      },
      issues.filter(getIssueSurfaceScopeIssueFilter({
        type: 'program',
        id: document.id,
        title: document.title,
      })),
      projects
    );
  }

  if (activeView?.tab === 'issues' && document.document_type === 'project') {
    return buildIssueSurfacePageContext(
      route,
      {
        type: 'project',
        id: document.id,
        title: document.title,
      },
      issues.filter(getIssueSurfaceScopeIssueFilter({
        type: 'project',
        id: document.id,
        title: document.title,
      })),
      projects
    );
  }

  if (document.document_type === 'program') {
    return {
      kind: 'document',
      route,
      title: document.title,
      summary: `${document.title} is the current program document.${program ? ` It tracks ${program.issue_count ?? 0} issues across ${program.sprint_count ?? 0} weeks.` : ''}`,
      emptyState: false,
      metrics: buildMetrics([
        program ? { label: 'Issues', value: String(program.issue_count ?? 0) } : null,
        program ? { label: 'Weeks', value: String(program.sprint_count ?? 0) } : null,
        program?.owner?.name ? { label: 'Owner', value: program.owner.name } : null,
      ]),
      items: buildItems([
        tabLabel ? { label: tabLabel } : null,
      ]),
    };
  }

  if (document.document_type === 'project') {
    return {
      kind: 'document',
      route,
      title: document.title,
      summary: `${document.title} is the current project document.${project ? ` It is showing ${project.issue_count} issues and ${project.sprint_count} weeks.` : ''}`,
      emptyState: false,
      metrics: buildMetrics([
        project ? { label: 'Issues', value: String(project.issue_count) } : null,
        project ? { label: 'Weeks', value: String(project.sprint_count) } : null,
        project?.owner?.name ? { label: 'Owner', value: project.owner.name } : null,
      ]),
      items: buildItems([
        tabLabel ? { label: tabLabel } : null,
      ]),
    };
  }

  if (document.document_type === 'issue' && issue) {
    return {
      kind: 'document',
      route,
      title: issue.display_id ? `${issue.display_id} ${issue.title}` : issue.title,
      summary: `${issue.title} is the current issue document. It is currently ${issue.state}.`,
      emptyState: false,
      metrics: buildMetrics([
        { label: 'State', value: issue.state },
        issue.priority ? { label: 'Priority', value: issue.priority } : null,
        getProjectTitle(issue) ? { label: 'Project', value: getProjectTitle(issue) as string } : null,
      ]),
      items: buildItems([
        getProgramTitle(issue) ? { label: 'Program', detail: getProgramTitle(issue) } : null,
        getSprintTitle(issue) ? { label: 'Week', detail: getSprintTitle(issue) } : null,
      ]),
    };
  }

  if (document.document_type === 'person' || person) {
    return buildPersonPageContext(route, {
      id: person?.id ?? document.id,
      name: person?.name ?? document.title,
      email: person?.email,
    });
  }

  return {
    kind: 'document',
    route,
    title: document.title,
    summary: `${document.title} is the current ${document.document_type} document.`,
    emptyState: false,
    metrics: buildMetrics([
      tabLabel ? { label: 'Surface', value: activeView?.surface === 'my_week' ? 'My Week' : 'Document' } : null,
      tabLabel ? { label: 'Tab', value: activeView?.tab ?? 'overview' } : null,
    ]),
    items: [],
  };
}

function getFallbackTitle(pathname: string): string {
  if (pathname.startsWith('/team/status')) {
    return 'Status Overview';
  }
  if (pathname.startsWith('/team/reviews')) {
    return 'Reviews';
  }
  if (pathname.startsWith('/team/org-chart')) {
    return 'Org Chart';
  }
  if (pathname.startsWith('/team/allocation')) {
    return 'Team Allocation';
  }
  if (pathname.startsWith('/settings/conversions')) {
    return 'Converted Documents';
  }
  if (pathname.startsWith('/settings')) {
    return 'Workspace Settings';
  }

  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? 'workspace';
  return lastSegment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function useFleetGraphPageContext(
  activeView: FleetGraphActiveViewContext | null
): FleetGraphPageContextWithActions | null {
  const location = useLocation();
  const { currentDocumentId } = useCurrentDocument();
  const { documents } = useDocuments();
  const { issues } = useIssues();
  const { programs } = usePrograms();
  const { projects } = useProjects();
  const teamMembersQuery = useTeamMembersQuery();
  const activeWeeksQuery = useActiveWeeksQuery();
  const dashboardActionItemsQuery = useDashboardActionItems();
  const myWeekNumber = useMemo(() => {
    if (location.pathname !== '/my-week') {
      return undefined;
    }

    const value = new URLSearchParams(location.search).get('week_number');
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, [location.pathname, location.search]);
  const myWeekQuery = useMyWeekQuery(myWeekNumber, {
    enabled: location.pathname === '/my-week',
  });

  const route = `${location.pathname}${location.search}`;
  const routeDocumentMatch = matchPath('/documents/:id/*', location.pathname)
    ?? matchPath('/documents/:id', location.pathname);
  const teamPersonMatch = matchPath('/team/:id', location.pathname);
  const routeDocumentId = routeDocumentMatch?.params.id ?? currentDocumentId ?? null;
  const shouldLoadRouteDocument = Boolean(routeDocumentId);

  const currentDocumentQuery = useQuery<DocumentResponse>({
    queryKey: ['document', routeDocumentId],
    queryFn: async () => {
      if (!routeDocumentId) {
        throw new Error('FleetGraph current document context requires a document id');
      }

      const response = await apiGet(`/api/documents/${routeDocumentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch FleetGraph current document context');
      }
      return response.json();
    },
    enabled: shouldLoadRouteDocument,
    staleTime: 1000 * 60 * 5,
  });

  return useMemo(() => {
    if (location.pathname === '/programs') {
      return buildProgramsPageContext(route, programs);
    }

    if (location.pathname === '/projects') {
      return buildProjectsPageContext(route, projects, location.search);
    }

    if (location.pathname === '/issues') {
      return buildIssuesPageContext(route, issues, location.search);
    }

    if (location.pathname === '/docs') {
      return buildDocumentsPageContext(route, documents);
    }

    if (location.pathname === '/dashboard') {
      const dashboardView = new URLSearchParams(location.search).get('view');
      return buildDashboardPageContext(
        route,
        dashboardView,
        activeWeeksQuery.data,
        projects,
        dashboardActionItemsQuery.data
      );
    }

    if (location.pathname === '/team/directory') {
      return buildTeamDirectoryPageContext(route, teamMembersQuery.data ?? []);
    }

    if (location.pathname === '/my-week') {
      return buildMyWeekPageContext(route, activeView, myWeekQuery.data);
    }

    if (
      location.pathname === '/team/status' ||
      location.pathname === '/team/reviews' ||
      location.pathname === '/team/org-chart' ||
      location.pathname === '/team/allocation' ||
      location.pathname === '/settings' ||
      location.pathname === '/settings/conversions'
    ) {
      const title = getFallbackTitle(location.pathname);
      return buildGenericPageContext(
        route,
        title,
        `${title} is the current page. FleetGraph can use this surface as lightweight context, but there is no single sprint or document bound to it.`
      );
    }

    if (teamPersonMatch) {
      const person = (teamMembersQuery.data ?? []).find(
        (candidate) => candidate.id === teamPersonMatch.params.id
      );
      return buildPersonPageContext(route, person ?? null);
    }

    if (currentDocumentQuery.data) {
      return buildDocumentPageContext(
        route,
        currentDocumentQuery.data,
        activeView,
        programs,
        projects,
        issues,
        teamMembersQuery.data ?? []
      );
    }

    const title = getFallbackTitle(location.pathname);
    return buildGenericPageContext(
      route,
      title,
      `${title} is the current page. FleetGraph can use this surface as lightweight navigation context even when there is no single sprint in scope.`
    );
  }, [
    activeView,
    currentDocumentQuery.data,
    dashboardActionItemsQuery.data,
    documents,
    issues,
    location.pathname,
    location.search,
    programs,
    projects,
    route,
    teamMembersQuery.data,
    teamPersonMatch,
    activeWeeksQuery.data,
    myWeekQuery.data,
  ]);
}
