# FleetGraph Execution Assistant Roadmap

## Objective

Turn FleetGraph into a context-aware execution assistant inside Ship.

FleetGraph should:

- follow the current page and workflow stage
- use real page data plus Ship system signals
- help PMs and engineers make execution decisions
- offer bounded next actions inside Ship

FleetGraph should not behave like a generic summarizer or a detached chatbot.

## Why

The current FleetGraph experience is uneven.

On execution surfaces like a sprint or scoped My Week view, FleetGraph can already:

- detect sprint-risk signals
- explain why the work needs attention
- propose a bounded follow-up action
- wait for human approval before mutating Ship

But on launcher or list pages, FleetGraph still falls back to generic page-summary language.

That creates two product problems:

1. the assistant feels strong on some surfaces and generic on others
2. generic "stable" or "summary" answers weaken the product story that FleetGraph is here to drive execution

## What

This roadmap focuses on five product outcomes:

1. FleetGraph answers in the right mode for the current surface
2. FleetGraph uses richer My Week and workflow-stage context
3. FleetGraph asks better PM and engineering questions
4. FleetGraph proposes sharper, more targeted next actions
5. FleetGraph becomes measurable as an execution assistant, not just a chat layer

## How

We will execute this in phases, each with a clear product contract and exit criteria.

The phases are ordered so that:

- the assistant first stops saying the wrong thing
- then gets richer execution context
- then gets stronger conversation flow
- then gets better action quality
- then gets stronger evaluation and iteration loops

## Purpose

The purpose of this roadmap is to make FleetGraph useful in the actual moments when PMs and engineers need help:

- deciding whether to intervene
- understanding what is slipping
- figuring out what changed
- identifying who needs a follow-up
- moving work forward without leaving Ship

## Outcome

When this roadmap is complete, FleetGraph should feel like:

- a PM and engineering execution partner
- a page-aware in-app assistant
- a bounded system that can recommend and draft actions safely

Not like:

- a generic summary panel
- a dashboard narrator
- a standalone chatbot

## Principles

- Keep reasoning grounded in current page context, fetched Ship evidence, and deterministic signals.
- Use different answer modes for different surfaces.
- Prefer crisp decisions and named evidence over soft summaries.
- Keep actions bounded, typed, and human-approved before mutation.
- Add instrumentation so we can tell whether the assistant is helping work move faster.

## Phases

| Phase | Name | Why | Outcome |
|---|---|---|---|
| 1 | Answer Modes and Response Contract | FleetGraph still sounds generic on launcher surfaces and sometimes presents misleading execution-health framing | FleetGraph distinguishes execution guidance from launcher guidance and uses the right response shape in chat |
| 2 | My Week Execution Depth | My Week still lacks enough workflow-stage and weekly-artifact context to drive strong answers | FleetGraph can reason over plan status, retro status, standups, project scope, freshness, and workflow stage |
| 3 | Conversational Questioning | Even good answers stall if the next prompt is generic | FleetGraph opens with PM-style starter prompts and evolves into sharper follow-up questions based on the answer theme |
| 4 | Action Quality and In-App Routing | Good advice is weaker if the follow-up target, owner, or route is vague | FleetGraph proposes tighter follow-up actions, route buttons, and document-opening paths tied to the exact work surface |
| 5 | Evaluation and Iteration Loop | We need to know whether FleetGraph is actually driving execution outcomes | FleetGraph has measurable usage, action, and follow-up metrics so the assistant can be improved against real product signals |

## Phase Order Rationale

Phase 1 comes first because FleetGraph must stop saying the wrong thing before it can say more sophisticated things.

If launcher pages still look like execution-health answers, every later improvement inherits the wrong framing.

## Active Phase

Phase 1 is the active phase.

See:

- [phase-1-answer-modes-and-response-contract.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-1-answer-modes-and-response-contract.md)

## Completion Standard

Each phase should leave behind:

- a documented product contract
- code changes aligned to that contract
- targeted tests
- a clear statement of what the next phase unlocks
