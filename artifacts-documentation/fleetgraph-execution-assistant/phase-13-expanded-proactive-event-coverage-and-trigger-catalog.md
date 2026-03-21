# Phase 13: Expanded Proactive Event Coverage and Trigger Catalog

## Objective

Expand proactive FleetGraph beyond the first event-driven slice so it can react to the broader scrum and workflow states that actually matter to PMs and engineers.

## Why

Phase 12 proved the mutation-driven event pattern with a small set of high-signal issue and sprint triggers.

That is a good foundation, but it is still too narrow.

FleetGraph still needs to notice conditions such as:

- no standup by the expected cutoff
- blocker age crossing an escalation threshold
- approval churn or review friction
- dependencies introduced or resolved
- issue reopened after done
- scope moved in or out late
- high-value work not started mid-sprint

## What

Phase 13 broadens the proactive trigger system in two dimensions:

1. more event sources
2. more deterministic trigger rules

New event sources should include:

- standup creation/update
- sprint approval and review actions
- issue iteration and blocker updates
- dependency-related comments or status changes
- issue reassignment and sprint movement

New trigger rules should include:

- issue in sprint with no owner or no project context
- issue marked `in_progress` with no update for `N` days
- explicit blocker older than `N` days
- dependency resolved and now worth surfacing
- issue reopened after done
- issue moved out of sprint late
- high-value issue not started by mid-sprint
- no standup by cutoff
- no completed work by mid-sprint
- sprint complete with no review

## How

Phase 13 should be built in this order:

1. extend the proactive event outbox to additional mutation sources
2. codify the expanded trigger registry by surface:
   - issue
   - sprint
   - scrum artifact
3. add thresholds, quieting windows, and dedupe policies per trigger
4. ensure every trigger emits structured evidence, not just a summary string
5. add focused tests for trigger eligibility and quiet/noisy boundaries

## Purpose

The purpose of Phase 13 is to make proactive FleetGraph notice the execution problems teams actually feel in day-to-day scrum work, not just the first obvious subset.

## Outcome

When Phase 13 is working well:

- proactive FleetGraph reacts to richer workflow changes
- findings are still deterministic and quiet by default
- PMs and engineers get signal for blockers, approvals, scope changes, and stale active work without waiting only on the periodic sweep

## Scope

Included in Phase 13:

- event coverage expansion
- trigger registry expansion
- thresholds, dedupe, and quieting rules
- targeted tests and docs

Not included in Phase 13:

- backlog/capacity pull-in logic
- scope-cut recommendation logic
- Slack/email delivery
- role-specific notification copy generation

## Exit Criteria

- proactive events exist for standups, approvals, dependency evidence, and late sprint movement
- trigger registry covers the agreed high-value scrum states
- quieting and dedupe rules are documented and test-covered
- findings remain bounded and deterministic

## Status

As of 2026-03-20:

- implementation status: not started
- verification status: not started
- merge-to-main status: not started
- production status: not live yet
