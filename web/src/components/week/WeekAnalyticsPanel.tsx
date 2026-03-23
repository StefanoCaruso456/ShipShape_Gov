import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIssuesQuery, type Issue } from '@/hooks/useIssuesQuery';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';

type MetricMode = 'points' | 'hours';
export type DashboardId = 'report' | 'velocity' | 'forecast' | 'flow' | 'workload' | 'hygiene';

const DASHBOARDS: Array<{ id: DashboardId; label: string; description: string }> = [
  {
    id: 'report',
    label: 'Sprint Report',
    description: 'Burn-down, burn-up, scope movement, and completion against commitment.',
  },
  {
    id: 'velocity',
    label: 'Velocity',
    description: 'Completion pace, commitment reliability, and throughput relative to the ideal line.',
  },
  {
    id: 'forecast',
    label: 'Forecast',
    description: 'Projected sprint finish, pace needed to land on time, and likely carryover.',
  },
  {
    id: 'flow',
    label: 'Flow',
    description: 'Created vs resolved, WIP pressure, state mix, and delivery cycle time.',
  },
  {
    id: 'workload',
    label: 'Workload',
    description: 'How remaining sprint load is distributed across owners and where it is concentrated.',
  },
  {
    id: 'hygiene',
    label: 'Hygiene',
    description: 'Coverage for story points, acceptance criteria, assignees, and issue classification.',
  },
];

