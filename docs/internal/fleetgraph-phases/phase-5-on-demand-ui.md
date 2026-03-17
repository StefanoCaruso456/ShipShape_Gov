# Phase 5: On-Demand UI

Status: `next`

## What

Add the first embedded FleetGraph user surface inside Ship.

## Why

The assignment requires on-demand mode, and the UI needs to feel native to the current Ship page instead of looking like a detached chatbot.

## How

- embed FleetGraph into an existing week/sprint surface first
- pass the already-implemented **Active View Context** into the graph
- support the MVP question:
  - why is this sprint at risk?
- render the answer from graph evidence that already exists:
  - fetched context
  - derived signals
  - finding summary

## Purpose

Make FleetGraph usable from the current page or tab without introducing a separate app or agent surface.

## Outcome

- embedded contextual invocation
- same graph as proactive mode
- real page-aware on-demand behavior
- a user-visible FleetGraph entrypoint we can demo
