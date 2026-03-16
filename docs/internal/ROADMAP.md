# Roadmap

This document is the working implementation roadmap for FleetGraph.

It exists to keep the next phases clear, sequenced, and tied to the project requirements. The goal is not to list every possible idea. The goal is to define the work we actually plan to execute in the right order.

## Working objective

Build FleetGraph as a LangGraph-based project intelligence system for Ship with:

- one shared graph architecture
- two modes:
  - proactive
  - on-demand
- embedded context-aware chat
- human-in-the-loop action boundaries
- LangSmith tracing from day one

## Architecture we are building toward

FleetGraph will follow the three-layer architecture already defined in:

- [fleetgraph-three-layer-architecture.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-three-layer-architecture.md)

That means the implementation will be organized around:

1. **Supervisor / Control Plane**
2. **Graph State**
3. **Runtime Services**

The same graph will serve both proactive and on-demand mode. The trigger changes, not the graph.

We are also explicitly using a **supervisor-style orchestration model** inside LangGraph. That means the roadmap should account for both:

- the shared graph nodes
- the control-plane behavior that supervises those nodes

The supervisor is responsible for:

- routing
- intervention
- approval pause and resume
- blocker handling
- drift and loop-risk control
- failure classification
- checkpoint-aware continuation

## Execution principles

- Keep the MVP narrow enough to ship, but agentic enough to feel real.
- Reuse Ship’s current product model and REST APIs.
- Keep proactive and on-demand logic shared whenever possible.
- Use deterministic signals before LLM reasoning.
- Require human approval before consequential actions.
- Optimize for traceability, not cleverness.

## Phase plan

## Phase 1: Graph foundation and control plane

### Goal

Set up the LangGraph backbone so FleetGraph has a real supervisor, state model, runtime context, and traceable branching before we add product behavior.

### What we plan to implement

- FleetGraph package or service scaffold in the existing TypeScript monorepo
- LangGraph runtime setup in TypeScript
- shared graph state schema
- runtime service container:
  - Ship API client
  - Claude client
  - LangSmith tracing
  - config
  - cache hooks
- supervisor / control-plane entrypoint
- supervisor decision order and routing policy
- handoff packet structure between subflows
- checkpoint and interrupt-ready graph setup
- base error and fallback path
- intervention event model for:
  - reroute
  - pause
  - resume
  - retry
  - fail-safe exit

### Why this phase matters

If we skip this and start with prompts or UI, we will create duplicate logic and brittle flow control. This phase gives us the system shape first.

### Exit criteria

- graph can start, route, and finish
- graph state is defined and inspectable
- LangSmith traces exist
- proactive and on-demand can share the same graph entry structure
- normal path and intervention path are both defined

## Phase 2: Ship context and fetch layer

### Goal

Make FleetGraph able to understand what it is looking at and fetch the minimum set of real Ship context needed for reasoning.

### What we plan to implement

- context resolution for:
  - issue
  - week / sprint
  - project
  - program
  - person / My Week
- parallel fetch nodes for:
  - entity context
  - activity
  - accountability signals
  - people and role context
  - related supporting context when needed
- normalized fetch outputs into graph state
- handoff state between context, fetch, derive, and reasoning layers
- failure handling for missing or partial data

### Why this phase matters

The graph cannot reason well without strong context. This is the layer that turns Ship’s REST API into usable graph inputs.

### Exit criteria

- on-demand runs can resolve current view context
- proactive runs can resolve event or sweep scope
- fetch nodes run in parallel where appropriate
- partial-data fallback is working

## Phase 3: Deterministic signals and risk detection

### Goal

Create the rules-first detection layer so FleetGraph does not depend on the LLM for basic anomaly detection.

### What we plan to implement

- derived signal node(s) for:
  - stale issue detection
  - missing ritual detection
  - approval bottleneck detection
  - low activity in active sprint
  - unresolved changes-requested state
- severity and confidence scoring
- dedupe keys and finding signatures
- quiet-exit logic when nothing meaningful is found
- supervisor branch conditions for:
  - quiet exit
  - insight only
  - action proposal
  - fallback

### Why this phase matters

This controls cost, improves reliability, and keeps the LLM focused on analysis instead of basic filtering.

### Exit criteria

- graph can distinguish between no finding and meaningful finding
- signals are deterministic and traceable
- findings are ranked before reasoning

## Phase 4: Proactive MVP flow

### Goal

Ship one proactive detection end to end using real Ship data and a real surfaced output.

### What we plan to implement

- proactive trigger path:
  - event-driven trigger
  - 5-minute sweep backstop
- one MVP proactive use case wired end to end
- supervisor routing for:
  - no finding
  - finding with insight
  - finding with proposed action
- proactive output surface in Ship:
  - notification
  - card
  - inbox or action-item style surfacing
- cooldown / snooze memory

### Candidate MVP proactive use cases

