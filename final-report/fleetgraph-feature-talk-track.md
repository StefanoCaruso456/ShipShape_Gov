# FleetGraph Talk Track

Short presenter notes for [fleetgraph-feature-deck.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/final-report/fleetgraph-feature-deck.md).

Goal:
- keep each slide under 20 seconds
- stay tightly aligned to the visible slide
- sound smooth, direct, and relevant

## Slide 1 - FleetGraph

FleetGraph is our Ship intelligence layer for sprint risk. The key idea is simple: two modes, proactive and on-demand, both running through one shared graph so detection, reasoning, and action stay consistent.

## Slide 2 - Define The Problem

The problem is not lack of data. The problem is that sprint drift usually shows up as silence, scattered context, and missed follow-up, so teams notice it too late.

## Slide 3 - What FleetGraph Is

FleetGraph is one shared LangGraph system inside Ship. We designed it this way so proactive checks and user-invoked analysis reuse the same graph instead of splitting into two separate systems.

## Slide 4 - Agent Responsibility

Before writing code, we defined exactly what FleetGraph owns: monitoring sprint drift, explaining risk, and proposing the next move. That gave the feature a narrow scope, clear boundaries, and a stronger safety story.

## Slide 5 - Proactive Mode

In proactive mode, FleetGraph checks Ship without waiting for a prompt. The MVP proves this with a sweep path that finds active sprint issues, dedupes noisy findings, and delivers targeted alerts.

## Slide 6 - On-Demand Mode

On-demand mode starts from the page the user is already on. That matters because the answer is not generic chat, it is context-aware reasoning tied to the current sprint, project, or My Week view.

## Slide 7 - Reasoning And Branching

The graph does not jump straight to an LLM answer. It first derives deterministic signals, then reasons over real Ship evidence, which gives us grounded explanations and visibly different execution paths.

## Slide 8 - Human-In-The-Loop Actions

FleetGraph can recommend action, but it does not act blindly. It drafts the follow-up, pauses for approve, dismiss, or snooze, and only executes if a human explicitly says yes.

## Slide 9 - Observability And Evidence

This feature is meant to be inspectable, not magical. Every meaningful run is traceable, and the evidence shows different paths for quiet runs versus problem-detected runs.

## Slide 10 - Feature Outcomes

The outcome is earlier awareness, faster triage, and a clearer next step when a sprint starts drifting. In practice, FleetGraph reduces ambiguity without taking control away from the team.

## Slide 11 - Next Enhancements

What remains is the closeout work to move from strong local MVP to full submission readiness: public deployment, latency proof, trace-linked test cases, and full cost analysis. After that, the expansion path is broader triggers, more surfaces, and deeper coverage.
