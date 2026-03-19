import { useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FleetGraphActiveViewContext, FleetGraphPageContext } from '@ship/shared';
import { useCurrentDocument } from '@/contexts/CurrentDocumentContext';
import { useDocuments } from '@/contexts/DocumentsContext';
import { useIssues } from '@/contexts/IssuesContext';
import { usePrograms } from '@/contexts/ProgramsContext';
import { useProjects } from '@/contexts/ProjectsContext';
import { apiGet } from '@/lib/api';
import type { DocumentResponse } from '@/lib/document-tabs';
import {
  getProgramTitle,
  getProjectTitle,
  getSprintTitle,
} from '@/hooks/useIssuesQuery';
import { useDashboardActionItems } from '@/hooks/useDashboardActionItems';
import { useTeamMembersQuery } from '@/hooks/useTeamMembersQuery';
import { useActiveWeeksQuery } from '@/hooks/useWeeksQuery';

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

function buildMyWeekPageContext(
  route: string,
  activeView: FleetGraphActiveViewContext | null
): FleetGraphPageContext {
  return {
    kind: 'my_week',
    route,
    title: 'My Week',
    summary: activeView?.projectId
      ? 'My Week is currently narrowed to a single project, so FleetGraph can reason about both this page and the linked sprint work.'
      : 'My Week is the current weekly planning surface for your work.',
    emptyState: false,
    metrics: buildMetrics([
      activeView?.projectId ? { label: 'Single project scope', value: 'Yes' } : null,
    ]),
    items: [],
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
): FleetGraphPageContext | null {
  const location = useLocation();
  const { currentDocumentId } = useCurrentDocument();
  const { documents } = useDocuments();
  const { issues } = useIssues();
  const { programs } = usePrograms();
  const { projects } = useProjects();
  const teamMembersQuery = useTeamMembersQuery();
  const activeWeeksQuery = useActiveWeeksQuery();
  const dashboardActionItemsQuery = useDashboardActionItems();

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
      return buildMyWeekPageContext(route, activeView);
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
  ]);
}
