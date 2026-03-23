# FleetGraph On-Demand and Shared Graph Requirements

## Purpose

This note consolidates five specific FleetGraph requirements that were previously answered across the PRD, roadmap, architecture notes, and shipped code:

- on-demand is user-pulled
- the chat interface is context-aware and starts from the current Ship view
- the user asks a question or requests an action and the graph does the work
- proactive and on-demand run through the same graph architecture
- the difference is the trigger, not a separate graph system

For each requirement, this document records:

- the objective answer
- how the implementation addresses it
- what completion evidence exists in the repo
- whether the requirement is complete

## Summary

| Requirement | Objective answer | Status |
|---|---|---|
| On-demand is user-pulled | Yes | Complete |
| The chat interface is context-aware and uses the current view as the starting point for reasoning | Yes, via typed app context rather than browser vision | Complete for shipped supported surfaces |
| The user asks a question or requests an action and the graph does the work | Yes, with human approval before consequential persistent actions | Complete |
| Both modes run through the same graph architecture | Yes | Complete |
| The difference is the trigger, not the graph | Yes, with the nuance that entry context and output surface also vary by mode | Complete |

## Requirement 1: On-Demand Is User-Pulled

**Objective answer:** Yes.

### How we address it

FleetGraph on-demand mode is embedded inside Ship and starts when the user invokes it from the current page. It is not a background sweep and it is not a separate standalone chatbot surface.

The UI sends an explicit on-demand request only after the user submits a question from the FleetGraph panel. The backend then records that run as `mode: 'on_demand'` with `triggerType: 'user_invoke'`.

### How we completed it

- Phase 5 shipped the embedded on-demand UI.
- The on-demand route is live and converts the user request into a FleetGraph run input.

### Evidence

- [`docs/internal/fleetgraph-phases/phase-5-on-demand-ui.md`](../docs/internal/fleetgraph-phases/phase-5-on-demand-ui.md): status is `completed`, with the outcome described as embedded contextual invocation.
- [`docs/internal/ROADMAP.md`](../docs/internal/ROADMAP.md): Phase 5 is marked `complete`, and the requirement table ties on-demand mode to embedded UI invocation from current Ship context.
- [`web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx`](../web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx): lines 1354-1359 send `active_view`, `page_context`, `question`, and `question_source` only when the user submits.
- [`api/src/routes/fleetgraph.ts`](../api/src/routes/fleetgraph.ts): lines 252-287 map the request to `mode: 'on_demand'` and `triggerType: 'user_invoke'`.

### Status

**Complete**

## Requirement 2: The Chat Interface Is Context-Aware And Uses The Current View As The Starting Point For Reasoning

**Objective answer:** Yes.

### How we address it

FleetGraph does not depend on screen reading or browser vision in production. Instead, the Ship app builds typed context from the user’s current route, document, tab, and page data, then passes that into the graph.

The current-view contract has two layers:

- `active_view`: the current entity, surface, route, tab, and project scope
- `page_context`: a lightweight summary of the current page, including title, summary, metrics, items, and actions

The graph uses that context as its starting point. If the current view resolves to a sprint, project, or person scope, it expands that scope and fetches the relevant Ship evidence. If there is no resolvable sprint scope, it can still reason directly from the current page context.

### How we completed it

- Phase 2 completed the Active View Context and real fetch path.
- Phase 5 completed the embedded on-demand UI that passes current-view context into the graph.

### Evidence

- [`artifacts-documentation/fleetgraph-agent-responsibility.md`](./fleetgraph-agent-responsibility.md): explicitly states that the UI sends Active View Context and the graph uses it as the starting point for reasoning.
- [`docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md`](../docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md): status is `completed`; it states that the graph uses Active View Context from the UI and app-native typed context for page awareness.
- [`docs/internal/ROADMAP.md`](../docs/internal/ROADMAP.md): marks context-aware on-demand mode and active page/tab awareness as completed requirements for the shipped slice.
- [`web/src/lib/fleetgraph.ts`](../web/src/lib/fleetgraph.ts): `buildFleetGraphActiveViewContext(...)` turns the current document, route, tab, and project scope into typed FleetGraph context.
- [`web/src/hooks/useFleetGraphActiveView.ts`](../web/src/hooks/useFleetGraphActiveView.ts): resolves the live current view from Ship contexts and the current route.
- [`web/src/hooks/useFleetGraphPageContext.ts`](../web/src/hooks/useFleetGraphPageContext.ts): builds typed page context from the current Ship surface and its data.
- [`web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx`](../web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx): lines 1354-1359 send both `active_view` and `page_context`.
- [`api/src/routes/fleetgraph.ts`](../api/src/routes/fleetgraph.ts): lines 259-269 map `active_view` into `activeView` and `contextEntity`, and `page_context` into `prompt.pageContext`.
- [`fleetgraph/src/nodes/resolve-context.ts`](../fleetgraph/src/nodes/resolve-context.ts): lines 56-62 choose between sprint fetch, week-scope resolution, or current-view reasoning based on the incoming context.

### Important nuance

This requirement is satisfied by structured application context, not by the model literally seeing the screen. The system is page-aware because Ship tells the graph what page, entity, and tab the user is on.

### Status

**Complete for shipped supported surfaces**

The MVP slice is complete. Broader surface widening can continue without changing the basic requirement or mechanism.

## Requirement 3: The User Asks A Question Or Requests An Action, And The Graph Does The Work

**Objective answer:** Yes, with a required human-approval boundary for consequential persistent actions.

### How we address it

The graph is responsible for the working steps after the user asks:

