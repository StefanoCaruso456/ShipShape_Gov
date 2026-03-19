import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type {
  FleetGraphActiveViewContext,
  FleetGraphDerivedSignal,
  FleetGraphDerivedSignals,
  FleetGraphPageContext,
  FleetGraphOnDemandResponse,
} from '@ship/shared';
import { cn } from '@/lib/cn';
import { invokeFleetGraphOnDemand, resumeFleetGraphOnDemand } from '@/lib/fleetgraph';
import { useFleetGraphActiveView } from '@/hooks/useFleetGraphActiveView';
import { useFleetGraphPageContext } from '@/hooks/useFleetGraphPageContext';

const SPRINT_QUICK_PROMPTS = [
  'Why is this sprint at risk?',
  'What should happen next?',
  'Summarize the key risk signals.',
  'Should I follow up now or wait?',
];

const PAGE_QUICK_PROMPTS = [
  'Summarize what matters on this page.',
  'What should I look at next?',
  'Who or what needs attention here?',
  'What context am I seeing right now?',
];

const DRAWER_STORAGE_KEY = 'ship:fleetgraphDrawerOpen';

const SEVERITY_STYLES: Record<
  FleetGraphDerivedSignals['severity'],
  {
    label: string;
    badgeClassName: string;
    accentClassName: string;
  }
> = {
  none: {
    label: 'Stable',
    badgeClassName: 'border-border bg-border/40 text-muted',
    accentClassName: 'from-emerald-400/10 to-cyan-400/10',
  },
  info: {
    label: 'Watch',
    badgeClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    accentClassName: 'from-sky-500/20 to-cyan-500/10',
  },
  warning: {
    label: 'Attention',
    badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    accentClassName: 'from-amber-500/20 to-orange-500/10',
  },
  action: {
    label: 'Needs action',
    badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-200',
    accentClassName: 'from-red-500/20 to-orange-500/10',
  },
};

interface FleetGraphOnDemandPanelProps {
  activeView?: FleetGraphActiveViewContext | null;
}

interface FleetGraphChatTurn {
  id: string;
  question: string;
  status: 'running' | 'completed' | 'error';
  pageContext: FleetGraphPageContext | null;
  result: FleetGraphOnDemandResponse | null;
  error: string | null;
}

