# FLEETGRAPH STATUS

Current implementation summary for FleetGraph.

Use this file when you need the fastest answer to:

- what FleetGraph is
- what already exists
- what is only planned
- what to read next

## What FleetGraph is

FleetGraph is one shared LangGraph system inside Ship.

It has two modes:

- **On-demand**: the user asks from a Ship view
- **Proactive**: the system checks Ship on its own

Both modes use the same graph.

## Current build status

### Implemented

- shared LangGraph supervisor and state model
- on-demand graph entry
- Active View Context
- real sprint/week fetch path
- deterministic sprint-risk signals
- quiet vs flagged graph branching
- embedded week-document FleetGraph on-demand panel
- embedded project-document FleetGraph on-demand panel
- single-project My Week FleetGraph on-demand panel
- proactive sweep route
- env-gated proactive worker
- finding persistence
- cooldown / dedupe memory
- realtime finding event
- Ship toast wiring for proactive findings

### Not implemented yet

- full conversational FleetGraph chat UI
- LLM reasoning node
- action proposal flow
- HITL approval gate
- deployment evidence and LangSmith submission package

## Phase summary

### Phase 1

Built the FleetGraph foundation:

- supervisor
- typed state
- typed runtime
- proactive vs on-demand entry paths
- fallback path

### Phase 2

Built context and fetch:

- Active View Context
- page / tab awareness
- real sprint/week fetch path
- on-demand API entry

### Phase 3

Built deterministic signals:

- missing standup
- no completed work
- work not started
- low recent activity
- changes requested
- missing review

### Phase 4

Built proactive MVP delivery:

- proactive sweep
- finding storage
- cooldown / dedupe
- realtime delivery path
- owner-scoped findings lookup

### Phase 5

Built the first on-demand UI surface:

- embedded FleetGraph panel on week document tabs
- embedded FleetGraph panel on project document tabs
- embedded FleetGraph panel on My Week when one project is in scope
- fixed MVP question:
  - why is this sprint at risk?
- page / tab aware invocation using Active View Context
- grounded answer using fetched context, signals, metrics, and finding summary

## Current page-awareness technique

Implemented today:

- typed Active View Context from the Ship UI
- current route, entity, and tab passed into the graph
- sprint/week document surface covered first
- shared current-view adapter layer in the web app
- project documents now resolve to the current sprint through the graph
- My Week route now publishes person-scoped Active View Context
- My Week can narrow to a single project when one project is in scope

Expansion path:

- add route-to-context adapters for issue, project, program, My Week, dashboard, and person surfaces
- keep Playwright as a verification tool, not the production page-awareness mechanism

## Current trigger vs future trigger

### Current trigger

Implemented today:

- manual proactive sweep route:
  - `POST /api/fleetgraph/proactive/run`
- optional timed sweep worker:
  - enabled with `FLEETGRAPH_ENABLE_PROACTIVE_WORKER=true`

### Future trigger

Still planned:

- high-signal Ship mutation trigger
- webhook or pub/sub style trigger path
- direct event-to-graph invocation for important changes

## Best reference files

- [FLEETGRAPH.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/FLEETGRAPH.md)
- [ROADMAP.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/ROADMAP.md)
- [fleetgraph-phases/README.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/README.md)
- [fleetgraph-three-layer-architecture.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-three-layer-architecture.md)

## Best diagram files

- [fleetgraph-three-layer-architecture.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-three-layer-architecture.mmd)
- [fleetgraph-supervision-normal-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-supervision-normal-flow.mmd)
- [fleetgraph-supervision-intervention-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-supervision-intervention-flow.mmd)
- [fleetgraph-shared-graph-end-to-end-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-shared-graph-end-to-end-flow.mmd)
- [fleetgraph-on-demand-active-view-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-on-demand-active-view-flow.mmd)
- [fleetgraph-proactive-trigger-delivery-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-proactive-trigger-delivery-flow.mmd)
- [fleetgraph-hitl-interrupt-resume-flow.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-hitl-interrupt-resume-flow.mmd)