- sprint is drifting before anyone asks
- missing ritual with active work
- approval bottleneck that has sat too long

### Why this phase matters

This is the first moment FleetGraph becomes a real product capability instead of an internal graph.

### Exit criteria

- one proactive detection works against live Ship data
- it surfaces without a user manually asking
- traces show a real branch path

## Phase 5: On-demand embedded chat MVP

### Goal

Add the required on-demand, context-aware chat surface using the same graph.

### What we plan to implement

- embedded FleetGraph panel in Ship context
- current-view context handoff into the graph
- on-demand question flow for one strong MVP question, such as:
  - why is this sprint at risk?
  - what is blocking this issue?
- answer formatting that stays grounded in graph evidence
- mode-specific output adapter for the chat UI

### Why this phase matters

The assignment requires on-demand mode, and it is also where users will validate whether FleetGraph feels truly contextual.

### Exit criteria

- chat is embedded in context, not standalone
- user can invoke FleetGraph from a real Ship surface
- the same graph serves both proactive and on-demand mode

## Phase 6: Reasoning, action proposal, and HITL

### Goal

Move from detection only to meaningful recommendation and safe action proposal.

### What we plan to implement

- reasoning node that explains:
  - why the scope matters
  - why it is at risk
  - who should act
  - what should happen next
- action proposal node for:
  - draft comment
  - escalation proposal
  - follow-up suggestion
  - assignment or ownership suggestion
- human-in-the-loop gate
- interrupt / resume flow
- approve / dismiss / snooze behavior

### Why this phase matters

This is what makes FleetGraph an agent instead of a monitor.

### Exit criteria

- at least one consequential action pauses for human approval
- traces show an interrupt/resume path
- dismiss and snooze update operational memory correctly

## Phase 7: Failure handling, resume, and operational memory

### Goal

Make FleetGraph durable enough to survive real runtime conditions.

### What we plan to implement

- failure classification:
  - retryable
  - terminal
  - low-confidence
- fallback response behavior
- checkpoint-aware resume
- finding memory store for:
  - dedupe
  - cooldown
  - snooze
  - last surfaced timestamp
- traceable intervention events
- checkpoint-aware restart and supervised resume rules

### Why this phase matters

A graph that only works on the happy path is not enough for this project or for production-style agent systems.

### Exit criteria

- failed runs do not crash silently
- retryable failures can be retried
- interrupts and resumes are traceable
- repeated alert spam is controlled

## Phase 8: Planning-intelligence expansion path

### Goal

Prepare FleetGraph to grow beyond execution drift into planning and portfolio intelligence.

### What we plan to implement later

- capacity reasoning
- velocity and throughput history
- scope creep detection
- burn-up / burn-down analysis
- roadmap generation
- staffing pressure analysis
- dependency risk
- scenario planning
- release confidence
- hierarchy rollups
- ideas and insights linkage
- RACI / RICE / metric-tree-aware recommendations

### Why this phase matters

This is the broader product opportunity and a major differentiator, but it should not block MVP.

### Exit criteria

- design is documented
- future primitives are identified
- MVP architecture does not block later expansion

## Phase 9: Evidence, benchmarking, and submission

### Goal

Close the loop on delivery requirements and prove the system works.

### What we plan to implement

- at least two shared LangSmith traces with different execution paths
- documented trigger model and graph diagram in `FLEETGRAPH.md`
- documented test cases tied to use cases
- detection latency measurement
- cost-per-run estimate
- estimated runs per day
- development cost tracking
- deployment verification

### Why this phase matters

This project is graded on architecture, execution, and proof. We need both working software and defensible evidence.

### Exit criteria

- MVP checklist is fully covered
- traces are shareable
- `FLEETGRAPH.md` is complete enough for submission

## Recommended build order

Build in this order:

1. Phase 1: Graph foundation and control plane
2. Phase 2: Ship context and fetch layer
3. Phase 3: Deterministic signals and risk detection
4. Phase 4: Proactive MVP flow
5. Phase 5: On-demand embedded chat MVP
6. Phase 6: Reasoning, action proposal, and HITL
7. Phase 7: Failure handling, resume, and operational memory
8. Phase 9: Evidence, benchmarking, and submission
9. Phase 8: Planning-intelligence expansion path

## Immediate next implementation slice

The next slice we should execute is:

1. scaffold the FleetGraph TypeScript runtime
2. define graph state and runtime context
3. implement the supervisor entrypoint
4. define the normal path and intervention path
5. wire LangSmith tracing
6. build context + fetch nodes for one scope
7. choose one proactive MVP use case
8. choose one on-demand MVP question

## Decision rule for scope

If work does not help us:

- prove shared graph architecture
- ship one proactive flow
- ship one on-demand contextual flow
- show LangSmith traces with different branches

then it is not MVP-critical and should not come before the earlier phases.
