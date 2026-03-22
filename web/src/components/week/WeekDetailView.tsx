import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StandupFeed } from '@/components/StandupFeed';
import { IssuesList } from '@/components/IssuesList';
import { WeekAnalyticsPanel } from './WeekAnalyticsPanel';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface WeekDetail {
  id: string;
  name: string;
  sprint_number: number;
  workspace_sprint_start_date: string;
  owner: { id: string; name: string; email: string } | null;
  issue_count: number;
  completed_count: number;
  plan: string | null;
}

export interface WeekIssue {
  id: string;
  title: string;
  state: string;
  priority: string;
  ticket_number: number;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_archived?: boolean;
  display_id: string;
  sprint_ref_id: string | null;
  story_points: number | null;
  estimate_hours: number | null;
  estimate: number | null;
}

export interface WeekDetailViewProps {
  sprintId: string;
  programId?: string;
  projectId?: string;
  onBack: () => void;
}

/**
 * WeekDetailView - Three-column layout showing week burndown, standups, and issues.
 * Used in both ProgramSprintsTab and ProjectSprintsTab for viewing sprint details.
 */
export function WeekDetailView({
  sprintId,
  programId,
  projectId,
  onBack,
}: WeekDetailViewProps) {
  const [sprint, setSprint] = useState<WeekDetail | null>(null);
  const [issues, setIssues] = useState<WeekIssue[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch sprint details and issues
  useEffect(() => {
    let cancelled = false;

    async function fetchSprintData() {
      try {
        const [sprintRes, issuesRes] = await Promise.all([
          fetch(`${API_URL}/api/weeks/${sprintId}`, { credentials: 'include' }),
          fetch(`${API_URL}/api/weeks/${sprintId}/issues`, { credentials: 'include' }),
        ]);

        if (cancelled) return;

        if (sprintRes.ok) {
          setSprint(await sprintRes.json());
        }
        if (issuesRes.ok) {
          setIssues(await issuesRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch sprint data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSprintData();
    return () => { cancelled = true; };
  }, [sprintId]);

  if (loading || !sprint) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted">Loading week...</div>
      </div>
    );
  }

  const progress = sprint.issue_count > 0
    ? Math.round((sprint.completed_count / sprint.issue_count) * 100)
    : 0;
  const analyticsLinks = [
    { id: 'report', label: 'Sprint Report' },
    { id: 'velocity', label: 'Velocity' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'flow', label: 'Flow' },
    { id: 'workload', label: 'Workload' },
    { id: 'hygiene', label: 'Hygiene' },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Sprint header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className="text-muted hover:text-foreground transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">{sprint.name}</h2>
            {sprint.owner && (
              <p className="text-sm text-muted">{sprint.owner.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/documents/${sprintId}/analytics`}
              className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20 transition-colors"
              title="Open analytics dashboard"
            >
              <span>Analytics</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19h16M7 16V8m5 8V5m5 11v-6" />
              </svg>
            </Link>
            <Link
              to={`/documents/${sprintId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-border/50 rounded-md transition-colors"
              title="Open week document"
            >
              <span>Open</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted">
            {sprint.completed_count}/{sprint.issue_count} done
          </span>
        </div>
      </div>

      {/* Two-column layout: Left (1/3 - Progress + Standups) | Right (2/3 - Issues) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Sprint Progress (fixed) + Standups (scrollable) */}
        <div className="w-1/3 min-w-[320px] max-w-[400px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
          {/* Analytics launcher + compact snapshot */}
          <div className="flex-shrink-0 border-b border-border p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Analytics</h3>
                <p className="mt-1 text-xs text-muted">
                  Burn, velocity, forecast, flow, workload, and hygiene for this week.
                </p>
              </div>
              <Link
                to={`/documents/${sprintId}/analytics`}
                className="rounded-md border border-border bg-border/20 px-2.5 py-1.5 text-xs text-foreground hover:bg-border/40 transition-colors"
              >
                Open dashboard
              </Link>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {analyticsLinks.map((link) => (
                <Link
                  key={link.id}
                  to={`/documents/${sprintId}/analytics?view=${link.id}`}
                  className="rounded-full border border-border bg-border/15 px-3 py-1 text-xs text-muted hover:text-foreground hover:bg-border/30 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <WeekAnalyticsPanel sprintId={sprintId} compact />
          </div>

          {/* Standups - Scrollable with fixed header */}
          <div className="flex-1 overflow-hidden">
            <StandupFeed sprintId={sprintId} />
          </div>
        </div>

        {/* Right Column: Issues List (2/3) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <IssuesList
            lockedSprintId={sprintId}
            viewModes={['list', 'kanban']}
            initialViewMode="list"
            filterTabs={null}
            showCreateButton={true}
            showBacklogPicker={true}
            allowShowAllIssues={true}
            showProjectFilter={!projectId}
            inheritedContext={{
              programId,
              projectId,
              sprintId,
            }}
            emptyState={
              <div className="flex h-full items-center justify-center">
                <p className="text-muted">No issues in this week</p>
              </div>
            }
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
