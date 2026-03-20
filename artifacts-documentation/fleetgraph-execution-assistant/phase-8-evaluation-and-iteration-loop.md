# Phase 8: Evaluation and Iteration Loop

## Objective

Make FleetGraph measurable against real product behavior so the team can improve the assistant from usage, follow-through, and action outcomes instead of intuition alone.

Phase 8 starts the evaluation loop by capturing:

- how users ask questions
- whether they open the drawer
- whether they follow FleetGraph route guidance
- how those user signals line up with the tool, approval, and latency telemetry added in Phase 7

## Why

By the end of Phase 7, FleetGraph can explain work, rank risk, route to the right surface, and emit bounded evidence-tool traces.

But we still need to know whether that behavior is actually helping execution.

Without an evaluation loop, we cannot answer questions like:

1. are users typing their own questions or relying on prompt chips
2. do follow-up prompts create deeper conversations or dead ends
3. do recommended routes get used
4. which surfaces still cause people to ask again, retry, or abandon the drawer

## What

Phase 8 adds the first product-evaluation slice on top of the existing telemetry foundation.

This phase adds:

- `question_source` tracking for on-demand questions:
  - typed composer questions
  - starter prompts
  - follow-up prompts
- a feedback event contract for:
  - `drawer_opened`
  - `route_clicked`
- backend telemetry logging for those feedback events
- drawer-side reporting for:
  - current-surface opens
  - question source
  - route follow-through context
- updated roadmap documentation for the evaluation loop

## How

Phase 8 is implemented in this order:

1. extend the shared FleetGraph contracts with typed evaluation events
2. pass `question_source` through the on-demand request into FleetGraph run telemetry
3. add a bounded `/api/fleetgraph/feedback` endpoint for usage and route-follow-through events
4. log those feedback events into the same downstream telemetry stream used by FleetGraph runs
5. wire the drawer to report opens and route interactions without blocking navigation
6. add targeted tests for:
  - request validation
  - question-source propagation
  - drawer-open evaluation reporting

## Purpose

The purpose of Phase 8 is to turn FleetGraph into an improvable product loop, not just a feature.

That means the team can measure:

- which entry points users trust
- which answers lead to follow-up
- which routes actually drive action
- where the assistant still feels generic or fails to convert

## Outcome

When this Phase 8 slice is working well:

- every on-demand run records whether it came from typed input, a starter prompt, or a follow-up prompt
- FleetGraph usage can be measured from drawer-open events
- route click-through can be tied back to the originating turn and answer mode
- tool, approval, latency, and user-follow-through signals can be analyzed together downstream

## Scope

Included in Phase 8:

- `question_source` request plumbing
- typed FleetGraph feedback event schema
- backend feedback telemetry logging
- drawer-open feedback reporting
- route-click feedback plumbing
- targeted tests and roadmap docs

Not included in Phase 8:

- a full analytics dashboard
- user-visible scorecards for FleetGraph evaluation metrics
- retention/cohort reporting outside FleetGraph
- automated experiment assignment or A/B testing

## Exit Criteria

Phase 8 is complete when:

- FleetGraph records question source for on-demand asks
- FleetGraph can record bounded feedback events for drawer opens and route clicks
- feedback events include enough surface context to analyze usage by page type
- targeted tests pass for request validation and drawer telemetry wiring
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Key Touchpoints

- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/fleetgraph.ts)
- [types.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/types.ts)
- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/fleetgraph.ts)
- [fleetgraph-telemetry.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/services/fleetgraph-telemetry.ts)
- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/fleetgraph.ts)
- [FleetGraphOnDemandPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx)

## Next Phase Unlocked

Phase 8 unlocks ongoing product iteration rather than a single next numbered phase.

From here, FleetGraph can improve based on:

- prompt usage patterns
- route click-through rates
- approval and dismissal trends
- error and retry patterns
- tool-latency and success-rate regressions

## Delivery Status

This Phase 8 slice leaves behind a usable evaluation foundation.

That means:

- the assistant now records how a question started
- the assistant now records whether people open it and follow its routes
- deeper experimentation and dashboarding can build on a real product telemetry loop instead of ad hoc logs
