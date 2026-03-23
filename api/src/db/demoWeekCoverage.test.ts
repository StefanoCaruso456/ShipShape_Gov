import { describe, expect, it } from 'vitest';
import {
  buildDemoProjectSprintNumbers,
  DEMO_FOUNDATION_WEEK_NUMBERS,
  resolveDemoWeekIssueState,
} from './demoWeekCoverage.js';

describe('buildDemoProjectSprintNumbers', () => {
  it('always includes the foundation weeks for every project template', () => {
    const sprintNumbers = buildDemoProjectSprintNumbers(15, 'Bug Fixes', 6);

    expect(sprintNumbers).toEqual([1, 2, 15, 16]);
    expect(sprintNumbers).toEqual(expect.arrayContaining([...DEMO_FOUNDATION_WEEK_NUMBERS]));
  });

  it('preserves rolling history for Core Features while adding the foundation weeks', () => {
    const sprintNumbers = buildDemoProjectSprintNumbers(15, 'Core Features', 6);

    expect(sprintNumbers).toEqual([1, 2, 9, 10, 11, 12, 13, 14, 15, 16]);
  });
});

describe('resolveDemoWeekIssueState', () => {
  it('marks Week 2 issues as done once the workspace is past Week 2', () => {
    expect(resolveDemoWeekIssueState(15, 2, 0)).toBe('done');
    expect(resolveDemoWeekIssueState(15, 2, 1)).toBe('done');
  });

  it('gives the current sprint a done-plus-in-progress baseline', () => {
    expect(resolveDemoWeekIssueState(2, 2, 0)).toBe('done');
    expect(resolveDemoWeekIssueState(2, 2, 1)).toBe('in_progress');
  });

  it('keeps future foundation issues staged as todo and backlog', () => {
    expect(resolveDemoWeekIssueState(1, 2, 0)).toBe('todo');
    expect(resolveDemoWeekIssueState(1, 2, 1)).toBe('backlog');
  });
});
