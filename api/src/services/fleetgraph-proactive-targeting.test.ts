import { describe, expect, it } from 'vitest';
import {
  buildEventAudienceRecipients,
  buildSweepAudienceRecipients,
  type FleetGraphAudienceContext,
} from './fleetgraph-proactive-targeting.js';

const baseContext: FleetGraphAudienceContext = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  weekId: '00000000-0000-0000-0000-000000000010',
  weekTitle: 'Week 12',
  weekOwnerUserId: '00000000-0000-0000-0000-000000000101',
  weekManagerUserId: '00000000-0000-0000-0000-000000000102',
  projectId: '00000000-0000-0000-0000-000000000201',
  projectOwnerUserId: '00000000-0000-0000-0000-000000000103',
  projectAccountableUserId: '00000000-0000-0000-0000-000000000104',
  programId: '00000000-0000-0000-0000-000000000301',
  programOwnerUserId: '00000000-0000-0000-0000-000000000105',
  programAccountableUserId: '00000000-0000-0000-0000-000000000106',
  sprintTeamUserIds: [
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000112',
  ],
};

describe('buildSweepAudienceRecipients', () => {
  it('fans coordination-heavy sweep findings out to owner, accountable, manager, and sprint team', () => {
    const recipients = buildSweepAudienceRecipients({
      context: baseContext,
      severity: 'action',
      signalKinds: ['blocked_work', 'dependency_risk'],
    });

    expect(recipients).toEqual([
      {
        userId: '00000000-0000-0000-0000-000000000101',
        audienceRole: 'responsible_owner',
        audienceScope: 'individual',
        deliveryReason:
          'Sent to you because you own the sprint or workstream that needs coordination next.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000104',
        audienceRole: 'accountable',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as accountable because this risk may need a tradeoff or unblock decision.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000102',
        audienceRole: 'manager',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as the owner manager because the sprint appears stalled or needs support.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000111',
        audienceRole: 'team_member',
        audienceScope: 'team',
        deliveryReason:
          'Shared with the sprint team because this affects shared sprint coordination or commitments.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000112',
        audienceRole: 'team_member',
        audienceScope: 'team',
        deliveryReason:
          'Shared with the sprint team because this affects shared sprint coordination or commitments.',
      },
    ]);
  });

  it('keeps stalled-work sweeps focused on owner, accountable, and manager without team-wide fanout', () => {
    const recipients = buildSweepAudienceRecipients({
      context: baseContext,
      severity: 'action',
      signalKinds: ['work_not_started'],
    });

    expect(recipients).toEqual([
      {
        userId: '00000000-0000-0000-0000-000000000101',
        audienceRole: 'responsible_owner',
        audienceScope: 'individual',
        deliveryReason:
          'Sent to you because you own the sprint or workstream that appears stalled.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000104',
        audienceRole: 'accountable',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as accountable because this risk may need a tradeoff or unblock decision.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000102',
        audienceRole: 'manager',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as the owner manager because the sprint appears stalled or needs support.',
      },
    ]);
  });
});

describe('buildEventAudienceRecipients', () => {
  it('keeps the direct issue assignee as the primary recipient while also escalating team-wide when needed', () => {
    const recipients = buildEventAudienceRecipients({
      context: {
        ...baseContext,
        sprintTeamUserIds: [
          '00000000-0000-0000-0000-000000000150',
          '00000000-0000-0000-0000-000000000111',
        ],
      },
      severity: 'action',
      triggerKind: 'issue_open_on_last_sprint_day',
      signalKinds: ['issue_open_on_last_sprint_day'],
      primaryUserId: '00000000-0000-0000-0000-000000000150',
      issueAssigneeUserId: '00000000-0000-0000-0000-000000000150',
    });

    expect(recipients).toEqual([
      {
        userId: '00000000-0000-0000-0000-000000000150',
        audienceRole: 'issue_assignee',
        audienceScope: 'individual',
        deliveryReason:
          'Sent to you because your assigned issue is still open at sprint closeout time.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000104',
        audienceRole: 'accountable',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as accountable because this risk may need a tradeoff or unblock decision.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000102',
        audienceRole: 'manager',
        audienceScope: 'individual',
        deliveryReason:
          'Escalated to you as the owner manager because the sprint appears stalled or needs support.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000111',
        audienceRole: 'team_member',
        audienceScope: 'team',
        deliveryReason:
          'Shared with the sprint team because this affects shared sprint coordination or commitments.',
      },
    ]);
  });

  it('routes approval-change events to owner, accountable, and team without manager escalation', () => {
    const recipients = buildEventAudienceRecipients({
      context: baseContext,
      severity: 'warning',
      triggerKind: 'sprint_plan_changes_requested',
      signalKinds: ['sprint_plan_changes_requested'],
      primaryUserId: '00000000-0000-0000-0000-000000000101',
      issueAssigneeUserId: null,
    });

    expect(recipients).toEqual([
      {
        userId: '00000000-0000-0000-0000-000000000101',
        audienceRole: 'responsible_owner',
        audienceScope: 'individual',
        deliveryReason:
          'Sent to you because you own the follow-up that the approval feedback now requires.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000104',
        audienceRole: 'accountable',
        audienceScope: 'individual',
        deliveryReason: 'Escalated to you as accountable because approval follow-up is needed.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000111',
        audienceRole: 'team_member',
        audienceScope: 'team',
        deliveryReason:
          'Shared with the sprint team because approval feedback changes what the team needs to align on next.',
      },
      {
        userId: '00000000-0000-0000-0000-000000000112',
        audienceRole: 'team_member',
        audienceScope: 'team',
        deliveryReason:
          'Shared with the sprint team because approval feedback changes what the team needs to align on next.',
      },
    ]);
  });
});