const ISSUE_STATE_META: Array<{ key: string; label: string; color: string }> = [
  { key: 'triage', label: 'Triage', color: '#94A3B8' },
  { key: 'backlog', label: 'Backlog', color: '#64748B' },
  { key: 'todo', label: 'Todo', color: '#3B82F6' },
  { key: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { key: 'in_review', label: 'In Review', color: '#06B6D4' },
  { key: 'done', label: 'Done', color: '#22C55E' },
  { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
];

const ISSUE_TYPE_META: Array<{ key: string; label: string; color: string }> = [
  { key: 'story', label: 'Stories', color: '#0EA5E9' },
  { key: 'bug', label: 'Bugs', color: '#EF4444' },
  { key: 'task', label: 'Tasks', color: '#94A3B8' },
  { key: 'spike', label: 'Spikes', color: '#F59E0B' },
  { key: 'chore', label: 'Chores', color: '#8B5CF6' },
];

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
  velocityHistory: Array<{
    sprintNumber: number;
    sprintName: string;
    committedStoryPoints: number;
    completedStoryPoints: number;
    currentStoryPoints: number;
    committedEstimateHours: number;
    completedEstimateHours: number;
    currentEstimateHours: number;
    issueCount: number;
    completedIssueCount: number;
  }>;
  historyMeta: {
    scope: 'program';
    scopeLabel: string | null;
    programLabel: string | null;
    recommendedWindow: number;
    completedWeekCount: number;
    qualifyingWeekCount: number;
    includedWeekCount: number;
    backfilledWeekCount: number;
    excludedWeeks: Array<{
      sprintNumber: number;
      issueCount: number;
      missingStoryPoints: number;
      missingEstimateHours: number;
      missingIssueType: number;
      missingDescription: number;
      missingAcceptanceCriteria: number;
    }>;
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
  initialDashboard?: DashboardId;
}

interface AnalyticsIssue extends Issue {
  content?: Record<string, unknown> | null;
}

interface SeriesPoint {
  date: string;
  committed: number;
  current: number;
  completed: number;
  remaining: number;
}

interface IssueDayPoint {
  date: string;
  created: number;
  resolved: number;
}

interface VelocityHistorySummary {
  historyCount: number;
  xLabels: string[];
  committedValues: number[];
  completedValues: number[];
  scopeValues: number[];
  avgCommitted: number | null;
  avgCompleted: number | null;
  avgReliability: number | null;
  currentScopeVsAverage: number | null;
  currentCommitmentVsAverage: number | null;
}

interface OwnerLoadSummary {
  name: string;
  issueCount: number;
  completedIssueCount: number;
  openIssueCount: number;
  wipIssueCount: number;
  totalLoad: number;
  remainingLoad: number;
}

interface IssueInsights {
  stateCounts: Array<{ label: string; value: number; color: string }>;
  typeCounts: Array<{ label: string; value: number; color: string }>;
  createdResolvedByDay: IssueDayPoint[];
  averageLeadTimeDays: number | null;
  averageCycleTimeDays: number | null;
  staleOpenCount: number;
  openIssueCount: number;
  wipCount: number;
  doneCount: number;
  owners: OwnerLoadSummary[];
  unassignedCount: number;
  concentrationPercent: number | null;
  missingStoryPoints: number;
  missingEstimateHours: number;
  missingAssignee: number;
  missingIssueType: number;
  missingAcceptanceCriteria: number;
  missingStructuredBrief: number;
  acceptanceCriteriaCoverage: number;
  storyPointCoverage: number;
  assigneeCoverage: number;
  issueTypeCoverage: number;
  structuredBriefCoverage: number;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMetric(value: number, mode: MetricMode): string {
  if (mode === 'points') {
    return `${roundMetric(value)} pt`;
  }
  return `${roundMetric(value)}h`;
}

function formatMetricPerDay(value: number, mode: MetricMode): string {
  return `${formatMetric(value, mode)}/day`;
}

function formatDateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekLabel(sprintNumber: number): string {
  return `W${sprintNumber}`;
}

function formatForecastDate(value: string | null): string {
  if (!value) {
    return 'TBD';
  }

  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDays(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'TBD';
  }

  const rounded = Math.max(Math.round(value), 0);
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

function formatPercent(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `${value.toFixed(fractionDigits)}%`;
}

function formatDeltaPercent(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  const normalized = Math.abs(value) < (fractionDigits === 0 ? 0.5 : 1 / 10 ** fractionDigits) ? 0 : value;
  const sign = normalized > 0 ? '+' : '';
  return `${sign}${normalized.toFixed(fractionDigits)}%`;
}

function formatHistoryLabel(historyCount: number, suffix: string): string {
  if (historyCount <= 0) {
    return `Recent ${suffix}`;
  }

  return `${historyCount}-Week ${suffix}`;
}

function formatRecentHistory(historyCount: number): string | null {
  if (historyCount <= 0) {
    return null;
  }

  return historyCount === 1
    ? 'the last qualifying completed program week'
    : `the last ${historyCount} qualifying completed program weeks`;
}

function formatExcludedHistoryWeek(
  week: WeekAnalyticsResponse['historyMeta']['excludedWeeks'][number]
): string {
  if (week.issueCount === 0) {
    return `W${week.sprintNumber} has no scoped issues`;
  }

  const reasons: string[] = [];
  if (week.missingStoryPoints > 0) reasons.push('story points');
  if (week.missingEstimateHours > 0) reasons.push('estimates');
  if (week.missingIssueType > 0) reasons.push('issue types');
  if (week.missingDescription > 0) reasons.push('descriptions');
  if (week.missingAcceptanceCriteria > 0) reasons.push('acceptance criteria');

  return reasons.length > 0
    ? `W${week.sprintNumber} is missing ${reasons.slice(0, 3).join(', ')}`
    : `W${week.sprintNumber} was excluded`;
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

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const candidate = node as { type?: string; text?: string; content?: unknown[] };
  if (candidate.type === 'text' && typeof candidate.text === 'string') {
    return candidate.text;
  }
  if (Array.isArray(candidate.content)) {
    return candidate.content.map(extractText).join('');
  }
  return '';
}

function hasAcceptanceCriteria(content: unknown): boolean {
  const text = extractText(content).toLowerCase();
  return text.includes('acceptance criteria');
}

function hasStructuredIssueBrief(content: unknown): boolean {
  const text = extractText(content).toLowerCase();
  return text.includes('user story') && text.includes('acceptance criteria');
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function dateDiffInDays(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000), 0);
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return sum(values) / values.length;
}

function isOpenState(state: string): boolean {
  return state !== 'done' && state !== 'cancelled';
}

function isWipState(state: string): boolean {
  return state === 'in_progress' || state === 'in_review';
}

function getIssueMetric(issue: AnalyticsIssue, mode: MetricMode): number {
  const value = mode === 'points' ? issue.story_points : issue.estimate_hours ?? issue.estimate;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getTotalSprintDays(startDate: string, endDate: string): number {
  return dateDiffInDays(startDate, endDate) + 1;
}

function getVelocityMetricValue(
  point: WeekAnalyticsResponse['velocityHistory'][number],
  mode: MetricMode,
  field: 'committed' | 'completed' | 'scope'
): number {
  if (mode === 'points') {
    if (field === 'committed') return point.committedStoryPoints;
    if (field === 'completed') return point.completedStoryPoints;
    return point.currentStoryPoints;
  }

  if (field === 'committed') return point.committedEstimateHours;
  if (field === 'completed') return point.completedEstimateHours;
  return point.currentEstimateHours;
}

function buildForecastSeries(
  allDates: string[],
  observedSeries: SeriesPoint[],
  committed: number,
  lastKnownScope: number,
  projectedPace: number
): Array<{ date: string; projectedRemaining: number; idealRemaining: number; scope: number }> {
  const observedByDate = new Map(observedSeries.map((point) => [point.date, point]));
  const totalIntervals = Math.max(allDates.length - 1, 1);
  const lastObserved = observedSeries[observedSeries.length - 1];

  return allDates.map((date, index) => {
    const observed = observedByDate.get(date);
    const idealRemaining = committed * (1 - index / totalIntervals);

    if (observed) {
      return {
        date,
        projectedRemaining: observed.remaining,
        idealRemaining,
        scope: observed.current,
      };
    }

    const daysAfterObserved = dateDiffInDays(lastObserved.date, date);
    const projectedRemaining = Math.max(lastObserved.remaining - projectedPace * daysAfterObserved, 0);

    return {
      date,
      projectedRemaining,
      idealRemaining,
      scope: lastKnownScope,
    };
  });
}

function SimpleSeriesChart({
  title,
  subtitle,
  xLabels,
  series,
  colors,
}: {
  title: string;
  subtitle?: string;
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
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted/80">{subtitle}</div> : null}
        </div>
      </div>
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
            strokeWidth={entry.label === 'Ideal' ? 2 : 2.5}
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

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/8'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/8'
        : tone === 'danger'
          ? 'border-rose-500/30 bg-rose-500/8'
          : 'border-border bg-border/10';

  return (
    <div className={cn('rounded-lg border px-3 py-3', toneClass)}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted">{detail}</div> : null}
    </div>
  );
}

function DistributionCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{ label: string; value: number; color: string }>;
  emptyLabel: string;
}) {
  const total = sum(items.map((item) => item.value));

  return (
    <div className="rounded-lg border border-border bg-border/10 p-3">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      {total === 0 ? (
        <div className="text-sm text-muted">{emptyLabel}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const width = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-foreground">{item.label}</span>
                  </div>
                  <div className="text-muted">
                    {item.value} <span className="text-muted/70">({formatPercent(width, 0)})</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border/60">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: item.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OwnerLoadCard({
  title,
  owners,
  mode,
}: {
  title: string;
  owners: OwnerLoadSummary[];
  mode: MetricMode;
}) {
  const maxRemaining = Math.max(...owners.map((owner) => owner.remainingLoad), 1);

  return (
    <div className="rounded-lg border border-border bg-border/10 p-3">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      {owners.length === 0 ? (
        <div className="text-sm text-muted">No assigned sprint work yet.</div>
      ) : (
        <div className="space-y-3">
          {owners.map((owner) => {
            const width = (owner.remainingLoad / maxRemaining) * 100;
            return (
              <div key={owner.name} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{owner.name}</div>
                    <div className="text-xs text-muted">
                      {owner.openIssueCount} open, {owner.wipIssueCount} in progress
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-foreground">
                      {formatMetric(owner.remainingLoad, mode)}
                    </div>
                    <div className="text-xs text-muted">{owner.issueCount} total issues</div>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(width, owner.remainingLoad > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InsightBanner({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-border/10 px-3 py-2 text-sm text-muted">
      {children}
    </div>
  );
}

export function WeekAnalyticsPanel({
  sprintId,
  compact = false,
  initialDashboard = 'report',
}: WeekAnalyticsPanelProps) {
  const [mode, setMode] = useState<MetricMode>('points');
  const [dashboard, setDashboard] = useState<DashboardId>(initialDashboard);

  useEffect(() => {
    setDashboard(initialDashboard);
  }, [initialDashboard]);

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

  const {
    data: issueData,
    isLoading: isIssuesLoading,
    isError: isIssuesError,
  } = useIssuesQuery(
    { sprintId },
    { enabled: !compact }
  );

  const issues = (issueData ?? []) as AnalyticsIssue[];
  const hasPoints = (data?.baseline.storyPoints ?? 0) > 0 || (data?.current.storyPoints ?? 0) > 0;
  const hasHours = (data?.baseline.estimateHours ?? 0) > 0 || (data?.current.estimateHours ?? 0) > 0;
  const effectiveMode: MetricMode = hasPoints ? mode : 'hours';

  const chartSeries = useMemo(() => {
    if (!data) return null;

    return data.days.map((day) => ({
      date: day.date,
      committed: effectiveMode === 'points' ? day.committedStoryPoints : day.committedEstimateHours,
      current: effectiveMode === 'points' ? day.currentStoryPoints : day.currentEstimateHours,
      completed: effectiveMode === 'points' ? day.completedStoryPoints : day.completedEstimateHours,
      remaining: effectiveMode === 'points' ? day.remainingStoryPoints : day.remainingEstimateHours,
    }));
  }, [data, effectiveMode]);

  const analyticsSummary = useMemo(() => {
    if (!data || !chartSeries || chartSeries.length === 0) {
      return null;
    }

    const isPlanning = data.status === 'planning';
    const firstDay = chartSeries[0];
    const lastDay = chartSeries[chartSeries.length - 1];
    const xLabels = chartSeries.map((point) => formatDateLabel(point.date));
    const idealRemaining = chartSeries.map((_, index) => {
      if (chartSeries.length === 1) return firstDay.committed;
      return firstDay.committed * (1 - index / (chartSeries.length - 1));
    });
    const idealCompleted = chartSeries.map((_, index) => {
      if (chartSeries.length === 1) return lastDay.completed;
      return firstDay.committed * (index / (chartSeries.length - 1));
    });
    const dailyCompleted = chartSeries.map((point, index) => {
      if (index === 0) {
        return point.completed;
      }
      return Math.max(point.completed - chartSeries[index - 1].completed, 0);
    });
    const averageDailyCompleted = isPlanning ? 0 : (average(dailyCompleted) ?? 0);
    const recentCompleted = dailyCompleted.slice(-3);
    const recentAverageCompleted = isPlanning ? 0 : (average(recentCompleted) ?? averageDailyCompleted);
    const totalSprintDays = getTotalSprintDays(data.startDate, data.endDate);
    const observedDays = isPlanning ? 0 : chartSeries.length;
    const remainingCalendarDays = isPlanning ? totalSprintDays : Math.max(totalSprintDays - observedDays, 0);
    const committed = firstDay.committed;
    const current = lastDay.current;
    const completed = lastDay.completed;
    const remaining = lastDay.remaining;
    const scopeAdded = effectiveMode === 'points' ? data.scope.addedStoryPoints : data.scope.addedEstimateHours;
    const scopeRemoved = effectiveMode === 'points' ? data.scope.removedStoryPoints : data.scope.removedEstimateHours;
    const scopeChangePercent = committed > 0 ? ((current - committed) / committed) * 100 : null;
    const commitmentReliability = committed > 0 ? (completed / committed) * 100 : null;
    const averageThroughput = averageDailyCompleted;
    const requiredDailyPace = remainingCalendarDays > 0 ? remaining / remainingCalendarDays : remaining > 0 ? remaining : 0;
    const projectedDaysToFinish =
      isPlanning
        ? null
        : averageThroughput > 0
          ? remaining / averageThroughput
          : null;
    const projectedFinishDate =
      projectedDaysToFinish !== null && Number.isFinite(projectedDaysToFinish)
        ? addDays(lastDay.date, Math.ceil(projectedDaysToFinish))
        : null;
    const nonZeroThroughput = isPlanning ? [] : dailyCompleted.filter((value) => value > 0);
    const optimisticPace = Math.max(averageThroughput, recentAverageCompleted, ...nonZeroThroughput, 0);
    const pessimisticPace =
      nonZeroThroughput.length > 0 ? Math.min(...nonZeroThroughput, averageThroughput || Infinity) : 0;
    const forecastStartDate =
      optimisticPace > 0 ? addDays(lastDay.date, Math.ceil(remaining / optimisticPace)) : null;
    const forecastEndDate =
      pessimisticPace > 0 ? addDays(lastDay.date, Math.ceil(remaining / pessimisticPace)) : null;
    const allDates = Array.from({ length: totalSprintDays }, (_, index) => addDays(data.startDate, index));
    const forecastSeries = buildForecastSeries(
      allDates,
      chartSeries,
      committed,
      current,
      averageThroughput > 0 ? averageThroughput : 0
    );
    const forecastStatus =
      isPlanning
        ? 'planning'
        : remaining <= 0
          ? 'done'
          : projectedFinishDate === null
            ? 'stalled'
            : projectedFinishDate <= data.endDate
              ? 'on_track'
              : 'at_risk';
    const carryover = Math.max(remaining - Math.max(recentAverageCompleted, averageThroughput, 0) * remainingCalendarDays, 0);

    return {
      isPlanning,
      firstDay,
      lastDay,
      committed,
      current,
      completed,
      remaining,
      scopeAdded,
      scopeRemoved,
      scopeChangePercent,
      commitmentReliability,
      averageThroughput,
      recentAverageCompleted,
      requiredDailyPace,
      remainingCalendarDays,
      projectedFinishDate,
      forecastStartDate,
      forecastEndDate,
      forecastStatus,
      carryover,
      xLabels,
      idealRemaining,
      idealCompleted,
      dailyCompleted,
      totalSprintDays,
      observedDays,
      allDates,
      forecastSeries,
    };
  }, [chartSeries, data, effectiveMode]);

  const velocityHistorySummary = useMemo<VelocityHistorySummary | null>(() => {
    if (!data) {
      return null;
    }

    const history = data.velocityHistory ?? [];
    const committedValues = history.map((point) => getVelocityMetricValue(point, effectiveMode, 'committed'));
    const completedValues = history.map((point) => getVelocityMetricValue(point, effectiveMode, 'completed'));
    const scopeValues = history.map((point) => getVelocityMetricValue(point, effectiveMode, 'scope'));
    const reliabilityValues = history
      .map((point) => {
        const committedValue = getVelocityMetricValue(point, effectiveMode, 'committed');
        const completedValue = getVelocityMetricValue(point, effectiveMode, 'completed');
        return committedValue > 0 ? (completedValue / committedValue) * 100 : null;
      })
      .filter((value): value is number => value !== null);
    const avgCompleted = average(completedValues);
    const currentScope = effectiveMode === 'points' ? data.current.storyPoints : data.current.estimateHours;
    const currentCommitted = effectiveMode === 'points' ? data.baseline.storyPoints : data.baseline.estimateHours;

    return {
      historyCount: history.length,
      xLabels: history.map((point) => formatWeekLabel(point.sprintNumber)),
      committedValues,
      completedValues,
      scopeValues,
      avgCommitted: average(committedValues),
      avgCompleted,
      avgReliability: average(reliabilityValues),
      currentScopeVsAverage:
        avgCompleted !== null && avgCompleted > 0 ? ((currentScope - avgCompleted) / avgCompleted) * 100 : null,
      currentCommitmentVsAverage:
        avgCompleted !== null && avgCompleted > 0
          ? ((currentCommitted - avgCompleted) / avgCompleted) * 100
          : null,
    };
  }, [data, effectiveMode]);

  const issueInsights = useMemo<IssueInsights | null>(() => {
    if (compact || !data || !issueData) {
      return null;
    }

    const dayKeys = data.days.map((day) => day.date);
    const dayIndex = new Set(dayKeys);
    const todayKey = new Date().toISOString().slice(0, 10);

    const stateCounts = ISSUE_STATE_META.map((state) => ({
      label: state.label,
      value: issues.filter((issue) => issue.state === state.key).length,
      color: state.color,
    }));

    const typeCounts = ISSUE_TYPE_META.map((type) => ({
      label: type.label,
      value: issues.filter((issue) => (issue.issue_type ?? 'task') === type.key).length,
      color: type.color,
    }));

    const createdByDay = new Map<string, number>();
    const resolvedByDay = new Map<string, number>();
    const owners = new Map<string, OwnerLoadSummary>();
    const leadTimes: number[] = [];
    const cycleTimes: number[] = [];
    let staleOpenCount = 0;
    let openIssueCount = 0;
    let wipCount = 0;
    let doneCount = 0;
    let unassignedCount = 0;
    let missingStoryPoints = 0;
    let missingEstimateHours = 0;
    let missingAssignee = 0;
    let missingIssueType = 0;
    let missingAcceptanceCriteria = 0;
    let missingStructuredBrief = 0;

    for (const issue of issues) {
      const createdDay = toDateKey(issue.created_at ?? null);
      if (createdDay && dayIndex.has(createdDay)) {
        createdByDay.set(createdDay, (createdByDay.get(createdDay) ?? 0) + 1);
      }

      const resolvedDay = toDateKey(issue.completed_at ?? issue.cancelled_at ?? null);
      if (resolvedDay && dayIndex.has(resolvedDay)) {
        resolvedByDay.set(resolvedDay, (resolvedByDay.get(resolvedDay) ?? 0) + 1);
      }

      if (!issue.story_points) {
        missingStoryPoints += 1;
      }

      if (!(typeof issue.estimate_hours === 'number' && issue.estimate_hours > 0) &&
          !(typeof issue.estimate === 'number' && issue.estimate > 0)) {
        missingEstimateHours += 1;
      }

      if (!issue.assignee_id) {
        missingAssignee += 1;
        unassignedCount += 1;
      }

      if (!issue.issue_type) {
        missingIssueType += 1;
      }

      if (!hasAcceptanceCriteria(issue.content)) {
        missingAcceptanceCriteria += 1;
      }

      if (!hasStructuredIssueBrief(issue.content)) {
        missingStructuredBrief += 1;
      }

      if (isOpenState(issue.state)) {
        openIssueCount += 1;
        const updatedDay = toDateKey(issue.updated_at ?? issue.created_at ?? null);
        if (updatedDay && dateDiffInDays(updatedDay, todayKey) >= 3) {
          staleOpenCount += 1;
        }
      }

      if (isWipState(issue.state)) {
        wipCount += 1;
      }

      if (issue.state === 'done') {
        doneCount += 1;
      }

      const completedDay = toDateKey(issue.completed_at ?? null);
      const startedDay = toDateKey(issue.started_at ?? issue.created_at ?? null);
      if (completedDay) {
        const createdForLead = toDateKey(issue.created_at ?? null);
        if (createdForLead) {
          leadTimes.push(dateDiffInDays(createdForLead, completedDay) + 1);
        }
        if (startedDay) {
          cycleTimes.push(dateDiffInDays(startedDay, completedDay) + 1);
        }
      }

      const ownerKey = issue.assignee_name || 'Unassigned';
      const summary = owners.get(ownerKey) ?? {
        name: ownerKey,
        issueCount: 0,
        completedIssueCount: 0,
        openIssueCount: 0,
        wipIssueCount: 0,
        totalLoad: 0,
        remainingLoad: 0,
      };
      const metric = getIssueMetric(issue, effectiveMode);
      summary.issueCount += 1;
      summary.totalLoad += metric;
      if (issue.state === 'done') {
        summary.completedIssueCount += 1;
      }
      if (isOpenState(issue.state)) {
        summary.openIssueCount += 1;
        summary.remainingLoad += metric;
      }
      if (isWipState(issue.state)) {
        summary.wipIssueCount += 1;
      }
      owners.set(ownerKey, summary);
    }

    const createdResolvedByDay = dayKeys.map((date) => ({
      date,
      created: createdByDay.get(date) ?? 0,
      resolved: resolvedByDay.get(date) ?? 0,
    }));

    const ownerSummaries = Array.from(owners.values()).sort((left, right) => {
      if (right.remainingLoad !== left.remainingLoad) {
        return right.remainingLoad - left.remainingLoad;
      }
      if (right.wipIssueCount !== left.wipIssueCount) {
        return right.wipIssueCount - left.wipIssueCount;
      }
      return left.name.localeCompare(right.name);
    });

    const totalRemaining = sum(ownerSummaries.map((owner) => owner.remainingLoad));
    const topOwnerRemaining = ownerSummaries[0]?.remainingLoad ?? 0;

    return {
      stateCounts,
      typeCounts,
      createdResolvedByDay,
      averageLeadTimeDays: average(leadTimes),
      averageCycleTimeDays: average(cycleTimes),
      staleOpenCount,
      openIssueCount,
      wipCount,
      doneCount,
      owners: ownerSummaries,
      unassignedCount,
      concentrationPercent: totalRemaining > 0 ? (topOwnerRemaining / totalRemaining) * 100 : null,
      missingStoryPoints,
      missingEstimateHours,
      missingAssignee,
      missingIssueType,
      missingAcceptanceCriteria,
      missingStructuredBrief,
      acceptanceCriteriaCoverage: issues.length > 0 ? ((issues.length - missingAcceptanceCriteria) / issues.length) * 100 : 100,
      storyPointCoverage: issues.length > 0 ? ((issues.length - missingStoryPoints) / issues.length) * 100 : 100,
      assigneeCoverage: issues.length > 0 ? ((issues.length - missingAssignee) / issues.length) * 100 : 100,
      issueTypeCoverage: issues.length > 0 ? ((issues.length - missingIssueType) / issues.length) * 100 : 100,
      structuredBriefCoverage: issues.length > 0 ? ((issues.length - missingStructuredBrief) / issues.length) * 100 : 100,
    };
  }, [compact, data, effectiveMode, issueData, issues]);

  if (isLoading) {
    return <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Loading sprint analytics...</div>;
  }

  if (isError || !data || !chartSeries || !analyticsSummary) {
    return <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Sprint analytics are not available yet.</div>;
  }

  const {
    isPlanning,
    committed,
    current,
    completed,
    remaining,
    scopeAdded,
    scopeRemoved,
    scopeChangePercent,
    commitmentReliability,
    averageThroughput,
    recentAverageCompleted,
    requiredDailyPace,
    remainingCalendarDays,
    projectedFinishDate,
    forecastStartDate,
    forecastEndDate,
    forecastStatus,
    carryover,
    xLabels,
    idealRemaining,
    idealCompleted,
    allDates,
    forecastSeries,
    lastDay,
    observedDays,
  } = analyticsSummary;
  const historicalVelocity = velocityHistorySummary;
  const hasVelocityHistory = (historicalVelocity?.historyCount ?? 0) > 0;
  const historicalAvgCompleted = historicalVelocity?.avgCompleted ?? null;
  const historicalAvgCommitted = historicalVelocity?.avgCommitted ?? null;
  const historicalAvgReliability = historicalVelocity?.avgReliability ?? null;
  const historicalScopeVsAverage = historicalVelocity?.currentScopeVsAverage ?? null;
  const historicalCommitmentVsAverage = historicalVelocity?.currentCommitmentVsAverage ?? null;
  const historyMeta = data.historyMeta;
  const historyWindowCount = historicalVelocity?.historyCount ?? 0;
  const historyWindowDetail =
    historyWindowCount > 0
      ? 'Qualifying completed program weeks included in the velocity trend'
      : 'Not enough completed history yet';
  const historyAvgDoneLabel = formatHistoryLabel(historyWindowCount, 'Avg Done');
  const historyAvgCommittedLabel = formatHistoryLabel(historyWindowCount, 'Avg Committed');
  const historyReliabilityLabel = formatHistoryLabel(historyWindowCount, 'Reliability');
  const historyEmptyState = 'Not enough completed history yet';
  const recentHistoryDescriptor = formatRecentHistory(historyWindowCount);
  const hasThinVelocityHistory = historyWindowCount > 0 && historyWindowCount < historyMeta.recommendedWindow;
  const historyIntegritySummary =
    historyWindowCount === 0
      ? 'Not enough completed history yet. Weeks only count once every issue has story points, estimates, issue type, description, and acceptance criteria.'
      : [
          `Using ${historyWindowCount} qualifying completed program week${historyWindowCount === 1 ? '' : 's'} in the current trend window.`,
          historyMeta.excludedWeeks.length > 0
            ? `Excluded ${historyMeta.excludedWeeks.length} completed week${historyMeta.excludedWeeks.length === 1 ? '' : 's'} that were missing required planning fields.`
            : null,
          historyMeta.backfilledWeekCount > 0
            ? `${historyMeta.backfilledWeekCount} included week${historyMeta.backfilledWeekCount === 1 ? '' : 's'} used a backfilled start-of-week baseline because no stored planning snapshot existed.`
            : null,
        ]
          .filter(Boolean)
          .join(' ');
  const noThroughputState = 'No throughput yet';
  const pendingStartState = 'Pending start';
  const throughputHasStarted = averageThroughput > 0 || completed > 0;
  const projectedFinishValue =
    isPlanning
      ? pendingStartState
      : forecastStatus === 'stalled'
        ? noThroughputState
        : formatForecastDate(projectedFinishDate);
  const projectedFinishDetail =
    isPlanning
      ? `Sprint ends ${formatForecastDate(data.endDate)}. Forecast begins after the sprint starts.`
      : forecastStatus === 'stalled'
        ? 'Finish forecast appears after the sprint records completed work.'
        : `Sprint ends ${formatForecastDate(data.endDate)}`;
  const forecastRangeValue =
    isPlanning
      ? pendingStartState
      : forecastStatus === 'stalled'
        ? noThroughputState
        : forecastStartDate && forecastEndDate
          ? `${formatForecastDate(forecastStartDate)} - ${formatForecastDate(forecastEndDate)}`
          : 'TBD';
  const forecastRangeDetail =
    isPlanning
      ? 'Forecast begins after the sprint starts.'
      : forecastStatus === 'stalled'
        ? 'Range appears after the sprint has measurable throughput.'
        : 'Best to worst observed pace';
  const averageThroughputValue =
    !isPlanning && !throughputHasStarted
      ? noThroughputState
      : formatMetricPerDay(averageThroughput, effectiveMode);
  const averageThroughputDetail =
    isPlanning
      ? 'Planning baseline before sprint start'
      : !throughputHasStarted
        ? 'Completed work will unlock pace-based forecasting.'
        : `${observedDays} observed day${observedDays === 1 ? '' : 's'}`;
  const flowEventCount = issueInsights
    ? sum(issueInsights.createdResolvedByDay.map((day) => day.created + day.resolved))
    : 0;
  const flowActivityDays = issueInsights
    ? issueInsights.createdResolvedByDay.filter((day) => day.created > 0 || day.resolved > 0).length
    : 0;
  const showEarlyFlowTrendMessage =
    flowEventCount === 0 || (flowEventCount < 3 || flowActivityDays < 2 || observedDays < 3);
  const flowTrendMessage =
    flowEventCount === 0
      ? 'No issue movement yet. Created vs resolved trends will appear after sprint work starts moving.'
      : `Flow trend is still early: ${flowEventCount} created or resolved event${flowEventCount === 1 ? '' : 's'} across ${flowActivityDays} active day${flowActivityDays === 1 ? '' : 's'}. The distributions are trustworthy, but the trend line will stay jagged until more work moves.`;
  const excludedWeeksPreview = historyMeta.excludedWeeks.slice(0, 3).map(formatExcludedHistoryWeek).join(' • ');

  const fullDateLabels = allDates.map((date) => formatDateLabel(date));
  const reportInsight =
    isPlanning
      ? `This week is still in planning with ${formatMetric(current, effectiveMode)} of scoped work across ${data.current.issueCount} issue${data.current.issueCount === 1 ? '' : 's'}.`
      : scopeAdded > 0
        ? `Scope increased after start by ${formatMetric(scopeAdded, effectiveMode)}.`
        : 'No scope increase recorded after start.';
  const paceInsight =
    isPlanning
      ? 'The burn charts are showing the planned commitment baseline before execution starts.'
      : remaining <= 0
        ? 'The sprint is effectively burned down.'
        : lastDay.remaining < analyticsSummary.firstDay.committed * 0.35
          ? 'Burn-down is moving quickly relative to the original commitment.'
          : 'Burn-down is still carrying meaningful remaining scope.';

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Sprint Snapshot</div>
            <div className="text-xs text-muted">Delivery pace and scope movement for this week</div>
          </div>
          {hasPoints && hasHours ? (
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
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <MetricCard label="Committed" value={formatMetric(committed, effectiveMode)} />
          <MetricCard label="Completed" value={formatMetric(completed, effectiveMode)} tone="success" />
          <MetricCard label="Remaining" value={formatMetric(remaining, effectiveMode)} tone={remaining > 0 ? 'warning' : 'success'} />
          <MetricCard label="Scope Added" value={formatMetric(scopeAdded, effectiveMode)} tone={scopeAdded > 0 ? 'warning' : 'default'} />
        </div>

        <SimpleSeriesChart
          title="Burn Down"
          subtitle="Remaining scope against the original sprint commitment"
          xLabels={xLabels}
          series={[
            { label: 'Ideal', values: idealRemaining },
            { label: 'Remaining', values: chartSeries.map((point) => point.remaining) },
            { label: 'Current Scope', values: chartSeries.map((point) => point.current) },
          ]}
          colors={['#94A3B8', '#F59E0B', '#0EA5E9']}
        />

        <InsightBanner>{`${reportInsight} ${scopeRemoved > 0 ? `Scope removed: ${formatMetric(scopeRemoved, effectiveMode)}.` : ''} ${paceInsight}`}</InsightBanner>
      </div>
    );
  }

  const activeDashboard = DASHBOARDS.find((entry) => entry.id === dashboard) ?? DASHBOARDS[0];
  const issueDashboardsLoading = isIssuesLoading && !issueInsights;
  const issueDashboardsUnavailable = isIssuesError || (!isIssuesLoading && !issueInsights);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Sprint Analytics</div>
          <div className="text-xs text-muted">
            Jira-style sprint dashboards for burn, flow, workload, and planning hygiene
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPoints && hasHours ? (
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
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {DASHBOARDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setDashboard(entry.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                dashboard === entry.id
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-border/20 text-muted hover:text-foreground'
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-muted">{activeDashboard.description}</div>
      </div>

      {dashboard === 'report' ? (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <MetricCard label="Committed" value={formatMetric(committed, effectiveMode)} />
            <MetricCard label="Current Scope" value={formatMetric(current, effectiveMode)} />
            <MetricCard label="Completed" value={formatMetric(completed, effectiveMode)} tone="success" />
            <MetricCard label="Remaining" value={formatMetric(remaining, effectiveMode)} tone={remaining > 0 ? 'warning' : 'success'} />
            <MetricCard label="Added" value={formatMetric(scopeAdded, effectiveMode)} tone={scopeAdded > 0 ? 'warning' : 'default'} />
            <MetricCard label="Removed" value={formatMetric(scopeRemoved, effectiveMode)} />
            <MetricCard label="Issues" value={data.current.issueCount} />
            <MetricCard label="Done Issues" value={data.current.completedIssueCount} tone="success" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SimpleSeriesChart
              title="Burn Down"
              subtitle="Remaining work against the ideal line"
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
              subtitle="Completed work relative to current sprint scope"
              xLabels={xLabels}
              series={[
                { label: 'Completed', values: chartSeries.map((point) => point.completed) },
                { label: 'Total Scope', values: chartSeries.map((point) => point.current) },
              ]}
              colors={['#22C55E', '#0EA5E9']}
            />
          </div>

          <InsightBanner>{`${reportInsight} ${scopeRemoved > 0 ? `Scope removed: ${formatMetric(scopeRemoved, effectiveMode)}.` : ''} ${paceInsight}`}</InsightBanner>
        </>
      ) : null}

      {dashboard === 'velocity' ? (
        <>
          <div className="rounded-lg border border-border bg-border/10 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">History Integrity</div>
            <div className="mt-1 text-sm text-foreground">
              {historyWindowCount} of {historyMeta.recommendedWindow} recent completed program week{historyMeta.recommendedWindow === 1 ? '' : 's'} currently qualify
            </div>
            <div className="mt-1 text-xs text-muted">
              {historyIntegritySummary}
            </div>
            {excludedWeeksPreview ? (
              <div className="mt-2 text-xs text-muted">
                Excluded: {excludedWeeksPreview}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <MetricCard
              label="History Window"
              value={`${historyWindowCount} week${historyWindowCount === 1 ? '' : 's'}`}
              detail={historyWindowDetail}
            />
            <MetricCard
              label={historyAvgDoneLabel}
              value={
                historicalAvgCompleted !== null
                  ? formatMetric(historicalAvgCompleted, effectiveMode)
                  : 'N/A'
              }
              detail={
                historicalAvgCompleted !== null && recentHistoryDescriptor
                  ? `Average completed work across ${recentHistoryDescriptor}`
                  : historyEmptyState
              }
              tone={historicalAvgCompleted !== null ? 'success' : 'default'}
            />
            <MetricCard
              label={historyAvgCommittedLabel}
              value={
                historicalAvgCommitted !== null
                  ? formatMetric(historicalAvgCommitted, effectiveMode)
                  : 'N/A'
              }
              detail={
                historicalAvgCommitted !== null && recentHistoryDescriptor
                  ? `Average starting commitment across ${recentHistoryDescriptor}`
                  : historyEmptyState
              }
            />
            <MetricCard
              label={historyReliabilityLabel}
              value={formatPercent(historicalAvgReliability, 0)}
              detail={
                historicalAvgReliability !== null && recentHistoryDescriptor
                  ? `Completed vs committed across ${recentHistoryDescriptor}`
                  : historyEmptyState
              }
              tone={historicalAvgReliability !== null && historicalAvgReliability >= 85 ? 'success' : 'warning'}
            />
            <MetricCard
              label="Commitment Delta vs Avg Done"
              value={formatDeltaPercent(historicalCommitmentVsAverage, 0)}
              detail={
                historicalAvgCompleted !== null && recentHistoryDescriptor
                  ? `${formatMetric(committed, effectiveMode)} committed vs ${formatMetric(historicalAvgCompleted, effectiveMode)} avg delivered across ${recentHistoryDescriptor}`
                  : historyEmptyState
              }
              tone={
                historicalCommitmentVsAverage !== null && historicalCommitmentVsAverage > 10
                  ? 'warning'
                  : 'default'
              }
            />
            <MetricCard
              label="Scope Delta vs Avg Done"
              value={formatDeltaPercent(historicalScopeVsAverage, 0)}
              detail={
                historicalAvgCompleted !== null && recentHistoryDescriptor
                  ? `${formatMetric(current, effectiveMode)} in scope vs ${formatMetric(historicalAvgCompleted, effectiveMode)} avg delivered across ${recentHistoryDescriptor}`
                  : historyEmptyState
              }
              tone={
                historicalScopeVsAverage !== null && historicalScopeVsAverage > 10
                  ? 'warning'
                  : 'default'
              }
            />
            <MetricCard
              label="Avg Throughput"
              value={averageThroughputValue}
              detail={averageThroughputDetail}
            />
            <MetricCard
              label="Required Pace"
              value={formatMetricPerDay(requiredDailyPace, effectiveMode)}
              detail={
                remainingCalendarDays > 0
                  ? `${remainingCalendarDays} calendar day${remainingCalendarDays === 1 ? '' : 's'} left`
                  : 'Sprint end has arrived'
              }
              tone={!isPlanning && requiredDailyPace > averageThroughput && remaining > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {historicalVelocity && hasVelocityHistory ? (
              <SimpleSeriesChart
                title="Historical Velocity"
                subtitle={`Last ${historicalVelocity.historyCount} completed program week${historicalVelocity.historyCount === 1 ? '' : 's'} of commitment vs delivered work`}
                xLabels={historicalVelocity.xLabels}
                series={[
                  { label: 'Committed', values: historicalVelocity.committedValues },
                  { label: 'Completed', values: historicalVelocity.completedValues },
                  { label: 'Final Scope', values: historicalVelocity.scopeValues },
                ]}
                colors={['#94A3B8', '#22C55E', '#0EA5E9']}
              />
            ) : (
              <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">
                Not enough completed history yet. Velocity appears after this program accumulates completed weeks with clean planning data.
              </div>
            )}

            <SimpleSeriesChart
              title="Completion Pace"
              subtitle="Actual completed work against the ideal completion curve for the current sprint"
              xLabels={xLabels}
              series={[
                { label: 'Ideal', values: idealCompleted },
                { label: 'Completed', values: chartSeries.map((point) => point.completed) },
                { label: 'Current Scope', values: chartSeries.map((point) => point.current) },
              ]}
              colors={['#94A3B8', '#22C55E', '#0EA5E9']}
            />
          </div>

          <InsightBanner>
            {historicalAvgCompleted !== null && historicalVelocity
              ? `${historyIntegritySummary} ${hasThinVelocityHistory && recentHistoryDescriptor ? `History is still thin, so this view is using ${recentHistoryDescriptor}. ` : ''}${
                  historicalScopeVsAverage !== null && historicalScopeVsAverage > 10
                    ? `Current sprint scope is ${formatPercent(historicalScopeVsAverage, 0)} above the recent average delivered volume, so carryover risk is higher unless throughput improves.`
                    : `Current sprint scope is within the recent delivery band, with ${formatMetric(historicalAvgCompleted, effectiveMode)} as the team’s average completed work across ${recentHistoryDescriptor ?? `${historicalVelocity.historyCount} qualifying weeks`}.`
                }`
              : isPlanning
                ? `${historyIntegritySummary} This week has not started yet. Use the commitment of ${formatMetric(committed, effectiveMode)} to pressure-test whether the planned scope is realistic.`
                : !throughputHasStarted
                  ? `${historyIntegritySummary} No throughput yet. Delivery pacing will become trustworthy after the sprint records completed work.`
                : commitmentReliability !== null && commitmentReliability >= 100
                  ? `${historyIntegritySummary} The sprint has already delivered the original commitment at ${formatPercent(commitmentReliability, 0)}.`
                  : `${historyIntegritySummary} The team is delivering at ${formatMetricPerDay(averageThroughput, effectiveMode)} against a current requirement of ${formatMetricPerDay(requiredDailyPace, effectiveMode)} to finish on time.`}
          </InsightBanner>
        </>
      ) : null}

      {dashboard === 'forecast' ? (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <MetricCard
              label="Projected Finish"
              value={projectedFinishValue}
              detail={projectedFinishDetail}
              tone={
                forecastStatus === 'planning'
                  ? 'default'
                  : forecastStatus === 'on_track'
                    ? 'success'
                    : forecastStatus === 'at_risk'
                      ? 'warning'
                      : forecastStatus === 'stalled'
                        ? 'danger'
                        : 'success'
              }
            />
            <MetricCard
              label="Forecast Range"
              value={forecastRangeValue}
              detail={forecastRangeDetail}
            />
            <MetricCard
              label="Required Pace"
              value={formatMetricPerDay(requiredDailyPace, effectiveMode)}
              detail={
                remainingCalendarDays > 0
                  ? `${remainingCalendarDays} calendar day${remainingCalendarDays === 1 ? '' : 's'} left`
                  : 'Sprint end has arrived'
              }
              tone={!isPlanning && requiredDailyPace > averageThroughput && remaining > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Likely Carryover"
              value={formatMetric(carryover, effectiveMode)}
              detail={isPlanning ? 'Current scoped work before start' : 'Remaining work at current recent pace'}
              tone={!isPlanning && carryover > 0 ? 'warning' : 'success'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SimpleSeriesChart
              title="Projected Burn Down"
              subtitle={isPlanning ? 'Planned commitment envelope before execution begins' : 'Observed remaining work extended with current average pace through sprint end'}
              xLabels={fullDateLabels}
              series={[
                { label: 'Ideal', values: forecastSeries.map((point) => point.idealRemaining) },
                { label: isPlanning ? 'Planned Remaining' : 'Projected Remaining', values: forecastSeries.map((point) => point.projectedRemaining) },
                { label: 'Current Scope', values: forecastSeries.map((point) => point.scope) },
              ]}
              colors={['#94A3B8', '#F97316', '#0EA5E9']}
            />

            <SimpleSeriesChart
              title="Remaining Work"
              subtitle={isPlanning ? 'Planned remaining work across the sprint window' : 'Actual remaining work over the observed sprint window'}
              xLabels={xLabels}
              series={[
                { label: 'Remaining', values: chartSeries.map((point) => point.remaining) },
                { label: 'Completed', values: chartSeries.map((point) => point.completed) },
              ]}
              colors={['#F59E0B', '#22C55E']}
            />
          </div>

          <InsightBanner>
            {forecastStatus === 'planning'
              ? `The sprint has not started yet. The team needs roughly ${formatMetricPerDay(requiredDailyPace, effectiveMode)} to land the current commitment by ${formatForecastDate(data.endDate)}.`
              : forecastStatus === 'done'
              ? 'The sprint has already burned down the remaining committed work.'
              : forecastStatus === 'stalled'
                ? 'No throughput yet. Finish forecasting appears after the sprint records completed work.'
                : forecastStatus === 'on_track'
                  ? `At the current pace, the sprint projects to finish by ${formatForecastDate(projectedFinishDate)}.`
                  : `At the current pace, the sprint is trending past ${formatForecastDate(data.endDate)} and needs roughly ${formatMetricPerDay(requiredDailyPace, effectiveMode)} from here.`}
          </InsightBanner>
        </>
      ) : null}

      {dashboard === 'flow' ? (
        issueDashboardsLoading ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Loading sprint issue flow...</div>
        ) : issueDashboardsUnavailable || !issueInsights ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Sprint issue flow data is not available yet.</div>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-4">
              <MetricCard label="Open Issues" value={issueInsights.openIssueCount} />
              <MetricCard label="WIP" value={issueInsights.wipCount} tone={issueInsights.wipCount > 0 ? 'warning' : 'default'} />
              <MetricCard label="Created" value={sum(issueInsights.createdResolvedByDay.map((day) => day.created))} />
              <MetricCard label="Resolved" value={sum(issueInsights.createdResolvedByDay.map((day) => day.resolved))} tone="success" />
              <MetricCard
                label="Lead Time"
                value={formatDays(issueInsights.averageLeadTimeDays)}
                detail="Created to done"
              />
              <MetricCard
                label="Cycle Time"
                value={formatDays(issueInsights.averageCycleTimeDays)}
                detail="Started to done"
              />
              <MetricCard
                label="Stale Open"
                value={issueInsights.staleOpenCount}
                detail="Open for 3+ days without movement"
                tone={issueInsights.staleOpenCount > 0 ? 'warning' : 'success'}
              />
              <MetricCard label="Done Issues" value={issueInsights.doneCount} tone="success" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {showEarlyFlowTrendMessage ? (
                <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">
                  {flowTrendMessage}
                </div>
              ) : (
                <SimpleSeriesChart
                  title="Created vs Resolved"
                  subtitle="Daily issue creation and resolution inside the sprint window"
                  xLabels={xLabels}
                  series={[
                    { label: 'Created', values: issueInsights.createdResolvedByDay.map((day) => day.created) },
                    { label: 'Resolved', values: issueInsights.createdResolvedByDay.map((day) => day.resolved) },
                  ]}
                  colors={['#0EA5E9', '#22C55E']}
                />
              )}

              <DistributionCard
                title="State Mix"
                items={issueInsights.stateCounts}
                emptyLabel="No sprint issues yet."
              />
            </div>

            <DistributionCard
              title="Issue Type Mix"
              items={issueInsights.typeCounts}
              emptyLabel="Issue types have not been classified yet."
            />

            <InsightBanner>
              {issueInsights.staleOpenCount > 0
                ? `${issueInsights.staleOpenCount} open issue${issueInsights.staleOpenCount === 1 ? '' : 's'} look stale, so flow risk is more about aging work than raw volume.`
                : 'Flow is currently moving without stale open work, so the main question is keeping WIP under control.'}
            </InsightBanner>
          </>
        )
      ) : null}

      {dashboard === 'workload' ? (
        issueDashboardsLoading ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Loading sprint workload...</div>
        ) : issueDashboardsUnavailable || !issueInsights ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Sprint workload data is not available yet.</div>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-4">
              <MetricCard
                label="Owners With Work"
                value={issueInsights.owners.length}
                detail="Distinct assignees in this sprint"
              />
              <MetricCard
                label="Top Load Share"
                value={formatPercent(issueInsights.concentrationPercent, 0)}
                detail="Share of remaining work held by the busiest owner"
                tone={issueInsights.concentrationPercent !== null && issueInsights.concentrationPercent >= 45 ? 'warning' : 'default'}
              />
              <MetricCard
                label="Unassigned Issues"
                value={issueInsights.unassignedCount}
                detail="Sprint issues without an owner"
                tone={issueInsights.unassignedCount > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="In Progress"
                value={issueInsights.wipCount}
                detail="Issues already in active execution"
              />
            </div>

            <OwnerLoadCard
              title="Remaining Load By Owner"
              owners={issueInsights.owners}
              mode={effectiveMode}
            />

            <InsightBanner>
              {issueInsights.concentrationPercent !== null && issueInsights.concentrationPercent >= 45
                ? `One owner is carrying ${formatPercent(issueInsights.concentrationPercent, 0)} of the remaining sprint load, so rebalancing may reduce delivery risk.`
                : 'Remaining sprint load is reasonably distributed across the current owners.'}
            </InsightBanner>
          </>
        )
      ) : null}

      {dashboard === 'hygiene' ? (
        issueDashboardsLoading ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Loading sprint hygiene metrics...</div>
        ) : issueDashboardsUnavailable || !issueInsights ? (
          <div className="rounded-lg border border-border bg-border/20 p-4 text-sm text-muted">Sprint hygiene metrics are not available yet.</div>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-4">
              <MetricCard
                label="Story Point Coverage"
                value={formatPercent(issueInsights.storyPointCoverage, 0)}
                detail={`${issueInsights.missingStoryPoints} issue${issueInsights.missingStoryPoints === 1 ? '' : 's'} missing points`}
                tone={issueInsights.missingStoryPoints > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="Acceptance Criteria"
                value={formatPercent(issueInsights.acceptanceCriteriaCoverage, 0)}
                detail={`${issueInsights.missingAcceptanceCriteria} issue${issueInsights.missingAcceptanceCriteria === 1 ? '' : 's'} missing criteria`}
                tone={issueInsights.missingAcceptanceCriteria > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="Assignee Coverage"
                value={formatPercent(issueInsights.assigneeCoverage, 0)}
                detail={`${issueInsights.missingAssignee} issue${issueInsights.missingAssignee === 1 ? '' : 's'} unassigned`}
                tone={issueInsights.missingAssignee > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="Issue Type Coverage"
                value={formatPercent(issueInsights.issueTypeCoverage, 0)}
                detail={`${issueInsights.missingIssueType} issue${issueInsights.missingIssueType === 1 ? '' : 's'} missing type`}
                tone={issueInsights.missingIssueType > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="Structured Briefs"
                value={formatPercent(issueInsights.structuredBriefCoverage, 0)}
                detail={`${issueInsights.missingStructuredBrief} issue${issueInsights.missingStructuredBrief === 1 ? '' : 's'} missing full brief`}
                tone={issueInsights.missingStructuredBrief > 0 ? 'warning' : 'success'}
              />
              <MetricCard
                label="Hour Estimates"
                value={formatPercent(
                  issues.length > 0 ? ((issues.length - issueInsights.missingEstimateHours) / issues.length) * 100 : 100,
                  0
                )}
                detail={`${issueInsights.missingEstimateHours} issue${issueInsights.missingEstimateHours === 1 ? '' : 's'} missing hours`}
                tone={issueInsights.missingEstimateHours > 0 ? 'warning' : 'success'}
              />
              <MetricCard label="Issues In Scope" value={issues.length} />
              <MetricCard label="Week Status" value={data.status.charAt(0).toUpperCase() + data.status.slice(1)} />
            </div>

            <InsightBanner>
              {issueInsights.missingAcceptanceCriteria > 0 || issueInsights.missingStoryPoints > 0
                ? 'Planning hygiene still has gaps, so sprint analytics are directionally useful but not fully clean yet.'
                : 'Planning hygiene is in good shape, so the sprint analytics should be trustworthy for delivery decisions.'}
            </InsightBanner>
          </>
        )
      ) : null}
    </div>
  );
}