- resolving scope
- fetching Ship evidence
- deriving deterministic signals
- reasoning about risk or the current view
- proposing a bounded next action when appropriate

If the run reaches a consequential action, the graph pauses at a human-approval gate before anything persistent is executed.

### How we completed it

- Phase 6 completed the reasoning, action proposal, and human-in-the-loop path for the sprint/week MVP.
- The shared graph includes explicit nodes for reasoning, proposing actions, approval, and action execution.

### Evidence

- [`docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md`](../docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md): status is `complete for sprint/week MVP`; it lists the reasoning node, action proposal node, human-in-the-loop gate, and approved action execution path.
- [`artifacts-documentation/fleetgraph-agent-responsibility.md`](./fleetgraph-agent-responsibility.md): states what the agent does autonomously and what always requires human approval.
- [`fleetgraph/src/graph.ts`](../fleetgraph/src/graph.ts): lines 36-59 show the shipped node sequence for `fetchSprintContext`, `deriveSprintSignals`, `reasonAboutSprint`, `proposeSprintAction`, `humanApprovalGate`, and `executeProposedAction`.

### Important nuance

“The graph does the work” is correct for reasoning and action preparation, but not for unreviewed persistent mutation. The implementation intentionally stops for approval before consequential actions.

### Status

**Complete**

## Requirement 4: Both Modes Run Through The Same Graph Architecture

**Objective answer:** Yes.

### How we address it

FleetGraph uses one shared LangGraph state graph. The supervisor chooses the mode-specific initialization path, but both proactive and on-demand runs continue through the same underlying graph system and shared downstream nodes.

Both backend entrypoints call the same `invokeFleetGraph(...)` runner, which uses a single shared graph instance created by `createFleetGraph()`.

### How we completed it

- Phase 1 established the shared graph foundation.
- Phase 4 and Phase 5 added proactive and on-demand entrypoints on top of that same shared graph.

### Evidence

- [`artifacts-documentation/fleetgraph-three-layer-architecture.md`](./fleetgraph-three-layer-architecture.md): says proactive and on-demand should stay on the same graph and vary only by entrypoint and output surface.
- [`docs/internal/ROADMAP.md`](../docs/internal/ROADMAP.md): explicitly states, “The same graph will serve both proactive and on-demand mode. The trigger changes, not the graph.”
- [`api/src/services/fleetgraph-runner.ts`](../api/src/services/fleetgraph-runner.ts): creates one shared graph with `const graph = createFleetGraph();` and routes all invocations through `invokeFleetGraph(...)`.
- [`api/src/services/fleetgraph-proactive.ts`](../api/src/services/fleetgraph-proactive.ts): lines 444-468 build a proactive run input and still call `invokeFleetGraph(...)`.
- [`api/src/routes/fleetgraph.ts`](../api/src/routes/fleetgraph.ts): lines 252-287 build an on-demand run input and call the same `invokeFleetGraph(...)`.
- [`fleetgraph/src/graph.ts`](../fleetgraph/src/graph.ts): defines one graph containing both `initializeProactiveContext` and `initializeOnDemandContext`.
- [`fleetgraph/src/nodes/supervisor-entry.ts`](../fleetgraph/src/nodes/supervisor-entry.ts): routes by `state.mode` into the proactive or on-demand initialization node.

### Status

**Complete**

## Requirement 5: The Difference Is The Trigger, Not The Graph

**Objective answer:** Yes, with a precision note.

### How we address it

The core graph stays shared. What changes by mode is:

- the trigger
- the initial runtime context
- the output surface

For on-demand mode, the trigger is a user invoke from the current Ship page. For proactive mode, the trigger is a background sweep or event-driven proactive run. After mode selection, both runs continue inside the same graph architecture.

### How we completed it

- The PRD and roadmap both define this as a core requirement.
- The implementation follows that rule directly through a shared graph with mode-specific initialization.

### Evidence

- [`artifacts-documentation/fleetgraph-prd-reference.md`](./fleetgraph-prd-reference.md): states that on-demand runs from the current Ship context and that both modes must use the same graph architecture, with the trigger changing rather than the graph.
- [`docs/internal/ROADMAP.md`](../docs/internal/ROADMAP.md): repeats the same requirement and maps it to completion phases.
- [`fleetgraph/src/nodes/supervisor-entry.ts`](../fleetgraph/src/nodes/supervisor-entry.ts): switches only the initialization path based on mode.
- [`artifacts-diagrams/fleetgraph-shared-graph-end-to-end-flow.mmd`](../artifacts-diagrams/fleetgraph-shared-graph-end-to-end-flow.mmd): shows one trigger leading into one shared graph with separate proactive and on-demand initialization paths.

### Precision note

The short sentence “the difference is the trigger, not the graph” is directionally correct and matches the intended architecture. The more precise version is:

> the trigger, entry context, and output surface differ by mode, while the underlying graph architecture stays shared

### Status

**Complete**

## Related Existing Docs

This note complements, rather than replaces:

- [`artifacts-documentation/fleetgraph-agent-responsibility.md`](./fleetgraph-agent-responsibility.md)
- [`artifacts-documentation/fleetgraph-prd-reference.md`](./fleetgraph-prd-reference.md)
- [`artifacts-documentation/fleetgraph-three-layer-architecture.md`](./fleetgraph-three-layer-architecture.md)
- [`docs/internal/ROADMAP.md`](../docs/internal/ROADMAP.md)
- [`docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md`](../docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md)
- [`docs/internal/fleetgraph-phases/phase-5-on-demand-ui.md`](../docs/internal/fleetgraph-phases/phase-5-on-demand-ui.md)
- [`docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md`](../docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md)
