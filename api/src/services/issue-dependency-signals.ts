import { pool } from '../db/client.js';
import type {
  FleetGraphIssueDependencySignal,
  FleetGraphIssueDependencySignalsResponse,
  FleetGraphIssueDependencyStatus,
} from '@ship/shared';

const STALE_BLOCKER_DAYS = 3;
const RECENT_BLOCKER_WINDOW_DAYS = 7;

type IssueIterationRow = {
  issue_id: string;
  status: FleetGraphIssueDependencyStatus;
  blockers_encountered: string | null;
  created_at: string | Date;
  author_name: string | null;
};

function normalizeBlockerText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized;
}

function diffDays(now: Date, value: string | Date): number {
  const target = value instanceof Date ? value : new Date(value);
  const ms = now.getTime() - target.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function buildIssueSignal(
  issueId: string,
  iterations: IssueIterationRow[],
  now: Date
): FleetGraphIssueDependencySignal | null {
  const latestIteration = iterations[0] ?? null;
  const latestBlockerIteration =
    iterations.find((iteration) => Boolean(normalizeBlockerText(iteration.blockers_encountered))) ?? null;

  if (!latestIteration && !latestBlockerIteration) {
    return null;
  }

  const latestBlockerText = normalizeBlockerText(latestBlockerIteration?.blockers_encountered ?? null);
  const hasUnresolvedBlocker =
    Boolean(normalizeBlockerText(latestIteration?.blockers_encountered ?? null)) &&
    latestIteration?.status !== 'pass';
  const blockerLoggedAt =
    (hasUnresolvedBlocker ? latestIteration?.created_at : latestBlockerIteration?.created_at) ?? null;
  const blockerAgeDays =
    hasUnresolvedBlocker && blockerLoggedAt ? diffDays(now, blockerLoggedAt) : null;
  const latestBlockerLoggedAt = latestBlockerIteration?.created_at ?? null;
  const hasRecentBlockerMention =
    latestBlockerLoggedAt !== null &&
    diffDays(now, latestBlockerLoggedAt) <= RECENT_BLOCKER_WINDOW_DAYS;

  return {
    issueId,
    latestStatus: latestIteration?.status ?? null,
    hasUnresolvedBlocker,
    hasRecentBlockerMention,
    blockerSummary: latestBlockerText,
    blockerLoggedAt: blockerLoggedAt ? new Date(blockerLoggedAt).toISOString() : null,
    blockerAgeDays,
    blockerLoggedBy: hasUnresolvedBlocker
      ? latestIteration?.author_name ?? latestBlockerIteration?.author_name ?? null
      : latestBlockerIteration?.author_name ?? null,
    isStale: hasUnresolvedBlocker && blockerAgeDays !== null && blockerAgeDays >= STALE_BLOCKER_DAYS,
  };
}

export async function listIssueDependencySignals(input: {
  workspaceId: string;
  issueIds: string[];
  requestedIssueCount?: number;
  now?: Date;
}): Promise<FleetGraphIssueDependencySignalsResponse> {
  const now = input.now ?? new Date();
  const issueIds = [...new Set(input.issueIds)];
  const requestedIssueCount = input.requestedIssueCount ?? issueIds.length;

  if (issueIds.length === 0) {
    return {
      summary: {
        requestedIssueCount,
        accessibleIssueCount: 0,
        unresolvedBlockerCount: 0,
        staleBlockedIssueCount: 0,
        recentBlockerMentionCount: 0,
        oldestUnresolvedBlockerDays: null,
      },
      issues: [],
    };
  }

  const result = await pool.query<IssueIterationRow>(
    `SELECT i.issue_id,
            i.status,
            i.blockers_encountered,
            i.created_at,
            u.name AS author_name
     FROM issue_iterations i
     LEFT JOIN users u ON i.author_id = u.id
     WHERE i.workspace_id = $1
       AND i.issue_id = ANY($2::uuid[])
     ORDER BY i.issue_id ASC, i.created_at DESC`,
    [input.workspaceId, issueIds]
  );

  const iterationsByIssue = new Map<string, IssueIterationRow[]>();
  for (const row of result.rows) {
    const entries = iterationsByIssue.get(row.issue_id) ?? [];
    entries.push(row);
    iterationsByIssue.set(row.issue_id, entries);
  }

  const issues = issueIds
    .map((issueId) => buildIssueSignal(issueId, iterationsByIssue.get(issueId) ?? [], now))
    .filter((signal): signal is FleetGraphIssueDependencySignal => Boolean(signal))
    .sort((left, right) => {
      if (Number(right.hasUnresolvedBlocker) !== Number(left.hasUnresolvedBlocker)) {
        return Number(right.hasUnresolvedBlocker) - Number(left.hasUnresolvedBlocker);
      }

      if ((right.blockerAgeDays ?? -1) !== (left.blockerAgeDays ?? -1)) {
        return (right.blockerAgeDays ?? -1) - (left.blockerAgeDays ?? -1);
      }

      return left.issueId.localeCompare(right.issueId);
    });

  const unresolvedBlockerCount = issues.filter((signal) => signal.hasUnresolvedBlocker).length;
  const staleBlockedIssueCount = issues.filter((signal) => signal.isStale).length;
  const recentBlockerMentionCount = issues.filter((signal) => signal.hasRecentBlockerMention).length;
  const oldestUnresolvedBlockerDays =
    issues
      .filter((signal) => signal.hasUnresolvedBlocker && signal.blockerAgeDays !== null)
      .reduce<number | null>(
        (oldest, signal) =>
          oldest === null || (signal.blockerAgeDays ?? 0) > oldest
            ? (signal.blockerAgeDays ?? oldest)
            : oldest,
        null
      );

  return {
    summary: {
      requestedIssueCount,
      accessibleIssueCount: issueIds.length,
      unresolvedBlockerCount,
      staleBlockedIssueCount,
      recentBlockerMentionCount,
      oldestUnresolvedBlockerDays,
    },
    issues,
  };
}
