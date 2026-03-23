import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { WeekAnalyticsPanel } from '@/components/week';
import { useAnalyticsSprintsQuery } from '@/hooks/useAnalyticsSprintsQuery';
import { buildAnalyticsPath, parseAnalyticsView } from '@/lib/analytics-route';

export function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const requestedSprintId = searchParams.get('sprintId');
  const activeView = parseAnalyticsView(searchParams.get('view'));
  const { data: analyticsSprints = [], isLoading, error } = useAnalyticsSprintsQuery();

  const availableSprintIds = useMemo(() => {
    return analyticsSprints.map((sprint) => sprint.id);
  }, [analyticsSprints]);

  const fallbackSprintId = availableSprintIds[0] ?? null;
  const requestedSprintIsKnown =
    !requestedSprintId || availableSprintIds.length === 0 || availableSprintIds.includes(requestedSprintId);
  const activeSprintId = requestedSprintId ?? fallbackSprintId;

  if (!requestedSprintId && fallbackSprintId) {
    return <Navigate to={buildAnalyticsPath(fallbackSprintId, activeView)} replace />;
  }

  if (requestedSprintId && fallbackSprintId && !requestedSprintIsKnown) {
    return <Navigate to={buildAnalyticsPath(fallbackSprintId, activeView)} replace />;
  }

  if (isLoading && !activeSprintId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted">Loading analytics...</div>
      </div>
    );
  }

  if (error && !activeSprintId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">
          Analytics are not available yet.
        </div>
      </div>
    );
  }

  if (!activeSprintId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">
          No sprint analytics are available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 pb-20">
      <WeekAnalyticsPanel sprintId={activeSprintId} initialDashboard={activeView} />
    </div>
  );
}
