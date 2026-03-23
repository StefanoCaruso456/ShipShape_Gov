# FleetGraph Proactive Role Popup Manual Test Flows

This note is the manual verification checklist for proactive FleetGraph popup delivery by role.

## Goal

Verify that proactive FleetGraph findings:

- render as a blue `info` popup, not a red error toast
- stay visible until the user clicks `Dismiss`
- do not disappear when the user clicks the CTA
- use role-aware copy for the recipient
- route the user to the relevant Ship surface

## Shared Setup

Use one active sprint in a workspace with these relationships already wired:

- one issue assignee on an issue in the active sprint
- one responsible owner for the sprint, project, or program
- one accountable person on the parent project or program
- one manager in the responsible owner's `reports_to` chain
- one additional sprint team member who is not the owner or assignee

Manual test setup:

1. Open a separate logged-in browser window for each target role you want to observe.
2. Keep each recipient window inside the same workspace on any Ship page.
3. Trigger the event from a second actor window.
4. Wait up to `10` seconds for proactive event processing and realtime delivery.
5. For every passing case, verify:
   - the popup is blue
   - the popup prefix matches the role
   - the popup remains visible after `10+` seconds
   - clicking the CTA navigates but does not dismiss the popup
   - clicking `Dismiss` closes it

Role-aware popup prefixes:

- `issue_assignee` and `responsible_owner` -> `FleetGraph flagged`
- `accountable` and `manager` -> `FleetGraph escalated`
- `team_member` -> `FleetGraph shared`

## Issue Assignee

### Use case 1: Reopened after done

Trigger: `issue_reopened_after_done`

1. Open an issue that is assigned to the target assignee and already belongs to an active sprint.
2. Set the issue state to `Done`.
3. From a second session, reopen the same issue by changing the state to `Todo` or `In Progress`.
4. Wait for the proactive event worker to process the update.
5. In the assignee session, verify a blue FleetGraph popup appears with an `Open Issue` CTA and issue-follow-up language.

### Use case 2: Blocker logged on the assigned issue

Trigger: `issue_blocker_logged`

Current note: this path is API-assisted because the product does not yet expose a first-class issue-iteration entry form in the main UI.

1. Open the assigned issue in the assignee session and keep that window active.
2. In a second authenticated session, post an iteration update to the same issue:

```js
await fetch('/api/issues/<ISSUE_ID>/iterations', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'fail',
    what_attempted: 'Tried to continue implementation',
    blockers_encountered: 'Waiting on dependency review',
  }),
});
```

3. Wait for proactive processing.
4. Verify the assignee sees a blue FleetGraph popup with an `Open Issue` CTA and blocker-follow-up copy.

## Responsible Owner

### Use case 1: Issue added after sprint start

Trigger: `issue_added_after_sprint_start`

1. Open an active sprint whose start date has already passed.
2. From a second actor session, add an existing backlog issue into that sprint using `Add from Backlog`, or create a new issue directly into the active sprint.
3. Wait for proactive processing.
4. In the responsible-owner session, verify a blue FleetGraph popup appears with owner-follow-up language and an `Open Issues` or `Open Issue` CTA.

### Use case 2: Plan changes requested

Trigger: `sprint_plan_changes_requested`

1. Open the sprint in `Reviews` or the sprint review surface as a user who can request plan changes.
2. Request changes on the sprint plan and submit non-empty feedback.
3. Wait for proactive processing.
4. In the responsible-owner session, verify a blue FleetGraph popup appears with follow-up language and an `Open Plan` CTA.

## Accountable

### Use case 1: Issue added after sprint start

Trigger: `issue_added_after_sprint_start`

1. Keep the accountable user's session open in the workspace.
2. From a second actor session, add a backlog issue into the already-active sprint.
3. Wait for proactive processing.
4. Verify the accountable user receives a blue `FleetGraph escalated` popup with decision-oriented language.

### Use case 2: Review changes requested

Trigger: `sprint_review_changes_requested`

1. Open the sprint review surface as a user who can request retro/review changes.
2. Request changes with feedback.
3. Wait for proactive processing.
4. In the accountable session, verify a blue `FleetGraph escalated` popup appears with an `Open Review` CTA.

## Manager

### Use case 1: Reopened after done

Trigger: `issue_reopened_after_done`

1. Keep the responsible owner's manager logged in on any page in the same workspace.
2. Reopen a `Done` issue that is assigned inside the active sprint.
3. Wait for proactive processing.
4. Verify the manager receives a blue `FleetGraph escalated` popup with support-oriented language and an `Open Issue` CTA.

### Use case 2: Blocker logged on the assigned issue

Trigger: `issue_blocker_logged`

1. Keep the manager session open in the workspace.
2. Use the authenticated iteration `fetch` flow from the issue-assignee blocker test above on an issue in that manager's reporting chain.
3. Wait for proactive processing.
4. Verify the manager receives a blue `FleetGraph escalated` popup with support-oriented language and an `Open Issue` CTA.

## Team Member

### Use case 1: Sprint loses its owner

Trigger: `sprint_active_without_owner`

1. Open an active sprint with a visible owner.
2. In a second admin or owner-capable session, open the sprint sidebar and set `Owner` to `Unassigned`.
3. Wait for proactive processing.
4. In the extra sprint team-member session, verify a blue `FleetGraph shared` popup appears with coordination-oriented language.

### Use case 2: Plan changes requested

Trigger: `sprint_plan_changes_requested`

1. Keep a non-owner sprint team member logged in on any page in the workspace.
2. From a reviewer, accountable, or admin session, request changes on the sprint plan.
3. Wait for proactive processing.
4. Verify the team member receives a blue `FleetGraph shared` popup with an `Open Plan` CTA and alignment-oriented copy.

## Evidence In Code

- Popup rendering and persistence: [`web/src/components/ui/Toast.tsx`](../web/src/components/ui/Toast.tsx)
- Proactive popup invocation: [`web/src/pages/App.tsx`](../web/src/pages/App.tsx)
- Role-aware popup copy: [`web/src/lib/fleetgraph.ts`](../web/src/lib/fleetgraph.ts)
- Recipient targeting rules: [`api/src/services/fleetgraph-proactive-targeting.ts`](../api/src/services/fleetgraph-proactive-targeting.ts)
- Event enqueue and delivery pipeline: [`api/src/services/fleetgraph-proactive-events.ts`](../api/src/services/fleetgraph-proactive-events.ts)
