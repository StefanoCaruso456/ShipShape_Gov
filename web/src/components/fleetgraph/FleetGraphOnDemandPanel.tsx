import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FleetGraphActiveViewContext,
  FleetGraphDerivedSignal,
  FleetGraphDerivedSignals,
  FleetGraphOnDemandResponse,
} from '@ship/shared';
import { cn } from '@/lib/cn';
import { invokeFleetGraphOnDemand, resumeFleetGraphOnDemand } from '@/lib/fleetgraph';
import { useFleetGraphActiveView } from '@/hooks/useFleetGraphActiveView';

const DEFAULT_QUESTION = 'Why is this sprint at risk?';

const SEVERITY_STYLES: Record<
  FleetGraphDerivedSignals['severity'],
  { label: string; chipClassName: string; panelClassName: string }
> = {
  none: {
    label: 'Stable',
    chipClassName: 'border-border bg-border/40 text-muted',
    panelClassName: 'border-border/80 bg-surface/70',
  },
  info: {
    label: 'Watch',
    chipClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    panelClassName: 'border-sky-500/20 bg-sky-500/5',
  },
  warning: {
    label: 'Attention',
    chipClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    panelClassName: 'border-amber-500/20 bg-amber-500/5',
  },
  action: {
    label: 'Needs action',
    chipClassName: 'border-red-500/30 bg-red-500/10 text-red-300',
    panelClassName: 'border-red-500/20 bg-red-500/5',
  },
};

interface FleetGraphOnDemandPanelProps {
  activeView?: FleetGraphActiveViewContext | null;
  question?: string;
}

