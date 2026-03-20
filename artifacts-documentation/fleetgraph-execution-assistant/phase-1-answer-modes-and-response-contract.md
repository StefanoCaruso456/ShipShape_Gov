# Phase 1: Answer Modes and Response Contract

## Goal

Stop FleetGraph from sounding like a generic summarizer on launcher and index surfaces.

Phase 1 introduces explicit answer modes so FleetGraph can distinguish:

- execution guidance
- current-page context guidance
- launcher guidance

## Why

Today, FleetGraph can produce strong execution-oriented answers on sprint-like surfaces, but it still uses the same general presentation pattern on surfaces such as:

- Documents
- Programs
- Projects
- Dashboard

That causes two problems:

1. launcher surfaces inherit execution-health framing they did not earn
2. the assistant feels inconsistent because it alternates between true execution help and generic narration

The first phase should fix the framing before we deepen the underlying context.

## What

Phase 1 adds a response contract that makes the answer mode explicit.

### Answer Modes

- `execution`
  Use when FleetGraph has real work-progress evidence and can make an execution judgment.
- `context`
  Use when FleetGraph is grounded in the current page and can explain what matters, but should not imply a true execution-health verdict.
- `launcher`
  Use when the page is mainly a list, directory, dashboard, or index and FleetGraph should guide the user to the next object to open.

### Product Behavior

- execution answers may use severity framing such as `Stable`, `Attention`, or `Needs action`
- context answers should present grounded guidance without pretending to score execution health
- launcher answers should help the user open the right next surface and should not present a health badge as if the current list page itself is healthy or unhealthy

## How

### Backend and Shared Contract

- add `answerMode` to FleetGraph reasoning types
- ensure sprint reasoning returns `execution`
- ensure current-view reasoning classifies the page into `context` or `launcher`

### Reasoning Behavior

- sprint/workflow reasoning keeps its current execution-oriented contract
- current-view reasoning should:
  - identify whether the page is a launcher or context surface
  - tailor `summary`
  - tailor `whyNow`
  - tailor `recommendedNextStep`

### UI Behavior

- use `answerMode` to decide whether to render an execution-health badge
- use labels that match the mode:
  - `Grounded execution guidance`
  - `Grounded page guidance`
  - `Launcher guidance`
- keep route buttons visible for launcher and context modes

## Purpose

The purpose of this phase is trust.

FleetGraph should not overstate what it knows. When it has real execution evidence, it should say so. When it only has page context or launcher context, it should still be useful, but it should be honest about the kind of help it is giving.

## Outcome

At the end of Phase 1:

- Documents and other launcher pages no longer feel like fake execution dashboards
- FleetGraph responses better match the surface the user is on
- the drawer presentation reinforces the product promise that FleetGraph is page-aware and workflow-aware

## Scope

In scope:

- reasoning contract changes
- current-view answer-mode classification
- UI treatment by answer mode
- tests for launcher-mode rendering

Out of scope:

- deeper My Week signal enrichment
- new action generation logic
- broader follow-up question expansion
- instrumentation and metrics

## Likely Files

- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/fleetgraph.ts`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/types.ts`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/reasoning/reason-about-sprint.ts`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/services/fleetgraph-reasoner.ts`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx`
- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.test.tsx`

## Exit Criteria

Phase 1 is complete when:

1. FleetGraph reasoning includes an explicit answer mode
2. sprint/workflow answers render as execution guidance
3. programs/documents/dashboard-style pages render as launcher guidance
4. context surfaces render grounded page guidance without misleading execution-health framing
5. tests cover at least one launcher-mode and one execution-mode rendering path

## What Phase 1 Unlocks

Once this phase is in place, Phase 2 can safely deepen My Week and current-view context without piling richer reasoning onto the wrong UI contract.

## Status

As of 2026-03-19:

- implementation: complete
- targeted verification: complete
- committed and pushed: complete
- PR opened: complete
- merged to `main`: not yet
- live on production: not yet

So yes: Phase 1 is complete as an implementation phase, but it is not complete as a merged/live product phase yet.
