# Phase 2: Context and Fetch

Status: `completed`

## What

Wire FleetGraph to real Ship context and real Ship data, starting with the sprint/week MVP slice:

- extend the current Ship document context with the active tab
- define a shared **Active View Context** contract
- invoke FleetGraph on-demand with the current sprint/week view
- fetch the minimum needed sprint/week data in parallel

## Why

The graph cannot reason correctly unless it knows what the user is looking at or what proactive scope it is monitoring.

## How

- use **Active View Context** from the UI
- extend `CurrentDocumentContext` to carry the active tab as part of the user’s working surface
- map supported Ship document views to typed FleetGraph entity inputs
- treat route-to-context adapters as the standard pattern for every supported surface
- add an on-demand FleetGraph API route that runs with the current user/session
- fetch sprint entity, document context, activity, and review/accountability context in parallel
- expand the week scope with related project and program IDs
- add fallback behavior for missing or partial data

Runtime rule:

- use app-native typed context for page awareness
- use Playwright only to verify that the UI is sending the right context
- do not use browser vision as the production mechanism

## Purpose

Turn the graph from an empty scaffold into a context-aware system grounded in Ship.

## Outcome

- sprint/week document pages now produce real Active View Context including the active tab
- on-demand FleetGraph requests can run through `/api/fleetgraph/on-demand`
- the graph now fetches real Ship REST data for the sprint-risk MVP:
  - `/api/documents/:id`
  - `/api/documents/:id/context`
  - `/api/activity/sprint/:id`
  - `/api/claude/context?context_type=review&sprint_id=:id`
- the graph expands sprint scope into related project and program context
- unsupported views still fall back to the scaffold path and will be widened in later phases through route-to-context adapters
