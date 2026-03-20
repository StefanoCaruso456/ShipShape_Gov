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

This roadmap focuses on seven product outcomes:

1. FleetGraph answers in the right mode for the current surface
2. FleetGraph uses richer My Week and workflow-stage context
3. FleetGraph reasons over issue-list surfaces using real visible work, not just document metadata
4. FleetGraph asks better PM and engineering questions
5. FleetGraph uses business value signals alongside execution risk
6. FleetGraph proposes sharper, more targeted next actions
7. FleetGraph becomes measurable as an execution assistant, not just a chat layer

## How

We will execute this in phases, each with a clear product contract and exit criteria.

The phases are ordered so that:

- the assistant first stops saying the wrong thing
- then gets richer weekly execution context
- then gets deeper issue-surface execution evidence
- then gets stronger conversation flow
- then learns what matters most to the business
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

## Delivery Rule

FleetGraph roadmap work follows an explicit delivery rule:

1. commit the verified work
2. push the branch
3. open or update the pull request
4. report whether the phase is only implemented, merged, or live

See:

- [delivery-rule.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/delivery-rule.md)

## Phases

| Phase | Name | Why | Outcome |
|---|---|---|---|
| 1 | Answer Modes and Response Contract | FleetGraph still sounds generic on launcher surfaces and sometimes presents misleading execution-health framing | FleetGraph distinguishes execution guidance from launcher guidance and uses the right response shape in chat |
| 2 | My Week Execution Depth | My Week still lacks enough workflow-stage and weekly-artifact context to drive strong answers | FleetGraph can reason over plan status, retro status, standups, project scope, freshness, and workflow stage |
| 3 | Issues Surface Execution Reasoning | Program/project issue tabs still fall back to generic document guidance instead of reasoning over the visible worklist | FleetGraph can answer issue-surface questions from state mix, freshness, week grouping, assignee signals, and visible issue rows |
| 4 | Conversational Questioning | Even good answers stall if the next prompt is generic | FleetGraph opens with PM-style starter prompts and evolves into sharper follow-up questions based on the answer theme |
| 5 | Business Value and Impact Scoring | FleetGraph still knows what is risky before it knows what matters most to the business | FleetGraph can rank visible work using both execution attention and project business value from ROI, retention, acquisition, and growth |
| 6 | Action Quality and In-App Routing | Good advice is weaker if the follow-up target, owner, or route is vague | FleetGraph proposes tighter follow-up actions, route buttons, and document-opening paths tied to the exact work surface |
| 7 | Evaluation and Iteration Loop | We need to know whether FleetGraph is actually driving execution outcomes | FleetGraph has measurable usage, action, and follow-up metrics so the assistant can be improved against real product signals |

## Phase Order Rationale

Phase 1 comes first because FleetGraph must stop saying the wrong thing before it can say more sophisticated things.

If launcher pages still look like execution-health answers, every later improvement inherits the wrong framing.

Phase 3 now comes before conversational work because better phrasing will not fix issue-tab answers if FleetGraph is still reasoning from thin document metadata instead of the actual visible worklist.

Phase 5 comes before action quality because FleetGraph should understand not just what is slipping, but what is commercially important, before it recommends follow-ups, cuts, or escalations.

## Active Phase

Phase 1 through Phase 4 are merged to `main`.

Phase 5 and Phase 6 implementations are complete and awaiting merge.

See:

- [phase-1-answer-modes-and-response-contract.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-1-answer-modes-and-response-contract.md)
- [phase-2-my-week-execution-depth.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-2-my-week-execution-depth.md)
- [phase-3-issues-surface-execution-reasoning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-3-issues-surface-execution-reasoning.md)
- [phase-4-conversational-questioning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-4-conversational-questioning.md)
- [phase-5-business-value-scoring.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-5-business-value-scoring.md)
- [phase-6-action-quality-and-in-app-routing.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-6-action-quality-and-in-app-routing.md)

## Current Status

As of 2026-03-20:

- Phase 1 implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: live

Phase 1 is therefore complete as both an implementation phase and a merged/live product phase.

Phase 2 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 3 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 4 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 5 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

Phase 6 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Completion Standard

Each phase should leave behind:

- a documented product contract
- code changes aligned to that contract
- targeted tests
- a clear statement of what the next phase unlocks
