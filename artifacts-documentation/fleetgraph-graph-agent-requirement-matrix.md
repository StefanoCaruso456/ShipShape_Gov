# FleetGraph Graph Agent Requirement Matrix

## Purpose

This is the concise checklist for the graph-agent requirements in the project brief.

It answers two questions for each requirement:

- did we implement it
- what, objectively, is complete today

## Requirement Matrix

| Area | Requirement | Complete | Objective status |
|---|---|---:|---|
| Framework | Use LangGraph, or wire LangSmith manually if another framework is chosen | ✅ | FleetGraph uses LangGraph `StateGraph` and `Command`, and the runner attaches LangSmith callbacks when tracing is enabled. |
| Context nodes | Establish who invoked the graph, what they are looking at, their role, and the relevant Ship state | ✅* | `supervisorEntry`, `initializeOnDemandContext`, `initializeProactiveContext`, `resolveContext`, and `resolveWeekScope` exist and are wired into the graph. |
| Fetch nodes | Pull Ship API data, with multiple fetches running in parallel rather than sequentially | ✅* | `fetchSprintContextNode` uses `Promise.all(...)` for both top-level fetches and nested sprint snapshot fetches. |
| Reasoning nodes | Perform actual analysis of relationships, gaps, risk, and relevance, not just formatting | ✅* | `reasonAboutSprintNode` is the main evidence-backed reasoning path; `reasonAboutCurrentViewNode` covers current-view guidance for the supported slice. |
| Conditional edges | Route differently based on what the reasoning/signal step finds; clean vs problem-detected runs must visibly diverge | ✅ | The graph has explicit quiet vs surfaced branches, including `signals_quiet_exit` versus `recordSignalFinding` and later reasoning/action paths. |
| Action nodes | Take or propose a concrete action based on findings | ✅* | `proposeSprintActionNode` and `executeProposedActionNode` are shipped, with one approved execution path for the MVP slice. |
| Human-in-the-loop gates | Pause before any consequential action and surface confirmation to the user | ✅ | `humanApprovalGateNode` interrupts for approval and supports approve, dismiss, and snooze outcomes before execution. |
| Error and fallback nodes | Handle Ship API failures, missing data, and unexpected state gracefully without crashing | ✅ | `fallbackNode`, failure classification, retry/terminal handling, and resume/guardrails are implemented for the MVP slice. |

\* Complete for the shipped FleetGraph MVP slice. Some coverage widening is still ongoing across additional Ship surfaces and action breadth, but the required node type and execution behavior are implemented.

## Concise Breakdown

1. Framework

- Completed.
- We used LangGraph, so the “different framework” branch of the requirement does not apply.
- LangSmith is wired through the FleetGraph runner instead of being left as a future task.

2. Context nodes

- Completed for the shipped slice.
- The graph resolves mode, actor, active view, entity scope, and week/project/person expansion before downstream work runs.

3. Fetch nodes

- Completed for the shipped slice.
- The graph performs the required Ship fetches in parallel for sprint/week reasoning instead of chaining them sequentially.

4. Reasoning nodes

- Completed for the shipped slice.
- The graph includes dedicated reasoning nodes rather than treating reasoning as output formatting.

5. Conditional edges

- Completed.
- Quiet and problem-detected runs take visibly different paths in the graph.

6. Action nodes

- Completed for the shipped slice.
- The graph can propose concrete next steps and execute the first approved action path.

7. Human-in-the-loop gates

- Completed.
- Consequential actions pause for approval before execution.

8. Error and fallback nodes

- Completed.
- The graph has a real fallback path and explicit runtime durability work instead of crashing on bad state.

## Evidence

- Framework and graph structure: [`fleetgraph/src/graph.ts`](../fleetgraph/src/graph.ts), [`docs/internal/fleetgraph-phases/phase-1-graph-foundation.md`](../docs/internal/fleetgraph-phases/phase-1-graph-foundation.md)
- LangSmith wiring: [`api/src/services/fleetgraph-runner.ts`](../api/src/services/fleetgraph-runner.ts), [`api/src/services/fleetgraph-langsmith.ts`](../api/src/services/fleetgraph-langsmith.ts)
- Parallel fetch: [`fleetgraph/src/nodes/fetch-sprint-context.ts`](../fleetgraph/src/nodes/fetch-sprint-context.ts), [`docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md`](../docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md)
- Quiet vs surfaced branching: [`fleetgraph/src/nodes/derive-sprint-signals.ts`](../fleetgraph/src/nodes/derive-sprint-signals.ts), [`docs/internal/fleetgraph-phases/phase-3-deterministic-signals.md`](../docs/internal/fleetgraph-phases/phase-3-deterministic-signals.md)
- Reasoning, action, and HITL: [`fleetgraph/src/nodes/reason-about-sprint.ts`](../fleetgraph/src/nodes/reason-about-sprint.ts), [`fleetgraph/src/nodes/reason-about-current-view.ts`](../fleetgraph/src/nodes/reason-about-current-view.ts), [`fleetgraph/src/nodes/propose-sprint-action.ts`](../fleetgraph/src/nodes/propose-sprint-action.ts), [`fleetgraph/src/nodes/human-approval-gate.ts`](../fleetgraph/src/nodes/human-approval-gate.ts), [`docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md`](../docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md)
- Failure and fallback handling: [`fleetgraph/src/nodes/fallback.ts`](../fleetgraph/src/nodes/fallback.ts), [`docs/internal/fleetgraph-phases/phase-7-failure-resume-memory.md`](../docs/internal/fleetgraph-phases/phase-7-failure-resume-memory.md)
