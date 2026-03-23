import { describe, expect, it, vi } from 'vitest';
import { personalizeFleetGraphProactiveFinding } from './fleetgraph-proactive-personalization.js';

vi.mock('./fleetgraph-langsmith.js', () => ({
  recordFleetGraphLangSmithChildRun: vi.fn().mockResolvedValue(undefined),
}));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('personalizeFleetGraphProactiveFinding', () => {
  it('keeps generic summaries unchanged when no work persona is set', async () => {
    const result = await personalizeFleetGraphProactiveFinding(
      {
        baseSummary: 'Week 12 has a blocker that is slowing the sprint.',
        recommendedNextStep: 'Confirm the unblock owner and escalate today if it is still uncommitted.',
        workPersona: null,
        audienceRole: 'responsible_owner',
        deliverySource: 'event',
        deliveryReason: 'Sent to you because you own the sprint.',
        triggerKind: 'issue_blocker_logged',
        parentLangSmithRunId: null,
      },
      logger
    );

    expect(result).toEqual({
      summary: 'Week 12 has a blocker that is slowing the sprint.',
      source: 'deterministic',
      applied: false,
    });
  });

  it('adds an engineer-specific action sentence for engineer recipients', async () => {
    const result = await personalizeFleetGraphProactiveFinding(
      {
        baseSummary: 'Week 12 has a blocker that is slowing the sprint.',
        recommendedNextStep: 'Confirm the unblock owner and escalate today if it is still uncommitted.',
        workPersona: 'engineer',
        audienceRole: 'issue_assignee',
        deliverySource: 'event',
        deliveryReason: 'Sent to you because your assigned issue is blocked.',
        triggerKind: 'issue_blocker_logged',
        parentLangSmithRunId: 'run-1',
      },
      logger
    );

    expect(result.applied).toBe(true);
    expect(result.source).toBe('deterministic');
    expect(result.summary).toContain('Week 12 has a blocker that is slowing the sprint.');
    expect(result.summary).toContain('As the engineer closest to the work');
    expect(result.summary).toContain('confirm the unblock owner');
  });
});
