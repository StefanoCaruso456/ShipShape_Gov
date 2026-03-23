import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { DashboardId } from '@/components/week';
import { buildAnalyticsPath } from '@/lib/analytics-route';

export interface AnalyticsSidebarSprint {
  id: string;
  title: string;
  programName: string;
  sprintNumber: number;
  status: 'planning' | 'active' | 'completed';
}

interface AnalyticsSidebarProps {
  sprints: AnalyticsSidebarSprint[];
  activeSprintId: string | null;
  activeView: DashboardId;
}

const DASHBOARD_LINKS: Array<{ id: DashboardId; label: string }> = [
  { id: 'report', label: 'Sprint Report' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'flow', label: 'Flow' },
  { id: 'workload', label: 'Workload' },
  { id: 'hygiene', label: 'Hygiene' },
];

function formatStatusLabel(status: AnalyticsSidebarSprint['status']) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'planning':
      return 'Planning';
    default:
      return 'Completed';
  }
}

function getStatusTone(status: AnalyticsSidebarSprint['status']) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/15 text-emerald-700';
    case 'planning':
      return 'bg-sky-500/15 text-sky-700';
    default:
      return 'bg-border/80 text-muted';
  }
}

function getStatusRank(status: AnalyticsSidebarSprint['status']) {
  switch (status) {
    case 'active':
      return 0;
    case 'planning':
      return 1;
    default:
      return 2;
  }
}

export function AnalyticsSidebar({
  sprints,
  activeSprintId,
  activeView,
}: AnalyticsSidebarProps) {
  const programGroups = Array.from(
    sprints.reduce((groups, sprint) => {
      const existing = groups.get(sprint.programName);
      if (existing) {
        existing.push(sprint);
      } else {
        groups.set(sprint.programName, [sprint]);
      }
      return groups;
    }, new Map<string, AnalyticsSidebarSprint[]>())
  ).map(([programName, programSprints]) => ({
    programName,
    sprints: [...programSprints].sort((left, right) => {
      const statusDelta = getStatusRank(left.status) - getStatusRank(right.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return right.sprintNumber - left.sprintNumber;
    }),
  })).sort((left, right) => {
    const leftRank = Math.min(...left.sprints.map((sprint) => getStatusRank(sprint.status)));
    const rightRank = Math.min(...right.sprints.map((sprint) => getStatusRank(sprint.status)));
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.programName.localeCompare(right.programName);
  });

  return (
    <div className="space-y-4 px-2 py-2">
      <div className="px-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">Weeks By Program</div>
        <p className="mt-1 text-xs text-muted/80">
          Open active, planning, or recent historical week analytics without scanning one flat list.
        </p>
      </div>

      <div className="space-y-3">
        {programGroups.length > 0 ? (
          programGroups.map((group) => (
            <div key={group.programName} className="space-y-1">
              <div className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                {group.programName}
              </div>
              {group.sprints.map((sprint) => {
                const defaultWeekTitle = `Week ${sprint.sprintNumber}`.toLowerCase();
                const secondaryLabel =
                  sprint.title.trim().toLowerCase() === defaultWeekTitle
                    ? formatStatusLabel(sprint.status)
                    : `${sprint.title} • ${formatStatusLabel(sprint.status)}`;

                return (
                  <Link
                    key={sprint.id}
                    to={buildAnalyticsPath(sprint.id)}
                    className={cn(
                      'block rounded-md border px-2 py-2 transition-colors',
                      sprint.id === activeSprintId
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-transparent text-muted hover:bg-border/30 hover:text-foreground'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{`Week ${sprint.sprintNumber}`}</div>
                        <div className="truncate text-xs text-current/70">{secondaryLabel}</div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          sprint.id === activeSprintId ? 'bg-accent text-white' : getStatusTone(sprint.status)
                        )}
                      >
                        {formatStatusLabel(sprint.status)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))
        ) : (
          <div className="px-2 text-sm text-muted">
            No sprint analytics are available yet.
          </div>
        )}
      </div>

      {activeSprintId ? (
        <div className="border-t border-border pt-4">
          <div className="px-2 text-xs font-medium uppercase tracking-wider text-muted">Dashboards</div>
          <div className="mt-2 space-y-1">
            {DASHBOARD_LINKS.map((dashboard) => (
              <Link
                key={dashboard.id}
                to={buildAnalyticsPath(activeSprintId, dashboard.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  dashboard.id === activeView
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-muted hover:bg-border/30 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    dashboard.id === activeView ? 'bg-accent' : 'bg-muted/50'
                  )}
                />
                {dashboard.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
