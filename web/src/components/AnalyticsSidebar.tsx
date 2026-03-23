import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { DashboardId } from '@/components/week';
import {
  buildAnalyticsPath,
  parseAnalyticsHistoryScope,
  parseAnalyticsWeekNumber,
} from '@/lib/analytics-route';

export interface AnalyticsSidebarSprint {
  id: string;
  title: string;
  subtitle: string;
  programName: string;
  status: 'planning' | 'active' | 'completed';
  statusLabel: string;
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

const SIDEBAR_SECTIONS: Array<{
  id: AnalyticsSidebarSprint['status'];
  label: string;
}> = [
  { id: 'active', label: 'Active' },
  { id: 'planning', label: 'Planning Next' },
  { id: 'completed', label: 'Recent Completed' },
];

export function AnalyticsSidebar({
  sprints,
  activeSprintId,
  activeView,
}: AnalyticsSidebarProps) {
  const [searchParams] = useSearchParams();
  const historyScope = parseAnalyticsHistoryScope(searchParams.get('historyScope'));
  const historyStartWeek = parseAnalyticsWeekNumber(searchParams.get('historyStartWeek'));
  const historyEndWeek = parseAnalyticsWeekNumber(searchParams.get('historyEndWeek'));
  const groupedSprints = useMemo(
    () =>
      SIDEBAR_SECTIONS.map((section) => ({
        ...section,
        sprints: sprints.filter((sprint) => sprint.status === section.id),
      })).filter((section) => section.sprints.length > 0),
    [sprints]
  );

  return (
    <div className="space-y-4 px-2 py-2">
      <div className="px-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">Recent Weeks</div>
        <p className="mt-1 text-xs text-muted/80">
          Open the current sprint, the next planned sprint, or recent completed weeks without digging through document tabs.
        </p>
      </div>

      <div className="space-y-3">
        {groupedSprints.length > 0 ? (
          groupedSprints.map((section) => (
            <div key={section.id} className="space-y-1">
              <div className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted/80">
                {section.label}
              </div>
              {section.sprints.map((sprint) => (
                <Link
                  key={sprint.id}
                  to={buildAnalyticsPath(sprint.id, activeView, {
                    historyScope,
                    historyStartWeek,
                    historyEndWeek,
                  })}
                  className={cn(
                    'block rounded-md px-2 py-2 transition-colors',
                    sprint.id === activeSprintId
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted hover:bg-border/30 hover:text-foreground'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{sprint.title}</div>
                      <div className="truncate text-xs text-current/70">{sprint.programName}</div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                        sprint.id === activeSprintId
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border bg-border/20 text-current/70'
                      )}
                    >
                      {sprint.statusLabel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ))
        ) : (
          <div className="px-2 text-sm text-muted">
            No current or recent sprint analytics are available yet.
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
                to={buildAnalyticsPath(activeSprintId, dashboard.id, {
                  historyScope,
                  historyStartWeek,
                  historyEndWeek,
                })}
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
