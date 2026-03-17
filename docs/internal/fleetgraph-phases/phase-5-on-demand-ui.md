# Phase 5: On-Demand UI

Status: `completed`

## What

Add the first embedded FleetGraph on-demand surface inside Ship.

## Why

The assignment requires on-demand mode, and the UI needs to feel native to the current Ship page instead of looking like a detached chatbot.

## How

- embed FleetGraph into the week document shell first
- reuse the already-implemented **Active View Context**
- support the MVP question:
  - why is this sprint at risk?
- render a grounded answer using:
  - fetched context
  - derived signals
  - finding summary
  - key metrics

## Purpose

Make FleetGraph usable from the current page or tab without introducing a separate app or agent surface.

## Outcome

- embedded contextual invocation
- same graph as proactive mode
- real page-aware on-demand behavior
- a user-visible FleetGraph entrypoint we can demo
- week-tab-aware answer rendering from real Ship evidence
