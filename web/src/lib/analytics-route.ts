import type { DashboardId } from '@/components/week';

export function parseAnalyticsView(rawView: string | null): DashboardId {
  switch (rawView) {
    case 'velocity':
    case 'forecast':
    case 'flow':
    case 'workload':
    case 'hygiene':
      return rawView;
    default:
      return 'report';
  }
}

export function buildAnalyticsPath(sprintId: string, view: DashboardId = 'report') {
  const params = new URLSearchParams({ sprintId });

  if (view !== 'report') {
    params.set('view', view);
  }

  return `/analytics?${params.toString()}`;
}
