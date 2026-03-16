# LangGraph Reference

Source PDF: `/Users/stefanocaruso/Desktop/langgrpah.pdf`

This file is a working reference distilled from the LangGraph PDF so we can keep the FleetGraph implementation aligned with how LangGraph is intended to be used.

## What LangGraph Is

The PDF describes LangGraph as a library for building:

- stateful applications
- multi-actor applications
- LLM-driven workflows

It is positioned as a graph-based orchestration model inspired by:

- Pregel
- Apache Beam

It supports both Python and JavaScript, and the graph metaphor is the important part:

- nodes do work
- edges control flow
- state moves through the graph

## Core Concepts

### Nodes

A node is a function that:

- receives inputs
- performs work
- returns outputs to the rest of the graph

For FleetGraph, that maps cleanly to:

- context nodes
- fetch nodes
- reasoning nodes
- action nodes
- fallback nodes

### Edges

An edge connects nodes and determines what happens next.

The PDF distinguishes between:

- **static edges**: always move to the same next node
- **conditional edges**: choose the next node based on criteria

For FleetGraph, conditional edges are especially important because the PRD requires visibly different execution paths.

### State

The PDF emphasizes that state is passed from node to node and updated as the graph runs.

That is the main value LangGraph brings to this project:

- shared context
- persistent run memory
- conditional routing based on earlier work
- easier multi-step reasoning without rebuilding context each time

## Why Graphs Instead of Just Chains or Agents

The PDF contrasts:

- chains
- agents
- graphs

Takeaway:

- **chains** are simple and sequential, but too rigid for this problem
- **agents** are flexible, but harder to control and debug
- **graphs** give structure plus flexibility, which is a better fit for production workflows with branching and HITL gates

That aligns well with FleetGraph because the product brief needs:

- branching logic
- observability
- controllable execution
- multiple node types
- predictable state handling

## Multi-Agent and Supervisor Concepts

The PDF also introduces:

- multi-agent graphs
- supervisor patterns
- hierarchical teams

That matters as future context for FleetGraph, even if MVP stays single-graph and tightly scoped.

Possible later uses:

- separate subgraphs for detection, planning, and action drafting
- supervisor node deciding whether to:
  - exit quietly
  - surface insight
  - draft action
  - escalate to HITL

For MVP, we do not need unnecessary multi-agent complexity. But the concept is useful for future growth.

## Practical Relevance to FleetGraph

LangGraph is a good fit here because FleetGraph needs:

- shared state across a run
- deterministic and conditional routing
- the ability to pause before action
- clear, inspectable execution paths
- support for proactive and on-demand entry points using the same graph

## Recommended LangGraph Usage Pattern for FleetGraph

Based on the PDF and the FleetGraph brief, the right LangGraph posture is:

1. keep the graph explicit and readable
2. use state to carry context, fetched data, derived signals, and reasoning results
3. prefer conditional routing over giant prompts
4. treat reasoning as one node in a larger workflow, not the whole application
5. preserve a clear boundary between:
   - fetch
   - derive
   - reason
   - propose action
   - human approval
   - execute or exit

## Build Implications

For our implementation, this means:

- LangGraph should be the orchestration layer, not just a wrapper around a single Claude call
- state design matters as much as prompt design
- node boundaries should match product responsibilities
- conditional edges should reflect real product outcomes
- the graph should be easy to trace in LangSmith and easy to explain in `FLEETGRAPH.md`

## What to Keep in Mind During Build

- The graph should remain controllable and debuggable
- We should avoid turning LangGraph into an overcomplicated multi-agent experiment too early
- The value of LangGraph here is not novelty; it is structured orchestration with visible state and branching
- If a node boundary is hard to explain in plain English, it is probably the wrong abstraction

