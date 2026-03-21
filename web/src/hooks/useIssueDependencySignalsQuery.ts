import { useQuery } from '@tanstack/react-query';
import type { FleetGraphIssueDependencySignalsResponse } from '@ship/shared';
import { apiGet } from '@/lib/api';

function createIssueIdsKey(issueIds: string[]): string {
  return [...issueIds].sort().join(',');
}

async function fetchIssueDependencySignals(
  issueIds: string[]
): Promise<FleetGraphIssueDependencySignalsResponse> {
  const params = new URLSearchParams();
  params.set('issue_ids', createIssueIdsKey(issueIds));

  const response = await apiGet(`/api/issues/dependency-signals?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch issue dependency signals');
  }

  return response.json();
}

export function useIssueDependencySignalsQuery(issueIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['fleetgraph', 'issue-dependency-signals', createIssueIdsKey(issueIds)],
    queryFn: () => fetchIssueDependencySignals(issueIds),
    staleTime: 1000 * 60,
    enabled: enabled && issueIds.length > 0,
  });
}
