import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WeekAnalyticsPanel, type DashboardId } from '@/components/week';
import type { DocumentTabProps } from '@/lib/document-tabs';

/**
 * SprintAnalyticsTab - Jira-style sprint analytics surface.
 *
 * Keeps reporting separate from the sprint overview/editor so week delivery
 * signals have a dedicated home.
 */
export default function SprintAnalyticsTab({ documentId }: DocumentTabProps) {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const initialDashboard = useMemo<DashboardId>(() => {
    switch (requestedView) {
      case 'velocity':
      case 'forecast':
      case 'flow':
      case 'workload':
      case 'hygiene':
        return requestedView;
      default:
        return 'report';
    }
  }, [requestedView]);

  return (
    <div className="h-full overflow-auto p-4 pb-20">
      <WeekAnalyticsPanel sprintId={documentId} initialDashboard={initialDashboard} />
    </div>
  );
}
