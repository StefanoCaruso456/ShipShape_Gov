import type { DashboardId } from '@/components/week';

export type AnalyticsHistoryScope = 'program' | 'project';

export function parseAnalyticsHistoryScope(rawScope: string | null): AnalyticsHistoryScope {
  return rawScope === 'project' ? 'project' : 'program';
}

export function parseAnalyticsWeekNumber(rawWeek: string | null): number | null {
  if (!rawWeek) {
    return null;
  }

  const parsed = Number.parseInt(rawWeek, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeAnalyticsHistoryRange(startWeek: number | null, endWeek: number | null) {
  if (startWeek === null || endWeek === null) {
    return {
      startWeek: null,
      endWeek: null,
    };
  }

  return {
    startWeek: Math.min(startWeek, endWeek),
    endWeek: Math.max(startWeek, endWeek),
  };
}

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

export function buildAnalyticsPath(
  sprintId: string,
  view: DashboardId = 'report',
  options: {
    historyScope?: AnalyticsHistoryScope;
    historyStartWeek?: number | null;
    historyEndWeek?: number | null;
  } = {}
) {
  const params = new URLSearchParams({ sprintId });
  const historyScope = options.historyScope ?? 'program';
  const normalizedRange = normalizeAnalyticsHistoryRange(
    options.historyStartWeek ?? null,
    options.historyEndWeek ?? null
  );

  if (view !== 'report') {
    params.set('view', view);
  }

  if (historyScope !== 'program') {
    params.set('historyScope', historyScope);
  }

  if (normalizedRange.startWeek !== null && normalizedRange.endWeek !== null) {
    params.set('historyStartWeek', String(normalizedRange.startWeek));
    params.set('historyEndWeek', String(normalizedRange.endWeek));
  }

  return `/analytics?${params.toString()}`;
}
