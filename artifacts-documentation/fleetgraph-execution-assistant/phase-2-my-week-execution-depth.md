# Phase 2: My Week Execution Depth

## Objective

Deepen FleetGraph's `My Week` context so it can reason over weekly execution, not just weekly documents.

Phase 2 should make `My Week` feel like a real execution surface by combining:

- weekly plan status
- weekly retro status
- daily update coverage
- assigned project scope
- project freshness and attention signals

## Why

Phase 1 fixed answer framing, but `My Week` could still sound thin.

The page already knew whether a plan, retro, or standup existed, but it still treated assigned projects mostly as labels and routes. That left FleetGraph without enough depth to answer questions like:

- which project needs attention first
- whether assigned work is actually moving
- where the user should drill in next

Without project-level execution signals, FleetGraph still risked sounding like a weekly checklist narrator instead of an execution assistant.

## What

Phase 2 adds sprint-scoped project execution signals to the `My Week` page context.

That includes:

- sprint-linked project issue counts
- current scoped-week activity counts
- active-day freshness signals
- latest issue update timestamps
- top-attention project ranking
- direct routes into the project sprint issues tab

## How

Phase 2 is implemented in three layers:

1. `GET /api/dashboard/my-week` now returns richer project execution data for the selected week.
2. The web `My Week` query types now carry sprint, issue-count, and activity fields.
3. `useFleetGraphPageContext` now derives project attention and freshness insights, then exposes them through:
   - stronger `summary`
   - tighter `metrics`
   - more specific `items`
   - sprint-opening `actions`

## Purpose

The purpose of Phase 2 is to help a PM or engineer answer:

- what in my week is actually slipping
- which assigned project needs attention first
- whether work has started or gone stale
- where should I click next to move execution forward

## Outcome

When Phase 2 is working well, FleetGraph should be able to say things like:

- this assigned project has scoped work but none of it has started
- this project has gone quiet this week
- this project still has unfinished work from a prior week
- this other project has fresh movement and is already in flight

And then offer a direct in-app route to the exact sprint or project that should be opened next.

## Scope

Included in Phase 2:

- richer `My Week` API response for assigned projects
- stronger `My Week` page-context summarization
- project freshness and attention heuristics
- sprint-tab route buttons for top-attention projects
- targeted tests for the new `My Week` context behavior

Not included in Phase 2:

- broader conversational follow-up logic
- new FleetGraph mutation actions
- deeper PM/engineering starter-question redesign
- production rollout status updates beyond the normal delivery rule

## Exit Criteria

Phase 2 is complete when:

- `My Week` includes assigned-project execution signals beyond simple labels
- FleetGraph can distinguish projects that are moving from projects that need attention
- the top project route opens the sprint issues surface when available
- the behavior is covered by targeted tests
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Key Touchpoints

- [dashboard.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/dashboard.ts)
- [dashboard.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/openapi/schemas/dashboard.ts)
- [useMyWeekQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useMyWeekQuery.ts)
- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [useFleetGraphPageContext.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.test.ts)

## Next Phase Unlocked

Phase 2 unlocks Phase 3:

- [phase-3-issues-surface-execution-reasoning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-3-issues-surface-execution-reasoning.md)

That order is intentional. `My Week` needed better execution depth first, but issue-tab answers still need a dedicated reasoning phase before FleetGraph's conversational layer becomes meaningfully better.
