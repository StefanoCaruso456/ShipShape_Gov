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

This roadmap focuses on fifteen product outcomes:

1. FleetGraph answers in the right mode for the current surface
2. FleetGraph uses richer My Week and workflow-stage context
3. FleetGraph reasons over issue-list surfaces using real visible work, not just document metadata
4. FleetGraph asks better PM and engineering questions
5. FleetGraph uses business value signals alongside execution risk
6. FleetGraph proposes sharper, more targeted next actions
7. FleetGraph has a typed scrum evidence-tool registry with downstream telemetry
8. FleetGraph becomes measurable as an execution assistant, not just a chat layer
9. FleetGraph can point to explicit blockers and dependency drag, not just infer risk from stale work
10. FleetGraph answers issue-surface questions with intent-specific PM/agile guidance instead of reusing one generic response
11. FleetGraph proactive assistance can run safely in production, prove its runtime state, and evolve toward event-driven delivery
12. FleetGraph has a transactional proactive trigger foundation for mutation-driven scrum events
13. FleetGraph can detect a broader set of proactive scrum and workflow conditions from issue, sprint, standup, approval, dependency, and comment events
14. FleetGraph can reason about backlog pull-in, capacity opening, and scope/value tradeoffs before delivery slips
15. FleetGraph can target the right people, escalate appropriately, and deliver proactive findings through the right channel

## How

We will execute this in phases, each with a clear product contract and exit criteria.

The phases are ordered so that:

- the assistant first stops saying the wrong thing
- then gets richer weekly execution context
- then gets deeper issue-surface execution evidence
- then gets stronger conversation flow
- then learns what matters most to the business
- then gets better action quality
- then gets a typed evidence-tool and telemetry layer
- then gets stronger evaluation and iteration loops
- then gets direct blocker and dependency evidence for the work that needs follow-up
- then turns that evidence into sharper, question-specific conversational guidance
- then hardens proactive execution so production can trust worker auth, config, and runtime status before adding event-driven triggers
- then adds a typed proactive event outbox and trigger registry for the first event-driven scrum detections
- then broadens event coverage and trigger rules across the scrum workflow
- then adds backlog, capacity, and scope-tradeoff reasoning
- then turns proactive findings into better targeted, channel-aware delivery and escalation

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
| 7 | Scrum Evidence Tooling and Telemetry Registry | FleetGraph needs a typed, inspectable evidence layer before we can trust deeper tool use, telemetry, and evaluation | FleetGraph has a bounded read-only evidence-tool catalog, shared scrum tool context, per-tool traces, and downstream telemetry contracts |
| 8 | Evaluation and Iteration Loop | We need to know whether FleetGraph is actually driving execution outcomes | FleetGraph has measurable usage, action, tool, and follow-up metrics so the assistant can be improved against real product signals |
| 9 | Blocker and Dependency Evidence | FleetGraph still often infers delivery drag without naming the actual blocker, blocker owner, or blocker age | FleetGraph can surface explicit blocker evidence from issue updates, rank blocked work higher, and recommend the right follow-up path |
| 10 | Intent-Specific Conversational Reasoning | Issue-tab answers are grounded now, but they still reuse the same generic response shape across blockers, stalled work, cuts, and value-risk questions | FleetGraph answers issue-surface questions with direct PM/agile guidance tailored to the actual question intent and the right next decision |
| 11 | Proactive Hardening and Safe Enablement | Proactive FleetGraph exists in code but is disabled in production and not yet safe for multi-workspace worker auth | FleetGraph can be enabled safely in production with workspace-aware service auth, loaded worker config, and an admin-visible runtime status endpoint |
| 12 | Proactive Trigger Registry and Event Foundation | Safe proactive runtime is necessary but not enough; FleetGraph still needs mutation-driven entry points for high-signal scrum states | FleetGraph can enqueue issue and sprint events transactionally, evaluate deterministic trigger rules, and surface findings without waiting only on the next sweep |
| 13 | Expanded Proactive Event Coverage and Trigger Catalog | The first event-driven slice is useful, but proactive FleetGraph still misses key scrum conditions like missing standups, blocker-age thresholds, approval churn, dependency changes, and late scope movement | FleetGraph can react to the broader workflow states that PMs and engineers actually care about, with deterministic quieting and dedupe policies |
| 14 | Backlog, Capacity, and Scope Tradeoff Intelligence | Detecting drift is not enough if FleetGraph cannot suggest what to pull in, cut, or protect when capacity or value shifts | FleetGraph can identify when capacity opens, when higher-value backlog work should be pulled in, and when lower-value in-sprint work should move out |
| 15 | Notification Targeting, Escalation, and Delivery Channels | A proactive finding is only useful if it reaches the right person with the right urgency and context | FleetGraph can map findings to responsible/accountable roles, escalate appropriately, and deliver proactive guidance through in-app feed/toast first and optional external channels later |

## Phase Order Rationale

Phase 1 comes first because FleetGraph must stop saying the wrong thing before it can say more sophisticated things.