function createTurnId() {
  return `fleetgraph-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function getFallbackEntityLabel(activeView: FleetGraphActiveViewContext | null): string | null {
  if (!activeView) {
    return null;
  }

  switch (activeView.entity.type) {
    case 'week':
      return 'Current sprint';
    case 'project':
      return 'Current project';
    case 'issue':
      return 'Current issue';
    case 'program':
      return 'Current program';
    case 'person':
      return activeView.surface === 'my_week' ? 'My Week' : 'Current person';
    default:
      return 'Current view';
  }
}

function buildContextSummary(
  activeView: FleetGraphActiveViewContext | null,
  pageContext: FleetGraphPageContext | null,
  result: FleetGraphOnDemandResponse | null
): string {
  const entityTitle =
    result?.fetched.entity?.title ??
    result?.fetched.supporting?.current?.title ??
    pageContext?.title ??
    getFallbackEntityLabel(activeView);
  const projectName = result?.fetched.accountability?.project?.name ?? null;
  const programName =
    result?.fetched.accountability?.program?.name ??
    result?.fetched.supporting?.current?.program_name ??
    null;
  const tabLabel = activeView ? formatTabLabel(activeView.tab ?? null) : null;

  return [entityTitle, projectName, programName, tabLabel].filter(Boolean).join('  •  ');
}

function buildSummary(
  result: FleetGraphOnDemandResponse | null,
  pageContext: FleetGraphPageContext | null
): string | null {
  if (!result || result.error) {
    return null;
  }

  return (
    result.reasoning?.summary ??
    result.finding?.summary ??
    result.derivedSignals.summary ??
    pageContext?.summary ??
    "FleetGraph doesn't see a meaningful sprint-risk signal on this view right now."
  );
}

function hasSprintAnalysisScope(activeView: FleetGraphActiveViewContext | null): boolean {
  if (!activeView) {
    return false;
  }

  return (
    activeView.entity.type === 'week' ||
    activeView.entity.type === 'project' ||
    activeView.surface === 'my_week'
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SignalItem({ signal }: { signal: FleetGraphDerivedSignal }) {
  const style = SEVERITY_STYLES[signal.severity];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-foreground">{signal.summary}</p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            style.badgeClassName
          )}
        >
          {style.label}
        </span>
      </div>
      {signal.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted">
          {signal.evidence.slice(0, 2).map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FleetGraphGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" />
      <path d="M19 14l.9 2.9L22.8 18l-2.9.9L19 21.8l-.9-2.9-2.9-.9 2.9-.9L19 14z" />
      <path d="M5 15l.7 2.1L8 18l-2.3.9L5 21l-.7-2.1L2 18l2.3-.9L5 15z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

export function FleetGraphOnDemandPanel({
  activeView: activeViewProp,
}: FleetGraphOnDemandPanelProps) {
  const contextActiveView = useFleetGraphActiveView();
  const activeView = activeViewProp ?? contextActiveView;
  const pageContext = useFleetGraphPageContext(activeView);
  const supportedActiveView = hasSprintAnalysisScope(activeView);
  const hasUsableContext = Boolean(activeView || pageContext);
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(DRAWER_STORAGE_KEY) === 'true';
  });
  const [draftQuestion, setDraftQuestion] = useState('');
  const [turns, setTurns] = useState<FleetGraphChatTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeViewKey = useMemo(() => {
    if (activeView) {
      return [
        activeView.entity.id,
        activeView.entity.type,
        activeView.surface,
        activeView.route,
        activeView.tab ?? 'none',
        activeView.projectId ?? 'no-project',
      ].join(':');
    }

    if (pageContext) {
      return [pageContext.kind, pageContext.route, pageContext.title].join(':');
    }

    if (!activeView && !pageContext) {
      return 'missing';
    }

    return 'missing';
  }, [activeView, pageContext]);

  const latestCompletedTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.result)?.result ?? null,
    [turns]
  );
  const latestSeverity = latestCompletedTurn?.derivedSignals.severity ?? 'none';
  const latestSeverityStyle = SEVERITY_STYLES[latestSeverity];
  const contextSummary = buildContextSummary(activeView, pageContext, latestCompletedTurn);
  const unavailableReason = hasUsableContext
    ? null
    : 'FleetGraph could not derive current page context here yet.';
  const quickPrompts = supportedActiveView ? SPRINT_QUICK_PROMPTS : PAGE_QUICK_PROMPTS;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DRAWER_STORAGE_KEY, open ? 'true' : 'false');
    }
  }, [open]);

  useEffect(() => {
    setTurns([]);
    setDraftQuestion('');
    setActiveTurnId(null);
  }, [activeViewKey]);

  useEffect(() => {
    if (!open || !hasUsableContext) {
      return;
    }

    window.setTimeout(() => {
      textareaRef.current?.focus();
      historyRef.current?.scrollTo?.({
        top: historyRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 0);
  }, [hasUsableContext, open, turns]);

  const submitQuestion = useCallback(
    async (questionOverride?: string) => {
      const question = (questionOverride ?? draftQuestion).trim();
      if ((!activeView && !pageContext) || !question || activeTurnId) {
        return;
      }

      const turnId = createTurnId();
      setOpen(true);
      setDraftQuestion('');
      setActiveTurnId(turnId);
      setTurns((previous) => [
        ...previous,
        {
          id: turnId,
          question,
          status: 'running',
          pageContext,
          result: null,
          error: null,
        },
      ]);

      try {
        const response = await invokeFleetGraphOnDemand({
          active_view: activeView ?? null,
          page_context: pageContext ?? null,
          question,
        });

        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: 'completed',
                  result: response,
                  error: null,
                }
              : turn
          )
        );
      } catch (invokeError) {
        const message =
          invokeError instanceof Error
            ? invokeError.message
            : 'FleetGraph could not analyze this view.';

        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: 'error',
                  error: message,
                }
              : turn
          )
        );
      } finally {
        setActiveTurnId(null);
      }
    },
    [activeTurnId, activeView, draftQuestion, pageContext]
  );

  const handleDecision = useCallback(
    async (turnId: string, outcome: 'approve' | 'dismiss' | 'snooze') => {
      const turn = turns.find((candidate) => candidate.id === turnId);
      const threadId = turn?.result?.threadId;
      if (!threadId || activeTurnId) {
        return;
      }

      setActiveTurnId(turnId);
      setTurns((previous) =>
        previous.map((candidate) =>
          candidate.id === turnId
            ? {
                ...candidate,
                error: null,
              }
            : candidate
        )
      );

      try {
        const response = await resumeFleetGraphOnDemand({
          thread_id: threadId,
          decision: {
            outcome,
            snooze_minutes: outcome === 'snooze' ? 240 : null,
          },
        });

        setTurns((previous) =>
          previous.map((candidate) =>
            candidate.id === turnId
              ? {
                  ...candidate,
                  status: 'completed',
                  result: response,
                  error: null,
                }
              : candidate
          )
        );
      } catch (resumeError) {
        const message =
          resumeError instanceof Error
            ? resumeError.message
            : 'FleetGraph could not finish the approval flow.';

        setTurns((previous) =>
          previous.map((candidate) =>
            candidate.id === turnId
              ? {
                  ...candidate,
                  error: message,
                }
              : candidate
          )
        );
      } finally {
        setActiveTurnId(null);
      }
    },
    [activeTurnId, turns]
  );

  const handleComposerKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        await submitQuestion();
      }
    },
    [submitQuestion]
  );

  const composer = hasUsableContext ? (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20">
      <textarea
        ref={textareaRef}
        value={draftQuestion}
        onChange={(event) => setDraftQuestion(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        placeholder="Ask about this page, next steps, or what needs attention..."
        disabled={!!activeTurnId}
        rows={3}
        className="max-h-40 min-h-[72px] w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted">FleetGraph uses the current page as context.</div>
        <button
          type="button"
          onClick={() => {
            void submitQuestion();
          }}
          disabled={!draftQuestion.trim() || !!activeTurnId}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
            !draftQuestion.trim() || activeTurnId
              ? 'cursor-not-allowed bg-white/5 text-muted'
              : 'bg-accent text-white hover:bg-accent/90'
          )}
          aria-label="Send FleetGraph message"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Unavailable here</div>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {unavailableReason}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted">
        FleetGraph should use the page you are on as context. If this still appears, the current
        surface is missing page-context wiring and needs a follow-up fix.
      </p>
    </div>
  );

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close FleetGraph drawer"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[59] bg-black/25 backdrop-blur-[1px]"
        />
      )}

      <aside
        aria-label="FleetGraph assistant"
        className={cn(
          'fixed inset-y-0 right-0 z-[60] w-full max-w-[26rem] transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        )}
      >
        <div className="flex h-full flex-col border-l border-white/10 bg-[#151515]/96 shadow-[-24px_0_64px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 via-cyan-400/10 to-sky-500/20 text-emerald-100">
                    <FleetGraphGlyph className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">FleetGraph</div>
                    <div className="text-xs text-muted">Context-aware work assistant</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                    {pageContext?.kind === 'my_week' || activeView?.surface === 'my_week'
                      ? 'My Week'
                      : 'Current view'}
                  </span>
                  {latestCompletedTurn && (
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                        latestSeverityStyle.badgeClassName
                      )}
                    >
                      {latestSeverityStyle.label}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {contextSummary ||
                    pageContext?.summary ||
                    'Ask about the work you are looking at without leaving this page.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted transition-colors hover:bg-white/10 hover:text-foreground"
                aria-label="Close FleetGraph"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={historyRef}
            className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
          >
            {turns.length === 0 ? (
              <div
                className={cn(
                  'rounded-[28px] border border-white/10 bg-gradient-to-br p-5',
                  latestSeverityStyle.accentClassName
                )}
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-black/25 text-emerald-100">
                  <FleetGraphGlyph className="h-8 w-8" />
                </div>
                <div className="mt-5 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Ask FleetGraph about this work
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {unavailableReason ??
                      pageContext?.summary ??
                      'Type a question or use a prompt below to get a grounded answer from the current page context.'}
                  </p>
                </div>

                {quickPrompts.length > 0 && (
                  <div className="mt-5 grid gap-3">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void submitQuestion(prompt);
                        }}
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-black/30"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              turns.map((turn) => {
                const result = turn.result;
                const severity = result?.derivedSignals.severity ?? 'none';
                const severityStyle = SEVERITY_STYLES[severity];
                const summary = buildSummary(result, turn.pageContext);
                const responseError = result?.error?.message ?? turn.error;
                const isBusy = activeTurnId === turn.id;
                const pendingApproval = result?.pendingApproval ?? null;
                const derivedMetrics = result?.derivedSignals.metrics ?? null;
                const hasDerivedMetrics = Boolean(
                  derivedMetrics &&
                    (
                      derivedMetrics.totalIssues > 0 ||
                      derivedMetrics.completedIssues > 0 ||
                      derivedMetrics.inProgressIssues > 0 ||
                      derivedMetrics.standupCount > 0 ||
                      derivedMetrics.recentActiveDays > 0
                    )
                );
                const contextMetrics = turn.pageContext?.metrics ?? [];

                return (
                  <div key={turn.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[24px] bg-accent px-4 py-3 text-sm leading-6 text-white shadow-lg shadow-black/20">
                        {turn.question}
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="w-full max-w-full rounded-[28px] border border-white/10 bg-[#1b1b1b] p-4 shadow-lg shadow-black/20">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 via-cyan-400/10 to-sky-500/20 text-emerald-100">
                              <FleetGraphGlyph className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">FleetGraph</div>
                              <div className="text-xs text-muted">Grounded answer</div>
                            </div>
                          </div>
                          {result && (
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                severityStyle.badgeClassName
                              )}
                            >
                              {severityStyle.label}
                            </span>
                          )}
                        </div>

                        {turn.status === 'running' && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted">
                            FleetGraph is analyzing this view...
                          </div>
                        )}

                        {responseError && (
                          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
                            {responseError}
                          </div>
                        )}

                        {summary && (
                          <div className="mt-4 space-y-4">
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                              <p className="text-sm leading-7 text-foreground">{summary}</p>
                              {result?.reasoning?.whyNow && (
                                <p className="mt-3 text-xs leading-6 text-muted">{result.reasoning.whyNow}</p>
                              )}
                              {result?.reasoning?.recommendedNextStep && (
                                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                    Recommended next step
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-foreground">
                                    {result.reasoning.recommendedNextStep}
                                  </p>
                                </div>
                              )}
                            </div>

                            {hasDerivedMetrics ? (
                              <div className="grid grid-cols-2 gap-2">
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
                            ) : contextMetrics.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {contextMetrics.map((metric: FleetGraphPageContext['metrics'][number]) => (
                                  <Metric
                                    key={`${metric.label}-${metric.value}`}
                                    label={metric.label}
                                    value={metric.value}
                                  />
                                ))}
                              </div>
                            ) : null}

                            {result && result.derivedSignals.signals.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  What FleetGraph saw
                                </div>
                                <div className="space-y-2">
                                  {result.derivedSignals.signals.slice(0, 3).map((signal) => (
                                    <SignalItem key={signal.dedupeKey} signal={signal} />
                                  ))}
                                </div>
                              </div>
                            )}

                            {result?.reasoning?.evidence && result.reasoning.evidence.length > 0 && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Grounding evidence
                                </div>
                                <ul className="mt-2 space-y-1 text-sm leading-6 text-muted">
                                  {result.reasoning.evidence.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {result?.proposedAction && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Proposed action
                                </div>
                                <p className="mt-2 text-sm leading-6 text-foreground">
                                  {result.proposedAction.summary}
                                </p>
                                <p className="mt-2 text-xs leading-6 text-muted">
                                  {result.proposedAction.rationale}
                                </p>
                                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                    Draft comment
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-foreground">
                                    {result.proposedAction.draftComment}
                                  </p>
                                </div>

                                {pendingApproval && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'approve');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed bg-border/70 text-muted'
                                          : 'bg-accent text-white hover:bg-accent/90'
                                      )}
                                    >
                                      Approve and post
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'dismiss');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed border-white/10 text-muted'
                                          : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                                      )}
                                    >
                                      Dismiss
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDecision(turn.id, 'snooze');
                                      }}
                                      disabled={isBusy}
                                      className={cn(
                                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                                        isBusy
                                          ? 'cursor-not-allowed border-white/10 text-muted'
                                          : 'border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                                      )}
                                    >
                                      Snooze 4h
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {result?.actionResult && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                  Action outcome
                                </div>
                                <p className="mt-2 text-sm leading-6 text-foreground">
                                  {result.actionResult.summary}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 bg-[#121212]/90 px-5 py-4">
            {composer}
          </div>
        </div>
      </aside>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open FleetGraph"
          className="fixed bottom-5 right-5 z-[58] flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400 via-cyan-400 to-sky-500 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
        >
          <FleetGraphGlyph className="h-6 w-6" />
        </button>
      )}
    </>
  );
}

export default FleetGraphOnDemandPanel;
