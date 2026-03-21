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
- grounded reasoning node for the sprint-risk MVP question
- draft follow-up and escalation action proposals
- HITL interrupt / resume path with approve, dismiss, and snooze
- action memory for suppression after approval, dismiss, or snooze
- bounded action catalog with strict schemas
- reasoning-source tracking:
  - `deterministic`
  - `model`
- runtime guardrails:
  - transition budget
  - retry budget
  - resume budget
  - deadline budget
- compact node history and per-node latency tracking
- terminal outcome classification
- Braintrust top-level and child-span telemetry
- FleetGraph reasoning and action-catalog skills
- proactive sweep route
- env-gated proactive worker
- finding persistence
- cooldown / dedupe memory
- realtime finding event
- Ship toast wiring for proactive findings
- planning-aware sprint signals for:
  - scope growth
  - blocked work
  - workload concentration
  - throughput gap vs recent delivery history

### Not implemented yet

- full conversational FleetGraph chat UI
- wider issue / program / dashboard surface coverage
- high-signal mutation trigger / pub-sub delivery path
- deployed public FleetGraph environment verification
- final deployment evidence package

## MVP requirement audit

| Requirement | Status | Notes |
|---|---|---|
| Graph running with at least one proactive detection wired end to end | complete | proactive sweep, finding persistence, dedupe, and delivery are implemented |
| LangSmith tracing enabled with at least two shared trace links showing different execution paths | complete | two shared LangSmith trace links are captured in the `shipshape` project from quiet and problem-detected local runs |
| `FLEETGRAPH.md` created with Agent Responsibility and Use Cases sections completed | complete | root source-of-truth doc exists and is filled out |
| At least 5 use cases documented in `FLEETGRAPH.md` | complete | use-case table is present |
| Graph outline completed in `FLEETGRAPH.md` with node types, edges, and branching conditions | complete | graph diagram and node outline are documented |
| At least one human-in-the-loop gate implemented | complete | approve / dismiss / snooze interrupt-resume flow is live |
| Running against real Ship data with no mocked responses | complete | on-demand and proactive paths have been validated against real Ship data |
| Deployed and publicly accessible | complete | FleetGraph is live on the public CloudFront deployment at `https://d1woqw06xb054i.cloudfront.net`; both FleetGraph routes are mounted and return `403 Forbidden` when unauthenticated rather than `404` or SPA fallback |
| Trigger model decision documented and defended in `FLEETGRAPH.md` | complete | hybrid trigger model and current-vs-future trigger sections are documented |

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

### Phase 6

Built the first reasoning and HITL slice:

- grounded explanation node over fetched context and deterministic signals
- optional model-backed reasoner with deterministic fallback
- draft follow-up and escalation proposals
- interrupt / resume approval gate
- approve / dismiss / snooze decisions
- first approved action execution:
  - post a sprint comment
- action memory for suppression after prior human decisions

### Phase 7

Built runtime hardening for the MVP slice:

- attempt counters for reasoning, resume, and action execution
- transition, retry, and deadline guardrails
- deterministic fallback when reasoning exceeds budget
- hard-stop protection for over-transition and over-resume loops
- terminal outcome classes:
  - `quiet`
  - `finding_only`
  - `waiting_on_human`
  - `action_executed`
  - `suppressed`
  - `failed_retryable`
  - `failed_terminal`
- per-node latency telemetry and compact node trace history
- Braintrust top-level and child-span instrumentation
- bounded action catalog and FleetGraph reasoning/action skills

### Phase 8

Started the planning-intelligence expansion:

- sprint issue worklist added as planning evidence
- sprint scope-change history added as planning evidence
- recent project week history added for throughput comparison
- deterministic planning signals now include:
  - `scope_growth`
  - `blocked_work`
  - `workload_concentration`
  - `throughput_gap`
- capacity-style questions can now answer whether the sprint looks overcommitted relative to recent delivery history

### Phase 9

Built the evidence and submission slice so far:

- LangSmith run-id, run-URL, and share-URL capture support
- repeatable local evidence harness:
  - [collect-fleetgraph-evidence.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/collect-fleetgraph-evidence.ts)
- generated evidence bundle from the local stack:
  - [summary.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.md)
  - [summary.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.json)
- captured live evidence for:
  - quiet on-demand run
  - flagged on-demand run
  - proactive sweep path
- captured shared LangSmith traces for:
  - quiet on-demand path
  - problem-detected on-demand path

Public deployment verification is now complete:

- `https://d1woqw06xb054i.cloudfront.net` is reachable
- `/health` returns `{"status":"ok"}`
- public FleetGraph routes are mounted:
  - `POST /api/fleetgraph/on-demand` returns `403 Forbidden` when unauthenticated
  - `POST /api/fleetgraph/proactive/run` returns `403 Forbidden` when unauthenticated

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

## Recommended next step

Choose one of these next, depending on priority:

- **Phase 8** if the goal is product expansion:
  - planning intelligence
  - capacity / scope / dependency signals
  - broader portfolio reasoning

## Best reference files

- [FLEETGRAPH.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/FLEETGRAPH.md)
- [fleetgraph-skills-and-tools.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-skills-and-tools.md)
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
