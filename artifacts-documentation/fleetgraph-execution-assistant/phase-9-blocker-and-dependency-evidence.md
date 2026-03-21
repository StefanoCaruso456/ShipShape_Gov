# Phase 9: Blocker and Dependency Evidence

## Objective

Make FleetGraph name the actual blocker on the page when blocker evidence exists, instead of only inferring delivery risk from stale or not-started work.

Phase 9 gives FleetGraph a first explicit blocker-evidence path for issue surfaces so PMs and engineers can see:

- which issue is blocked
- how old the blocker is
- who logged it
- which blocked work needs follow-up first

## Why

FleetGraph already detects stale work, sprint slip, missing standups, and weak execution signals.

That is useful, but it still leaves an important product gap:

1. PMs need to know whether a delay is just slow execution or a named dependency/blocker that needs intervention
2. engineers need a faster answer to "what is blocked, by whom, and for how long?"
3. issue-surface answers feel incomplete if FleetGraph can only say "this looks risky" without naming the blocker evidence visible downstream in Ship

Phase 9 closes that gap by adding explicit blocker and dependency evidence to issue-surface reasoning.

## What

Phase 9 adds a bounded blocker-evidence slice across shared types, the API, page context, and current-view reasoning.

This phase adds:

- typed issue dependency-signal contracts in shared FleetGraph types
- a read-only API route that aggregates blocker evidence for visible issues
- issue-surface page-context enrichment with:
  - blocked issue counts
  - stale blocker counts
  - oldest blocker age
  - top blocked issue detail
- blocker-aware summary generation for issue-tab questions
- blocker-aware next actions, including follow-up routes
- targeted tests for the API route, page-context builder, and current-view reasoning

## How

Phase 9 is implemented in this order:

1. define shared blocker/dependency signal schemas
2. add a backend issue dependency-signal aggregator over `issue_iterations`
3. expose a bounded `GET /api/issues/dependency-signals` route for visible issue sets
4. hydrate issue-surface page context with explicit blocker metrics, items, and follow-up actions
5. teach current-view reasoning to answer blocker/dependency questions directly from that evidence
6. validate the slice with focused tests and typechecks

## Purpose

The purpose of Phase 9 is to make FleetGraph more operationally useful for the people actually driving the work.

For PMs, this phase helps answer:

- what is blocked right now
- which blocker is oldest
- which blocked issue should be escalated first

For engineers, this phase helps answer:

- which issue is waiting on someone else
- whether the blocker is recent or stale
- where to click to inspect or follow up next

## Outcome

When Phase 9 is working well:

- issue-tab answers can name explicit blocker evidence instead of only generic risk
- blocked work rises above unblocked but merely stale work
- the assistant can recommend a sharper blocker follow-up path
- blocker questions feel like execution help, not like another summary panel

## Scope

Included in Phase 9:

- issue dependency-signal schemas
- blocker aggregation from `issue_iterations`
- issue-surface blocker metrics and items
- blocker-aware execution summaries and next-step selection
- focused tests and roadmap docs

Not included in Phase 9:

- a full dependency graph across all Ship entities
- automatic blocker ownership resolution beyond the latest logged author
- proactive blocker notifications
- cross-team capacity balancing or workload planning

## Exit Criteria

Phase 9 is complete when:

- FleetGraph can fetch explicit blocker evidence for visible issue surfaces
- issue-surface answers can distinguish explicit blockers from generic execution risk
- blocker questions produce blocker-aware summaries and follow-up actions
- targeted tests pass across API, page-context, and reasoning layers
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Key Touchpoints

- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/fleetgraph.ts)
- [issue-dependency-signals.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/services/issue-dependency-signals.ts)
- [issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts)
- [useIssueDependencySignalsQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useIssueDependencySignalsQuery.ts)
- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [reason-about-current-view.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts)

## Next Phase Unlocked

Phase 9 unlocks a stronger next phase around ownership, scope drift, and escalation quality.

With explicit blocker evidence in place, FleetGraph can next get better at answering:

- who specifically needs a follow-up
- whether the blocker is a scope problem, dependency problem, or ownership problem
- when a blocker should stay local versus be escalated

## Delivery Status

This Phase 9 slice leaves behind a usable blocker-evidence foundation.

That means:

- the assistant can now read blocker evidence from issue updates
- the assistant can rank blocked work more directly
- the next delivery-quality improvements can focus on owner targeting and escalation policy instead of rebuilding basic blocker evidence
