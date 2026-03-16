# Phase 2: Context and Fetch

Status: `next`

## What

Wire FleetGraph to real Ship context and real Ship data:

- resolve the current page or tab
- expand that scope into related entities
- fetch the minimum needed data in parallel

## Why

The graph cannot reason correctly unless it knows what the user is looking at or what proactive scope it is monitoring.

## How

- use **Active View Context** from the UI
- map current Ship views to typed `contextEntity` inputs
- resolve related issue, week, project, program, or person scope
- fetch entity, activity, accountability, people, and supporting context in parallel
- add fallback behavior for missing or partial data

## Purpose

Turn the graph from an empty scaffold into a context-aware system grounded in Ship.

## Outcome

- on-demand mode knows the current Ship page or tab
- proactive mode knows the event or sweep scope
- fetches use real Ship REST data
