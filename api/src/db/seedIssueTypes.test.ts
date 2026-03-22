import { describe, expect, it } from 'vitest';
import { inferSeedIssueType } from './seedIssueTypes.js';

describe('inferSeedIssueType', () => {
  it('classifies bug-fix template issues as bugs', () => {
    expect(
      inferSeedIssueType({
        title: 'Bug Fixes: Define acceptance criteria',
        projectTemplateName: 'Bug Fixes',
      })
    ).toBe('bug');
  });

  it('classifies stretch and exploration work as spikes', () => {
    expect(
      inferSeedIssueType({
        title: 'Performance: Explore stretch improvements',
        projectTemplateName: 'Performance',
      })
    ).toBe('spike');
  });

  it('classifies test-coverage work as chores', () => {
    expect(
      inferSeedIssueType({
        title: 'Expand test coverage',
      })
    ).toBe('chore');
  });

  it('classifies core implementation work as stories', () => {
    expect(
      inferSeedIssueType({
        title: 'Implement core workflow',
        projectTemplateName: 'Core Features',
      })
    ).toBe('story');
  });

  it('falls back to a diverse mix for uncategorized issue titles', () => {
    const titles = [
      'Alpha follow-up',
      'Beta follow-up',
      'Gamma follow-up',
      'Delta follow-up',
      'Epsilon follow-up',
      'Zeta follow-up',
      'Eta follow-up',
      'Theta follow-up',
      'Iota follow-up',
      'Kappa follow-up',
    ];

    const types = new Set(titles.map((title) => inferSeedIssueType({ title })));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
});
