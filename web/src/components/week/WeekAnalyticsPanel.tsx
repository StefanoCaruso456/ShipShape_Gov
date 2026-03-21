import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';

type MetricMode = 'points' | 'hours';

export interface WeekAnalyticsResponse {
  sprintId: string;
  sprintName: string;
  status: 'planning' | 'active' | 'completed';
  startDate: string;
  endDate: string;
  snapshotTakenAt: string | null;
  baseline: {
    issueCount: number;
    storyPoints: number;
    estimateHours: number;
  };
  current: {
    issueCount: number;
    completedIssueCount: number;
    storyPoints: number;
    completedStoryPoints: number;
    remainingStoryPoints: number;
    estimateHours: number;
    completedEstimateHours: number;
    remainingEstimateHours: number;
  };
  scope: {
    addedStoryPoints: number;
    removedStoryPoints: number;
    addedEstimateHours: number;
    removedEstimateHours: number;
  };
  days: Array<{
    date: string;
    committedStoryPoints: number;
    currentStoryPoints: number;
    completedStoryPoints: number;
    remainingStoryPoints: number;
    committedEstimateHours: number;
    currentEstimateHours: number;
    completedEstimateHours: number;
    remainingEstimateHours: number;
    committedIssueCount: number;
    currentIssueCount: number;
    completedIssueCount: number;
  }>;
}

interface WeekAnalyticsPanelProps {
  sprintId: string;
  compact?: boolean;
}

interface SeriesPoint {
  date: string;
  committed: number;
  current: number;
  completed: number;
  remaining: number;
}

function formatMetric(value: number, mode: MetricMode): string {
  if (mode === 'points') {
    return `${Math.round(value * 10) / 10} pt`;
  }
  return `${Math.round(value * 10) / 10}h`;
}

function formatDateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildPath(
  values: number[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number }
): string {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...values, 1);

  return values
    .map((value, index) => {
      const x = padding.left + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth);
      const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function SimpleSeriesChart({
  title,
  xLabels,
  series,
  colors,
}: {
  title: string;
  xLabels: string[];
  series: Array<{ label: string; values: number[] }>;
  colors: string[];
}) {
  const width = 520;
  const height = 180;
  const padding = { top: 16, right: 18, bottom: 28, left: 18 };
  const allValues = series.flatMap((entry) => entry.values);
  const maxValue = Math.max(...allValues, 1);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const gridLineValues = [0, maxValue / 2, maxValue];

  return (
    <div className="rounded-lg border border-border bg-border/20 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        {gridLineValues.map((value, index) => {
          const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
          return (
            <line
              key={`grid-${index}`}
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeDasharray="4 4"
            />
          );
        })}

        {series.map((entry, index) => (
          <path
            key={entry.label}
            d={buildPath(entry.values, width, height, padding)}
            fill="none"
            stroke={colors[index]}
            strokeWidth={index === 0 ? 2 : 2.5}
            strokeDasharray={entry.label === 'Ideal' ? '6 4' : undefined}
          />
        ))}

        {xLabels.map((label, index) => {
          const x = padding.left + (xLabels.length === 1 ? chartWidth / 2 : (index / (xLabels.length - 1)) * chartWidth);
          return (
            <text
              key={`${label}-${index}`}
              x={x}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle'}
              className="fill-current text-[10px] text-muted"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {series.map((entry, index) => (
          <div key={entry.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekAnalyticsPanel({ sprintId, compact = false }: WeekAnalyticsPanelProps) {
  const [mode, setMode] = useState<MetricMode>('points');

  const { data, isLoading, isError } = useQuery<WeekAnalyticsResponse>({
    queryKey: ['week-analytics', sprintId],
    queryFn: async () => {
      const response = await apiGet(`/api/weeks/${sprintId}/analytics`);
      if (!response.ok) {
        throw new Error('Failed to fetch week analytics');
      }
      return response.json();
    },
    staleTime: 1000 * 60,
  });

  const hasPoints = (data?.baseline.storyPoints ?? 0) > 0 || (data?.current.storyPoints ?? 0) > 0;
  const hasHours = (data?.baseline.estimateHours ?? 0) > 0 || (data?.current.estimateHours ?? 0) > 0;

  const effectiveMode: MetricMode = hasPoints ? mode : 'hours';

  const chartSeries = useMemo(() => {
    if (!data) return null;

    const days = data.days;
    const series: SeriesPoint[] = days.map((day) => ({
      date: day.date,
      committed: effectiveMode === 'points' ? day.committedStoryPoints : day.committedEstimateHours,
      current: effectiveMode === 'points' ? day.currentStoryPoints : day.currentEstimateHours,
      completed: effectiveMode === 'points' ? day.completedStoryPoints : day.completedEstimateHours,
      remaining: effectiveMode === 'points' ? day.remainingStoryPoints : day.remainingEstimateHours,
    }));

    return series;
  }, [data, effectiveMode]);

  if (isLoading) {
    return <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Loading sprint analytics...</div>;
  }

  if (isError || !data || !chartSeries) {
    return <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Sprint analytics are not available yet.</div>;
  }

  const xLabels = chartSeries.map((point) => formatDateLabel(point.date));
  const firstDay = chartSeries[0];
  const lastDay = chartSeries[chartSeries.length - 1];
  const idealRemaining = chartSeries.map((_, index) => {
    if (chartSeries.length === 1) return firstDay.committed;
    return firstDay.committed * (1 - index / (chartSeries.length - 1));
  });

  const scopeAdded = effectiveMode === 'points' ? data.scope.addedStoryPoints : data.scope.addedEstimateHours;
  const scopeRemoved = effectiveMode === 'points' ? data.scope.removedStoryPoints : data.scope.removedEstimateHours;
  const committed = effectiveMode === 'points' ? data.baseline.storyPoints : data.baseline.estimateHours;
  const current = effectiveMode === 'points' ? data.current.storyPoints : data.current.estimateHours;
  const completed = effectiveMode === 'points' ? data.current.completedStoryPoints : data.current.completedEstimateHours;
  const remaining = effectiveMode === 'points' ? data.current.remainingStoryPoints : data.current.remainingEstimateHours;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Sprint Analytics</div>
          <div className="text-xs text-muted">
            Burn-down, burn-up, and scope movement for this week
          </div>
        </div>
        {(hasPoints && hasHours) && (
          <div className="inline-flex rounded-md border border-border bg-border/30 p-1">
            {(['points', 'hours'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors',
                  effectiveMode === value ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
                )}
              >
                {value === 'points' ? 'Points' : 'Hours'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {[
          ['Committed', committed],
          ['Current Scope', current],
          ['Completed', completed],
          ['Remaining', remaining],
          ['Added', scopeAdded],
          ['Removed', scopeRemoved],
          ['Issues', data.current.issueCount],
          ['Done Issues', data.current.completedIssueCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-border bg-border/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {typeof value === 'number'
                ? label.toString().includes('Issue')
                  ? value
                  : formatMetric(value, effectiveMode)
                : value}
            </div>
          </div>
        ))}
      </div>

      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2')}>
        <SimpleSeriesChart
          title="Burn Down"
          xLabels={xLabels}
          series={[
            { label: 'Ideal', values: idealRemaining },
            { label: 'Remaining', values: chartSeries.map((point) => point.remaining) },
            { label: 'Current Scope', values: chartSeries.map((point) => point.current) },
          ]}
          colors={['#94A3B8', '#F59E0B', '#0EA5E9']}
        />

        <SimpleSeriesChart
          title="Burn Up"
          xLabels={xLabels}
          series={[
            { label: 'Completed', values: chartSeries.map((point) => point.completed) },
            { label: 'Total Scope', values: chartSeries.map((point) => point.current) },
          ]}
          colors={['#22C55E', '#0EA5E9']}
        />
      </div>

      <div className="rounded-lg border border-border bg-border/10 px-3 py-2 text-xs text-muted">
        {scopeAdded > 0
          ? `Scope increased after start by ${formatMetric(scopeAdded, effectiveMode)}.`
          : 'No scope increase recorded after start.'}{' '}
        {scopeRemoved > 0
          ? `Scope removed: ${formatMetric(scopeRemoved, effectiveMode)}.`
          : ''}{' '}
        {lastDay.remaining <= 0 && committed > 0
          ? 'The sprint is effectively burned down.'
          : lastDay.remaining < firstDay.committed * 0.35
            ? 'Burn-down is moving quickly relative to the original commitment.'
            : 'Burn-down is still carrying meaningful remaining scope.'}
      </div>
    </div>
  );
}
