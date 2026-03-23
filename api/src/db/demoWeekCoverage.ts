export type DemoWeekIssueState = 'done' | 'in_progress' | 'todo' | 'backlog';

export interface DemoFoundationWeekIssueTemplate {
  titleSuffix: string;
  priority: 'high' | 'medium' | 'low';
  estimate: number;
}

export const DEMO_FOUNDATION_WEEK_NUMBERS = [1, 2] as const;

export const DEMO_FOUNDATION_WEEK_2_ISSUES: DemoFoundationWeekIssueTemplate[] = [
  {
    titleSuffix: 'Week 2 kickoff baseline',
    priority: 'high',
    estimate: 3,
  },
  {
    titleSuffix: 'Week 2 follow-through',
    priority: 'medium',
    estimate: 2,
  },
] as const;

export function buildDemoProjectSprintNumbers(
  currentWeekNumber: number,
  templateName: string,
  pastWeeksToSeed: number
): number[] {
  const rollingWeekNumbers =
    templateName === 'Core Features'
      ? Array.from(
          { length: pastWeeksToSeed + 2 },
          (_, index) => currentWeekNumber + index - pastWeeksToSeed
        )
      : [currentWeekNumber, currentWeekNumber + 1];

  return [...new Set([...DEMO_FOUNDATION_WEEK_NUMBERS, ...rollingWeekNumbers])]
    .filter((weekNumber) => weekNumber > 0)
    .sort((left, right) => left - right);
}

export function resolveDemoWeekIssueState(
  currentWeekNumber: number,
  targetWeekNumber: number,
  issueIndex: number
): DemoWeekIssueState {
  if (targetWeekNumber < currentWeekNumber) {
    return 'done';
  }

  if (targetWeekNumber === currentWeekNumber) {
    return issueIndex === 0 ? 'done' : 'in_progress';
  }

  return issueIndex === 0 ? 'todo' : 'backlog';
}
