# FleetGraph Three-Layer Architecture

This note defines the three core layers we should use when building FleetGraph in LangGraph.

The goal is to keep the system:

- easy to reason about
- easy to trace in LangSmith
- safe to pause and resume
- shared across proactive and on-demand mode

## Why this split matters

FleetGraph needs to do more than call Claude and return text. It has to:

- carry context across many steps
- branch differently based on findings
- pause for human approval
- recover from partial failure
- reuse the same graph for proactive and on-demand runs

That works best when we separate:

1. the **control plane**
2. the **graph state**
3. the **runtime services**

## Layer summary

| Layer | What it is | What it owns | What it should not own |
|---|---|---|---|
| **Supervisor / Control Plane** | The orchestration layer for the graph | entrypoint selection, routing, interrupts, resumes, failure classification, checkpoint boundaries | raw API payload storage, HTTP clients, long prompt context |
| **Graph State** | The durable data passed node to node | mode, actor, scope, fetched data, derived signals, findings, action proposals, approval status, error state | API clients, secrets, schedulers, loggers |
| **Runtime Services** | The live dependencies nodes use while running | Ship API client, Claude client, LangSmith tracing, cache, config, auth, scheduler handles | durable workflow facts, user decisions, graph routing logic |

## Layer 1: Supervisor / Control Plane

### What

The supervisor is the LangGraph control plane. It is responsible for deciding how a run starts, where it goes next, and how it pauses or exits.

### Why

Without a real supervisor layer, FleetGraph becomes a loose collection of nodes with unclear control flow. That makes the system harder to debug, harder to trace, and harder to keep consistent between proactive and on-demand mode.

### How

The supervisor should:

- initialize a run
- decide whether the run is proactive or on-demand
- route into the correct subflow
- evaluate branch outcomes
- manage human-in-the-loop interrupts
- resume after approval, dismiss, or snooze
- classify failures into retryable, non-retryable, and low-confidence exits
- close the run cleanly with trace and memory updates

### Best-practice rules

- Keep the supervisor focused on orchestration, not business analysis.
- Route through explicit branch conditions instead of hiding decisions in a single prompt.
- Treat interrupts and resumes as first-class graph behavior.
- Keep proactive and on-demand mode on the same graph and vary only the entrypoint and output surface.

## Layer 2: Graph State

### What

Graph state is the shared workflow data that moves from node to node and gets updated as the run progresses.

### Why

This is what makes the graph coherent. It lets later nodes use earlier work without rebuilding context, and it makes traces inspectable in LangSmith.

### How

FleetGraph state should include:

- run mode: proactive or on-demand
- trigger type
- workspace and actor identity
- current entity type and ID
- expanded scope IDs
- fetched Ship payloads
- derived metrics and risk signals
- reasoning result
- proposed action
- approval or interrupt status
- error metadata
- trace metadata

### Best-practice rules

- Keep state replayable and inspectable.
- Store evidence, not just conclusions.
- Update state in small, node-owned slices.
- Keep Ship as the source of truth; persist only FleetGraph operational memory outside the run.

## Layer 3: Runtime Services

### What

Runtime services are the live dependencies the graph needs in order to execute.

### Why

The graph needs real services to fetch Ship data, call Claude, record traces, use caches, and authenticate. These are runtime concerns, not graph-state concerns.

### How

Runtime should provide:

- Ship REST API client
- Claude / Anthropic client
- LangSmith tracing hooks
- cache interfaces
- feature flags and configuration
- service credentials
- scheduler or job metadata
- logger / metrics hooks

### Best-practice rules

- Do not store clients or secrets in graph state.
- Keep runtime injectable so nodes are testable.
- Re-fetch mutation targets before executing actions.
- Use runtime for side effects; use state for workflow facts.

## How the three layers work together

1. A proactive trigger or on-demand UI action starts a run.
2. The supervisor initializes graph state.
3. Nodes read from state and call runtime services.
4. Nodes write their outputs back into state.
5. The supervisor reads updated state and chooses the next branch.
6. If an action needs approval, the supervisor interrupts and waits.
7. When resumed, the supervisor continues from the saved state.

## Why this is better than separate agents

We should not create three independent agents for orchestration, proactive monitoring, and chat.

That would create:

- duplicated logic
- duplicated prompts
- inconsistent reasoning
- harder traceability
- higher cost

The better pattern is:

- one shared graph
- one supervisor
- one state model
- one runtime layer
- two entry modes
- role-aware outputs

## Recommended FleetGraph shape

- **Proactive mode**: worker-triggered monitoring and surfacing
- **On-demand mode**: embedded contextual UI invocation
- **Shared graph core**:
  - context
  - scope expansion
  - parallel fetch
  - derived signals
  - reasoning
  - route
  - action proposal
  - HITL
  - fallback

## Mermaid diagram

Diagram source:

- [fleetgraph-three-layer-architecture.mmd](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-diagrams/fleetgraph-three-layer-architecture.mmd)

## Design conclusion

FleetGraph should be built as one LangGraph system with:

- a **Supervisor / Control Plane** for orchestration
- a **Graph State** layer for durable workflow context
- a **Runtime Services** layer for live dependencies

This gives us the cleanest path to:

- one graph for proactive and on-demand mode
- clear branching and HITL behavior
- reliable tracing
- easier debugging
- future growth without multi-agent sprawl
