import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { DashboardId } from '@/components/week';

export interface AnalyticsSidebarSprint {
  id: string;
  title: string;
  subtitle: string;
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

export function AnalyticsSidebar({
  sprints,
  activeSprintId,
  activeView,
}: AnalyticsSidebarProps) {
  return (
    <div className="space-y-4 px-2 py-2">
      <div className="px-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">Current Week</div>
        <p className="mt-1 text-xs text-muted/80">
          Open sprint analytics directly from the left nav.
        </p>
      </div>

      <div className="space-y-1">
        {sprints.length > 0 ? (
          sprints.map((sprint) => (
            <Link
              key={sprint.id}
              to={`/documents/${sprint.id}/analytics`}
              className={cn(
                'block rounded-md px-2 py-2 transition-colors',
                sprint.id === activeSprintId
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:bg-border/30 hover:text-foreground'
              )}
            >
              <div className="truncate text-sm font-medium">{sprint.title}</div>
              <div className="truncate text-xs text-current/70">{sprint.subtitle}</div>
            </Link>
          ))
        ) : (
          <div className="px-2 text-sm text-muted">
            No current sprint analytics available yet.
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
                to={`/documents/${activeSprintId}/analytics?view=${dashboard.id}`}
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
