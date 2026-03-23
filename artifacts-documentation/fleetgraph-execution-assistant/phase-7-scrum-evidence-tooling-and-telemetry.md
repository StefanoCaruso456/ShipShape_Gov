# Phase 7: Scrum Evidence Tooling and Telemetry

## Objective

Give FleetGraph a typed, bounded evidence-tool layer for scrum work and a downstream telemetry contract that makes every tool call inspectable.

Phase 7 adds the missing architecture between page context and evaluation:

- shared scrum tool context
- read-only evidence-tool schemas
- per-tool call traces
- tool latency and error telemetry
- approval and loop-control telemetry that can be measured downstream

## Why

By the end of Phase 6, FleetGraph can reason better, route better, and propose stronger next moves.

But the evidence layer is still uneven:

- some reasoning is deterministic from page context
- some sprint reasoning uses backend fetches
- some model telemetry exists
- there is no single typed registry for FleetGraph evidence tools

That creates four product and engineering problems:

1. tool use is harder to standardize than action use
2. downstream telemetry is incomplete at the per-tool level
3. evaluation will be noisy if tool inputs and outputs are not normalized
4. React and backend reasoning can drift if they do not share a stable scrum context envelope

## What

Phase 7 introduces a bounded evidence-tool registry for scrum-oriented read paths.

This phase adds:

- a shared `ScrumToolContext` contract in TypeScript
- a read-only evidence-tool catalog for:
  - surface context
  - visible issue worklists
  - sprint snapshots
  - scrum artifact status
  - scope change signals
  - dependency signals
  - team ownership and capacity signals
- strict Zod-backed input and output schemas per tool
- a downstream telemetry schema for:
  - tool call latency
  - model latency
  - total run latency
  - loops and retry budgets
  - approval events
  - execution outcomes
- a documented tooling registry that explains each tool's purpose, schema, and operational expectations

## How

Phase 7 should be built in this order:

1. define the shared scrum context envelope and trace types in shared TypeScript
2. document the evidence-tool registry before implementing the executors
3. add read-only backend-owned tool executors behind strict schemas
4. record per-tool traces in graph state and response telemetry
5. normalize approval, loop, retry, and terminal-outcome telemetry
6. surface only the safe summarized trace to React while keeping richer traces downstream
7. add targeted tests for tool validation, telemetry emission, and guardrail behavior

## Purpose

The purpose of Phase 7 is trust and observability.

FleetGraph should not become an open-ended agent with invisible backend behavior.

It should become:

- a bounded execution assistant with typed scrum evidence tools
- a system whose tool use can be traced and evaluated
- an assistant whose loops, retries, approvals, and failures are measurable

## Outcome

When Phase 7 is working well:

- every tool call has a shared scrum context envelope
- every tool call has strict input and output validation
- every tool call emits downstream telemetry for latency, success, errors, and freshness
- approvals, retries, loop budgets, and terminal outcomes are inspectable
- evaluation can be built on stable, comparable traces instead of ad hoc logs

## Scope

Included in Phase 7:

- shared scrum tool context schema
- tooling registry documentation
- evidence-tool catalog for read-only scrum data
- tool call trace schema
- telemetry schema for model, tool, guardrail, and approval events
- targeted tests and roadmap docs

Not included in Phase 7:

- new write executors beyond the existing action catalog
- free-form backend tool access by the model
- external PM tooling integrations
- full product analytics dashboards

## Exit Criteria

Phase 7 is complete when:

- FleetGraph has a documented read-only scrum evidence-tool registry
- each tool has strict TypeScript and Zod-backed schemas
- shared tool context is available across backend reasoning paths
- per-tool telemetry is recorded for latency, success, and errors
- loop, retry, approval, and terminal-outcome telemetry is normalized
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: planned
- verification status: not started
- merge-to-main status: not started
- production status: not live yet

## Key Touchpoints

- [fleetgraph.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/fleetgraph.ts)
- [types.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/types.ts)
- [state.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/state.ts)
- [runtime.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/runtime.ts)
- [node-runtime.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/node-runtime.ts)
- [fleetgraph-skills-and-tools.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-skills-and-tools.md)
- [tooling-registry.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/tooling-registry.md)

## Next Phase Unlocked

Phase 7 unlocks Phase 8:

- evaluation and iteration with stable tool, reasoning, approval, and outcome telemetry

That order is intentional. FleetGraph should have a trustworthy evidence and telemetry layer before we judge whether the assistant is actually improving execution behavior.

## Delivery Status

Phase 7 is currently a documented architecture and execution contract.

That means:

- the direction is defined
- the implementation order is clear
- code changes have not started yet
