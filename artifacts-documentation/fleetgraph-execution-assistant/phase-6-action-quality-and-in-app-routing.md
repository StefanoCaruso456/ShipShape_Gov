# Phase 6: Action Quality and In-App Routing

## Objective

Make FleetGraph's next actions sharper, more targeted, and easier to execute inside Ship.

Phase 6 improves the action layer that sits between reasoning and user follow-through:

- which route FleetGraph puts first
- why that route is the best next move
- how clearly the drawer points to the exact work surface that should be opened next

## Why

By the end of Phase 5, FleetGraph can answer from stronger execution evidence and business-value signals.

But the route layer is still too flat.

That creates three product problems:

1. route buttons can be useful but still feel interchangeable
2. the best next route is not always matched to the exact question the user asked
3. action quality stays weaker than reasoning quality if the drawer cannot explain why one route matters more than another

## What

Phase 6 makes route actions first-class execution guidance instead of plain navigation links.

This phase introduces:

- typed page-context actions with:
  - `intent`
  - `reason`
  - optional `owner`
- question-aware action ranking in both:
  - current-view reasoning
  - drawer route rendering
- stronger issue-surface and `My Week` actions that explain:
  - why a route matters
  - who it relates to
  - whether it is best used for follow-up, writing, completion, or inspection
- a primary action card plus secondary routes in the drawer

## How

Phase 6 is implemented in this order:

1. extend the shared FleetGraph page-action contract so actions can carry intent and rationale
2. pass the richer action shape through the FleetGraph API route validation layer
3. upgrade `My Week` and issue-surface page-context builders to emit targeted actions with reasons
4. teach current-view reasoning to choose the best route for the current question theme
5. teach the drawer to prioritize and highlight the strongest in-app route instead of rendering a flat list
6. add targeted tests for:
   - issue-surface action metadata
   - question-aware route prioritization
   - updated deterministic next-step wording

## Purpose

The purpose of Phase 6 is follow-through quality.

FleetGraph should not stop at a grounded answer.

It should also make the next move obvious, such as:

- open the highest-impact issue
- open the risk cluster week
- write today's update
- complete the missing retro

## Outcome

When Phase 6 is working well, FleetGraph should:

- choose the best route for the question that was actually asked
- explain why that route is the best next move
- show a clear primary action and then secondary routes
- keep action guidance grounded in visible Ship work instead of generic navigation advice

## Scope

Included in Phase 6:

- shared action intent/reason metadata
- API validation for richer page-context actions
- `My Week` route-action quality improvements
- issue-surface route-action quality improvements
- question-aware route prioritization in reasoning and UI
- targeted tests and roadmap/status documentation

Not included in Phase 6:

- new mutation executors
- auto-posting without human approval
- external messaging integrations
- long-lived action memory across sessions

## Exit Criteria

Phase 6 is complete when:

- FleetGraph page-context actions can carry intent and rationale
- issue surfaces expose targeted routes like highest-impact work and risk-cluster inspection
- `My Week` actions explain why a follow-up, write, or completion route matters
- current-view deterministic next steps pick the right route for the question theme
- the drawer highlights the strongest next route and keeps secondary routes available
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this phase doc

## Key Touchpoints

- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/fleetgraph.ts)
- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/fleetgraph.ts)
- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [reason-about-current-view.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts)
- [FleetGraphOnDemandPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx)
- [FleetGraphOnDemandPanel.test.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.test.tsx)

## Next Phase Unlocked

Phase 6 unlocks Phase 7:

- measurable usage, action, and follow-up instrumentation for the execution assistant

That order is intentional. FleetGraph should first make better route decisions before we start measuring whether those decisions are helping people move work faster.

## Delivery Status

Phase 6 is merged to `main`.

That means:

- the code is complete
- targeted verification passed
- merge is complete
- deploy verification is the remaining status step in this doc
