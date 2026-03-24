# FleetGraph Role Notification Matrix

## Purpose

This note makes the proactive FleetGraph popup policy explicit:

- who gets notified
- when they get notified
- how the popup is surfaced in Ship

## How Popups Surface

FleetGraph role popups are surfaced in two paths:

1. `Realtime`
- Backend broadcasts `fleetgraph:finding` to the targeted user after a new finding is persisted and should notify.
- The app listens for that event and shows the toast immediately.

2. `Recent backfill`
- On app load, the client fetches the current user's unresolved findings feed.
- Only findings whose `lastNotifiedAt` is still recent are replayed as popups.
- Older unresolved findings stay in the feed, but do not replay as fresh popups.

## Sweep Signal Policy

These proactive findings come from the scheduled/shared-graph sweep.

| Sweep signal family | Responsible owner | Accountable | Manager | Team |
|---|---:|---:|---:|---:|
| Approval follow-up (`changes_requested_plan`, `changes_requested_review`) | Yes | Yes | No | Yes |
| Coordination risk (`scope_growth`, `blocked_work`, `dependency_risk`, `throughput_gap`, `staffing_pressure`, `workload_concentration`) | Yes | Yes | Action only for stalled/support subset | Yes |
| Stalled execution (`work_not_started`, `low_recent_activity`, `no_completed_work`) | Yes | Yes | Action only | No |
| Ownership gap (`issue_unassigned_in_active_sprint`, `issue_missing_project_context_in_active_sprint`) | Yes | Yes | No | Yes |
| Review hygiene (`missing_review`) | Yes | Yes | No | No |

## Event Trigger Policy

These proactive findings come from mutation-driven Ship events.

| Trigger | Primary recipient | Accountable | Manager | Team |
|---|---|---:|---:|---:|
| `issue_added_after_sprint_start` | Responsible owner | Yes | No | Yes |
| `issue_open_on_last_sprint_day` | Issue assignee | Yes | Action only | Yes |
| `issue_reopened_after_done` | Issue assignee | Yes | Action only | Yes |
| `issue_blocker_logged` | Issue assignee | Yes | Action only | Yes |
| `sprint_active_without_owner` | Responsible owner | Yes | No | Yes |
| `sprint_plan_changes_requested` | Responsible owner | Yes | No | Yes |
| `sprint_review_changes_requested` | Responsible owner | Yes | No | Yes |

## Role Meanings In The Toast

- `responsible_owner`: owner follow-up
- `issue_assignee`: assigned issue follow-up
- `accountable`: decision needed
- `manager`: manager support
- `team_member`: team coordination

## Notes

- If one user qualifies through multiple roles, FleetGraph keeps the highest-priority role:
  - `issue_assignee`
  - `responsible_owner`
  - `accountable`
  - `manager`
  - `team_member`
- The popup CTA stays in-app and routes to the relevant sprint/week surface for review.