function formatTabLabel(tab: string | null): string {
  if (!tab) {
    return 'Current view';
  }

  return tab
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildContextSummary(
  activeView: FleetGraphActiveViewContext | null,
  result: FleetGraphOnDemandResponse | null
): string {
  const entityTitle =
    result?.fetched.entity?.title ??
    result?.fetched.supporting?.current?.title ??
    'Current week';
  const projectName = result?.fetched.accountability?.project?.name ?? null;
  const programName =
    result?.fetched.accountability?.program?.name ??
    result?.fetched.supporting?.current?.program_name ??
    null;
  const tabLabel = formatTabLabel(activeView?.tab ?? null);

  return [entityTitle, projectName, programName, tabLabel].filter(Boolean).join('  •  ');
}

function buildSummary(result: FleetGraphOnDemandResponse | null): string | null {
  if (!result || result.error) {
    return null;
  }

  return (
    result?.reasoning?.summary ??
    result.finding?.summary ??
    result.derivedSignals.summary ??
    "FleetGraph doesn't see a meaningful sprint-risk signal on this view right now."
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SignalItem({ signal }: { signal: FleetGraphDerivedSignal }) {
  const style = SEVERITY_STYLES[signal.severity];

  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground">{signal.summary}</p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            style.chipClassName
          )}
        >
          {style.label}
        </span>
      </div>
      {signal.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {signal.evidence.slice(0, 2).map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FleetGraphOnDemandPanel({
  activeView: activeViewProp,
  question = DEFAULT_QUESTION,
}: FleetGraphOnDemandPanelProps) {
  const contextActiveView = useFleetGraphActiveView();
  const activeView = activeViewProp ?? contextActiveView;
  const [result, setResult] = useState<FleetGraphOnDemandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const activeViewKey = useMemo(() => {
    if (!activeView) {
      return 'missing';
    }

    return [
      activeView.entity.id,
      activeView.surface,
      activeView.route,
      activeView.tab ?? 'none',
    ].join(':');
  }, [activeView]);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [activeViewKey]);

  const handleAnalyze = useCallback(async () => {
    if (!activeView || isRunning) {
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await invokeFleetGraphOnDemand({
        active_view: activeView,
        question,
      });
      setResult(response);
    } catch (invokeError) {
      const message =
        invokeError instanceof Error
          ? invokeError.message
          : 'FleetGraph could not analyze this view.';
      setError(message);
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  }, [activeView, isRunning, question]);

  const severity = result?.derivedSignals.severity ?? 'none';
  const severityStyle = SEVERITY_STYLES[severity];
  const summary = buildSummary(result);
  const responseError = result?.error?.message ?? null;
  const contextSummary = buildContextSummary(activeView, result);
  const pendingApproval = result?.pendingApproval ?? null;

  const handleDecision = useCallback(
    async (outcome: 'approve' | 'dismiss' | 'snooze') => {
      if (!result?.threadId || isRunning) {
        return;
      }

      setIsRunning(true);
      setError(null);

      try {
        const response = await resumeFleetGraphOnDemand({
          thread_id: result.threadId,
          decision: {
            outcome,
            snooze_minutes: outcome === 'snooze' ? 240 : null,
          },
        });
        setResult(response);
      } catch (resumeError) {
        const message =
          resumeError instanceof Error
            ? resumeError.message
            : 'FleetGraph could not finish the approval flow.';
        setError(message);
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, result]
  );

  return (
    <section className="border-b border-border px-4 py-3">
      <div
        className={cn(
          'rounded-xl border px-4 py-4 transition-colors',
          severityStyle.panelClassName
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">FleetGraph</span>
                <span className="rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] text-muted">
                  {activeView?.surface === 'document' ? 'Context-aware' : 'On-demand'}
                </span>
              </div>
              <p className="text-sm text-muted">
                Ask the shared FleetGraph for the current sprint state without leaving this page.
              </p>
              <p className="text-xs text-muted/80">{contextSummary}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {result && (
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium',
                    severityStyle.chipClassName
                  )}
                >
                  {severityStyle.label}
                </span>
              )}
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!activeView || isRunning}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  !activeView || isRunning
                    ? 'cursor-not-allowed bg-border/70 text-muted'
                    : 'bg-accent text-white hover:bg-accent/90'
                )}
              >
                {isRunning
                  ? 'Analyzing...'
                  : result
                    ? 'Run again'
                    : question}
              </button>
            </div>
          </div>

          {!activeView && (
            <p className="text-sm text-muted">
              FleetGraph is waiting for page context before it can analyze this sprint.
            </p>
          )}

          {(error || responseError) && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error ?? responseError}
            </div>
          )}

          {summary && (
            <div className="space-y-4" aria-live="polite">
              <div className="rounded-lg border border-border/60 bg-background/60 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">FleetGraph answer</div>
                <p className="mt-2 text-sm leading-6 text-foreground">{summary}</p>
                {result?.reasoning?.whyNow && (
                  <p className="mt-3 text-xs leading-5 text-muted">{result.reasoning.whyNow}</p>
                )}
                {result?.reasoning?.recommendedNextStep && (
                  <div className="mt-3 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Recommended next step</div>
                    <p className="mt-1 text-sm text-foreground">{result.reasoning.recommendedNextStep}</p>
                  </div>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <Metric
                  label="Completed"
                  value={`${result?.derivedSignals.metrics.completedIssues ?? 0}/${result?.derivedSignals.metrics.totalIssues ?? 0}`}
                />
                <Metric
                  label="In Progress"
                  value={String(result?.derivedSignals.metrics.inProgressIssues ?? 0)}
                />
                <Metric
                  label="Standups"
                  value={String(result?.derivedSignals.metrics.standupCount ?? 0)}
                />
                <Metric
                  label="Active Days"
                  value={String(result?.derivedSignals.metrics.recentActiveDays ?? 0)}
                />
              </div>

              {result && result.derivedSignals.signals.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">What FleetGraph saw</div>
                  <div className="grid gap-2">
                    {result.derivedSignals.signals.slice(0, 3).map((signal) => (
                      <SignalItem key={signal.dedupeKey} signal={signal} />
                    ))}
                  </div>
                </div>
              )}

              {result?.reasoning?.evidence && result.reasoning.evidence.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">Grounding evidence</div>
                  <ul className="space-y-1 text-sm text-muted">
                    {result.reasoning.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result?.proposedAction && (
                <div className="rounded-lg border border-border/60 bg-background/60 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted">Proposed action</div>
                  <p className="mt-2 text-sm text-foreground">{result.proposedAction.summary}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">{result.proposedAction.rationale}</p>
                  <div className="mt-3 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Draft comment</div>
                    <p className="mt-1 text-sm leading-6 text-foreground">{result.proposedAction.draftComment}</p>
                  </div>

                  {pendingApproval && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision('approve')}
                        disabled={isRunning}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                          isRunning
                            ? 'cursor-not-allowed bg-border/70 text-muted'
                            : 'bg-accent text-white hover:bg-accent/90'
                        )}
                      >
                        Approve and post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('dismiss')}
                        disabled={isRunning}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          isRunning
                            ? 'cursor-not-allowed border-border/50 text-muted'
                            : 'border-border text-foreground hover:bg-background/80'
                        )}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('snooze')}
                        disabled={isRunning}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          isRunning
                            ? 'cursor-not-allowed border-border/50 text-muted'
                            : 'border-border text-foreground hover:bg-background/80'
                        )}
                      >
                        Snooze 4h
                      </button>
                    </div>
                  )}
                </div>
              )}

              {result?.actionResult && (
                <div className="rounded-lg border border-border/60 bg-background/60 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted">Action outcome</div>
                  <p className="mt-2 text-sm text-foreground">{result.actionResult.summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default FleetGraphOnDemandPanel;
