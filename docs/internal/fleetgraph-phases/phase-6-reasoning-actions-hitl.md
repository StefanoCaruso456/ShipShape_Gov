# Phase 6: Reasoning, Actions, and HITL

Status: `complete for sprint/week MVP`

## What

Add explanation quality and safe action handling:

- reasoning node
- action proposal node
- human-in-the-loop gate
- approve / dismiss / snooze paths
- first approved action execution path
- action memory for suppressing repeated proposals

## Why

FleetGraph should not just detect problems. It should explain why they matter and what should happen next, while staying safe around consequential actions.

## How

- add a reasoning node on top of deterministic signals and fetched evidence
- keep the first reasoning slice on the supported surfaces that already resolve cleanly:
  - week documents
  - project documents
  - My Week when one project is in scope
- generate evidence-backed recommendations
- use an optional model-backed reasoner with deterministic fallback
- pause the graph before consequential mutations
- resume through a typed approval path
- execute one approved action safely:
  - post a sprint comment
- remember approve / dismiss / snooze decisions to avoid repeating the same draft action
- widen remaining Active View Context coverage after the first reasoning slice:
  - issue
  - program
  - dashboard

## Purpose

Turn FleetGraph from a detector into an agent that can explain and propose, while still staying safe.

## Outcome

- explanation path beyond deterministic signals
- draft follow-up and escalation proposals
- interrupt / resume path
- approve / dismiss / snooze behavior
- one approved action execution path
- action-memory suppression after prior human decisions
