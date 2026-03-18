# Phase 5: On-Demand UI

Status: `completed`

## What

Add the first embedded FleetGraph on-demand surfaces inside Ship.

## Why

The assignment requires on-demand mode, and the UI needs to feel native to the current Ship page instead of looking like a detached chatbot.

## How

- embed FleetGraph into the week document shell first
- widen the same panel to project documents once project-to-sprint resolution exists
- expose the panel on My Week when one project is already in scope
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
- week/project/My Week answer rendering from real Ship evidence where sprint scope can be resolved cleanly
