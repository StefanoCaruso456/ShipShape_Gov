# Phase 3: Issues Surface Execution Reasoning

## Objective

Make FleetGraph reason over issue-list surfaces as real execution views, not generic document snapshots.

This phase covers pages like:

- program document on the `Issues` tab
- project document on the `Issues` tab
- issue-list surfaces that already show visible work rows, week grouping, ownership, and freshness

## Why

FleetGraph can still sound generic on issue-heavy surfaces even when the user is looking directly at the work.

Today, the assistant often notices:

- document title
- owner
- issue count
- week count
- selected tab

But it does not yet reason deeply over:

- the visible issue rows
- state mix
- not-started work
- stale work
- week clustering
- assignee patterns

That leads to weak answers such as:

- describing the page
- repeating generic grounding boilerplate
- telling the user to open another surface instead of answering the question they just asked

## What

Phase 3 adds a dedicated execution-reasoning layer for issue-list surfaces.

That means FleetGraph should be able to answer questions like:

- what is blocking delivery here
- what is stalled
- which week or issue cluster is the risk
- who owns the work that has not moved
- what should happen next from this issues surface

## How

Phase 3 should be built in this order:

1. add tab-aware page-context builders for program/project `Issues` views
2. pass richer issue-surface evidence into FleetGraph, including:
   - visible issue states
   - freshness and inactivity
   - week grouping
   - assignee grouping
   - in-progress vs todo vs done balance
3. add a dedicated reasoning path for issue surfaces instead of reusing generic current-view page guidance
4. tighten the response contract so answers start with a direct conclusion, then evidence, then next step
5. add targeted tests for questions like blockers, stale work, and scope still sitting in todo

## Purpose

The purpose of Phase 3 is to make FleetGraph useful when a PM or engineer is already on the worklist and wants a real answer without jumping to another page first.

This phase should let FleetGraph act more like:

- a scoped execution partner reading the worklist with you

And less like:

- a narrator describing the page chrome

## Outcome

When this phase is complete, FleetGraph should be able to say things like:

- there is no visible hard blocker, but Week 3 still has too much work sitting in todo
- these issues are the ones with no recent movement
- delivery risk is concentrated in one project slice or one assignee
- this work is moving, so the risk is scope balance rather than blockage

And then offer routes tied to the exact issue surface:

- open current sprint
- open the most stale issue
- open the project with the heaviest todo cluster

## Scope

Included in Phase 3:

- issue-surface page-context enrichment
- tab-aware issue-surface reasoning
- more direct answer contracts for issue questions
- route actions tied to the visible worklist
- targeted tests for issue-surface execution guidance

Not included in Phase 3:

- broader chat memory or long multi-turn planning
- new writeback action types
- starter/follow-up prompt redesign across every surface
- evaluation instrumentation beyond what is needed for the new surface behavior

## Exit Criteria

Phase 3 is complete when:

- program/project `Issues` tabs no longer default to generic page guidance for execution questions
- FleetGraph can answer blocker/staleness/risk questions from visible issue evidence
- answers feel specific to the current issue surface
- targeted tests cover the new reasoning path
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Key Touchpoints

- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/fleetgraph.ts)
- [resolve-context.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/resolve-context.ts)
- [reason-about-current-view.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts)
- [FleetGraphOnDemandPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx)

## Next Phase Unlocked

Phase 3 unlocks Phase 4:

- [phase-4-conversational-questioning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-4-conversational-questioning.md)

That order is intentional. Issue-list surfaces needed stronger evidence before conversational prompt work could become genuinely more useful instead of just sounding nicer.

## Delivery Status

Phase 3 is implemented on a stacked branch after Phase 2.

That means:

- the code is complete
- verification passed
- merge order still depends on Phase 2 landing first