If launcher pages still look like execution-health answers, every later improvement inherits the wrong framing.

Phase 3 now comes before conversational work because better phrasing will not fix issue-tab answers if FleetGraph is still reasoning from thin document metadata instead of the actual visible worklist.

Phase 5 comes before action quality because FleetGraph should understand not just what is slipping, but what is commercially important, before it recommends follow-ups, cuts, or escalations.

Phase 7 now comes before evaluation because trustworthy measurement depends on a stable evidence-tool contract, shared telemetry fields, and bounded tool execution metadata.

Phase 9 comes after evaluation because the measurement layer is already in place and can now tell us whether explicit blocker evidence improves answer quality, route follow-through, and issue-tab usefulness.

Phase 10 comes after blocker evidence because conversational quality is only useful once FleetGraph can see the actual blocker, stalled-work, and cut-candidate evidence it needs to answer precisely.

Phase 11 comes after intent-specific reasoning because proactive delivery quality now depends less on wording and more on operational trust: safe auth, runtime visibility, and production activation.

Phase 12 comes after proactive hardening because event-driven triggers should only be added once the worker auth, config, and runtime visibility are safe enough to trust in production.

Phase 13 comes after the first trigger foundation because the system should prove out the outbox and consumer pattern on a small slice before broadening the event catalog across standups, approvals, dependencies, and scope changes.

Phase 14 comes after trigger expansion because backlog pull-in and scope-tradeoff recommendations depend on the broader proactive evidence layer already being in place.

Phase 15 comes after backlog and capacity reasoning because notification targeting and escalation quality depend on understanding not just that something changed, but what decision or action the team actually needs next.

## Proactive Coverage Map

The proactive direction discussed for FleetGraph is explicitly covered across Phases 11 through 15.

- safe proactive runtime in production:
  - covered by Phase 11
- event-driven triggers in addition to periodic sweeps:
  - covered by Phase 12
- broader proactive scrum condition coverage:
  - covered by Phase 13
- backlog, capacity-open, and scope-tradeoff reasoning:
  - covered by Phase 14
- targeting the right person, escalation policy, and delivery channels:
  - covered by Phase 15

This means the roadmap now covers the full proactive execution-agent direction:

- detect meaningful execution conditions without being asked
- decide when to stay quiet vs surface something
- reason about sprint, issue, dependency, backlog, and capacity state
- target the right person or role
- deliver actionable context instead of generic dashboard narration

## Active Phase

Phase 1 through Phase 12 are merged to `main`.

Phase 13 is the active roadmap phase.

See:

- [phase-1-answer-modes-and-response-contract.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-1-answer-modes-and-response-contract.md)
- [phase-2-my-week-execution-depth.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-2-my-week-execution-depth.md)
- [phase-3-issues-surface-execution-reasoning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-3-issues-surface-execution-reasoning.md)
- [phase-4-conversational-questioning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-4-conversational-questioning.md)
- [phase-5-business-value-scoring.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-5-business-value-scoring.md)
- [phase-6-action-quality-and-in-app-routing.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-6-action-quality-and-in-app-routing.md)
- [phase-7-scrum-evidence-tooling-and-telemetry.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-7-scrum-evidence-tooling-and-telemetry.md)
- [phase-8-evaluation-and-iteration-loop.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-8-evaluation-and-iteration-loop.md)
- [phase-9-blocker-and-dependency-evidence.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-9-blocker-and-dependency-evidence.md)
- [phase-10-intent-specific-conversational-reasoning.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-10-intent-specific-conversational-reasoning.md)
- [phase-11-proactive-hardening-and-safe-enablement.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-11-proactive-hardening-and-safe-enablement.md)
- [phase-12-proactive-trigger-registry-and-event-foundation.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-12-proactive-trigger-registry-and-event-foundation.md)
- [phase-13-expanded-proactive-event-coverage-and-trigger-catalog.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-13-expanded-proactive-event-coverage-and-trigger-catalog.md)
- [phase-14-backlog-capacity-and-scope-tradeoff-intelligence.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-14-backlog-capacity-and-scope-tradeoff-intelligence.md)
- [phase-15-notification-targeting-escalation-and-delivery-channels.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-15-notification-targeting-escalation-and-delivery-channels.md)
- [tooling-registry.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/tooling-registry.md)

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
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 6 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 7 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 8 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 9 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this roadmap doc

Phase 10 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: live

Phase 11 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: live foundation, worker activation still config-gated

Phase 12 status:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: live

Phase 13 status:

- implementation status: in progress
- verification status: passed for the current event-expansion slice
- merge-to-main status: not started
- production status: not live yet

Phase 14 status:

- implementation status: not started
- verification status: not started
- merge-to-main status: not started
- production status: not live yet

Phase 15 status:

- implementation status: not started
- verification status: not started
- merge-to-main status: not started
- production status: not live yet

## Completion Standard

Each phase should leave behind:

- a documented product contract
- code changes aligned to that contract
- targeted tests
- a clear statement of what the next phase unlocks
