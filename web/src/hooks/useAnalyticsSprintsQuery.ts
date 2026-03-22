import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useProgramsQuery } from '@/hooks/useProgramsQuery';
import type { SprintsResponse, Sprint } from '@/hooks/useWeeksQuery';

export interface AnalyticsSprintSummary {
  id: string;
  title: string;
  subtitle: string;
  programId: string;
  programName: string;
  sprintNumber: number;
  status: Sprint['status'];
}

async function fetchProgramSprints(programId: string): Promise<SprintsResponse> {
  const res = await apiGet(`/api/programs/${programId}/sprints`);
  if (!res.ok) {
    const error = new Error('Failed to fetch program sprints') as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function hasAnalyticsSignal(week: Sprint) {
  return (
    week.issue_count > 0 ||
    week.completed_count > 0 ||
    week.started_count > 0 ||
    (week.total_estimate_hours ?? 0) > 0 ||
    Boolean(week.has_plan) ||
    Boolean(week.has_retro)
  );
}

function getProgramAnalyticsWeeks(weeks: Sprint[]) {
  const relevantWeeks = weeks.filter(hasAnalyticsSignal);
  const activeOrPlanning = relevantWeeks
    .filter((week) => week.status !== 'completed')
    .sort((left, right) => right.sprint_number - left.sprint_number);
  const recentCompleted = relevantWeeks
    .filter((week) => week.status === 'completed')
    .sort((left, right) => right.sprint_number - left.sprint_number)
    .slice(0, 6);

  const included = new Map<string, Sprint>();
  for (const week of [...activeOrPlanning, ...recentCompleted]) {
    included.set(week.id, week);
  }

  return Array.from(included.values()).sort((left, right) => {
    const statusRank = (status: Sprint['status']) => {
      switch (status) {
        case 'active':
          return 0;
        case 'planning':
          return 1;
        default:
          return 2;
      }
    };

    const statusDelta = statusRank(left.status) - statusRank(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return right.sprint_number - left.sprint_number;
  });
}

export function useAnalyticsSprintsQuery() {
  const programsQuery = useProgramsQuery();
  const programs = programsQuery.data ?? [];

  const sprintQueries = useQueries({
    queries: programs.map((program) => ({
      queryKey: ['analytics', 'program-sprints', program.id],
      queryFn: () => fetchProgramSprints(program.id),
      staleTime: 1000 * 60 * 5,
    })),
  });

  const data = useMemo<AnalyticsSprintSummary[]>(() => {
    const summaries: AnalyticsSprintSummary[] = [];

    programs.forEach((program, index) => {
      const query = sprintQueries[index];
      const weeks = query?.data?.weeks ?? [];

      for (const week of getProgramAnalyticsWeeks(weeks)) {
        summaries.push({
          id: week.id,
          title: week.name,
          subtitle: `${program.name} • Week ${week.sprint_number} • ${week.status}`,
          programId: program.id,
          programName: program.name,
          sprintNumber: week.sprint_number,
          status: week.status,
        });
      }
    });

    return summaries.sort((left, right) => {
      const statusRank = (status: Sprint['status']) => {
        switch (status) {
          case 'active':
            return 0;
          case 'planning':
            return 1;
          default:
            return 2;
        }
      };

      const statusDelta = statusRank(left.status) - statusRank(right.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      const programDelta = left.programName.localeCompare(right.programName);
      if (programDelta !== 0) {
        return programDelta;
      }

      return right.sprintNumber - left.sprintNumber;
    });
  }, [programs, sprintQueries]);

  const isLoading = programsQuery.isLoading || sprintQueries.some((query) => query.isLoading);
  const isError = programsQuery.isError || sprintQueries.some((query) => query.isError);
  const error =
    programsQuery.error ??
    sprintQueries.find((query) => query.error)?.error ??
    null;

  return {
    data,
    isLoading,
    isError,
    error,
  };
}
