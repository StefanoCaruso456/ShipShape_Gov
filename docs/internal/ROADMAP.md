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

## Phase documentation

Concise phase-by-phase implementation notes live here:

- [fleetgraph-phases/README.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/README.md)

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

## MVP pass checklist

This checklist mirrors the assignment pass criteria. We should treat these as the definition of done for the first deliverable, not as optional polish.

- [ ] Graph running with at least one proactive detection wired end to end
- [ ] LangSmith tracing enabled with at least two shared trace links showing different execution paths
- [ ] `FLEETGRAPH.md` created with Agent Responsibility and Use Cases sections completed
- [ ] At least 5 use cases documented in `FLEETGRAPH.md`
- [ ] Graph outline completed in `FLEETGRAPH.md` with node types, edges, and branching conditions
- [ ] At least one human-in-the-loop gate implemented
- [ ] Running against real Ship data with no mocked responses
- [ ] Deployed and publicly accessible
- [ ] Trigger model decision documented and defended in `FLEETGRAPH.md`

## Requirement-to-phase map

| Requirement | Primary phase(s) | Verification output |
|---|---|---|
| Shared graph for proactive and on-demand | Phase 1, Phase 2, Phase 5 | one graph entry with two trigger paths |
| One proactive detection end to end | Phase 3, Phase 4 | working proactive run against live data |
| Context-aware on-demand mode | Phase 2, Phase 5 | embedded UI invocation from current Ship context |
| Active page / tab awareness | Phase 2, Phase 5 | graph receives Active View Context from the current Ship surface |
| HITL gate | Phase 6 | interrupt / resume trace and approval UI |
| Error and fallback nodes | Phase 1, Phase 7 | failure branch visible in traces |
| LangSmith tracing from day one | Phase 0, Phase 1 | trace links for clean and problem-detected runs |
| `FLEETGRAPH.md` core sections | Phase 0, Phase 9 | committed root file with required sections |
| Trigger model defended | Phase 0, Phase 4, Phase 9 | documented hybrid decision and observed behavior |
| Public deployment | Phase 9 | reachable deployed URL |

## Verification flow

Each phase should end with a lightweight verification step before we move forward. That keeps us from building deep into the stack without proving the earlier layer actually works.

### 1. Design verification

Before code moves far:

- confirm the MVP proactive use case
- confirm the MVP on-demand question
- confirm the HITL boundary
- confirm the trigger model
- confirm the first `FLEETGRAPH.md` outline exists

### 2. Runtime verification

After graph foundation:

- start the graph locally
- verify LangSmith tracing is active
- verify the supervisor can take different branch paths
- verify proactive and on-demand runs both enter the same graph

### 3. Data verification

After context and fetch work:

- verify all fetches use real Ship API responses
- verify parallel fetch behavior where multiple requests are needed
- verify partial-data fallback works without crashing the run

### 4. Proactive verification

After the first proactive slice:

- introduce or identify a real qualifying Ship state
- verify the graph detects it
- verify the graph stays quiet on a clean state
- save both trace links

### 5. On-demand verification

After the chat slice:

- invoke FleetGraph from a real Ship context
- verify the graph reads the current issue, week, project, or program scope
- verify the answer stays grounded in fetched evidence

### 6. HITL verification

After action proposal:

- verify the graph pauses before a consequential action
- verify approve resumes the run correctly
- verify dismiss and snooze update operational memory correctly

### 7. Final MVP verification

Before submission:

- all checklist items above are complete
- `FLEETGRAPH.md` is present and readable
- at least two shared LangSmith traces are ready
- deployed URL works
- the system is running against real Ship data
- evidence is saved for the final write-up

## Phase plan

## Phase 0: MVP framing, observability, and deliverable scaffold

### Goal

Lock the pass criteria first so the implementation stays tied to the actual grading requirements.

### What we plan to implement

- create `FLEETGRAPH.md` at the repo root
- write the initial required sections:
  - Agent Responsibility
  - Use Cases
  - Trigger Model
  - Graph outline stub
- choose one proactive MVP use case
- choose one on-demand MVP question
- choose the first HITL action boundary
- wire LangSmith environment handling and verify traces can be created from day one

### Why this phase matters

The assignment explicitly grades the responsibility definition, use cases, trigger model, and traceability. If we do not lock those up front, the roadmap can drift into implementation-first work that is harder to defend later.

### Exit criteria

- `FLEETGRAPH.md` exists at repo root
- MVP proactive use case is chosen
- MVP on-demand question is chosen
- first HITL boundary is chosen
- LangSmith tracing is verified locally

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

### Current progress

- [x] shared **Active View Context** contract added
- [x] current document context extended to carry the active tab
- [x] on-demand FleetGraph API route added
- [x] sprint/week MVP fetch path added to the graph
- [ ] widen context resolution beyond sprint/week into issue, project, program, and person surfaces
- [ ] add dedicated people/role fetches where the sprint payload is not enough

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

We should choose one and keep it narrow. The best first option is the one with:

- clear detection criteria
- clear owner
- clear user-facing surface
- low ambiguity about the next step

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

We should choose one on-demand question for MVP and keep it tightly scoped enough that the answer can be grounded in real fetched context.

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

1. Phase 0: MVP framing, observability, and deliverable scaffold
2. Phase 1: Graph foundation and control plane
3. Phase 2: Ship context and fetch layer
4. Phase 3: Deterministic signals and risk detection
5. Phase 4: Proactive MVP flow
6. Phase 5: On-demand embedded chat MVP
7. Phase 6: Reasoning, action proposal, and HITL
8. Phase 7: Failure handling, resume, and operational memory
9. Phase 9: Evidence, benchmarking, and submission
10. Phase 8: Planning-intelligence expansion path

## Immediate next implementation slice

The next slice we should execute is:

1. create `FLEETGRAPH.md`
2. lock one proactive MVP use case
3. lock one on-demand MVP question
4. lock one HITL boundary
5. verify LangSmith tracing locally
6. scaffold the FleetGraph TypeScript runtime
7. define graph state and runtime context
8. implement the supervisor entrypoint
9. define the normal path and intervention path
10. build context + fetch nodes for one scope

## Decision rule for scope

If work does not help us:

- complete the MVP checklist
- prove shared graph architecture
- ship one proactive flow
- ship one on-demand contextual flow
- show LangSmith traces with different branches

then it is not MVP-critical and should not come before the earlier phases.
