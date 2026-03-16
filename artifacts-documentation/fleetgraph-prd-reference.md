# FleetGraph PRD Reference

Source PDF: `/Users/stefanocaruso/Desktop/FleetGraph_PRD.pdf`

This file is a working reference distilled from the FleetGraph project brief so the implementation can stay aligned without reopening the PDF.

## Core Product Framing

- FleetGraph is not meant to be a better dashboard.
- It is a **project intelligence agent** for Ship.
- The agent should detect problems, reason about them, and make the next action obvious.
- The strongest implementations go beyond problem detection and find useful project-team workflows the product brief did not prescribe directly.
- The chat surface is required, but it must be **embedded in context**. A standalone chatbot does not satisfy the brief.

## Required Operating Modes

FleetGraph must support both:

1. **Proactive mode**
   - runs without a user present
   - surfaces findings on its own
   - decides when to act and when to stay quiet

2. **On-demand mode**
   - runs when a user invokes it from the current Ship context
   - uses the current view as the reasoning starting point

Both modes must use the **same graph architecture**. The trigger changes, not the graph.

## Graph Requirements

The project brief requires these graph capabilities:

- context nodes
- fetch nodes
- reasoning nodes
- conditional edges
- action nodes
- human-in-the-loop gates
- error and fallback nodes

Key implementation expectations:

- fetches that depend on multiple Ship API calls should run **in parallel**
- reasoning should be actual analysis, not just formatting or summarization
- conditional branches should produce visibly different execution paths
- consequential actions must pause for a human decision

## Data and Integration Constraints

- Ship REST API only
- no direct database access
- Claude API required for AI
- LangGraph recommended
- LangSmith tracing required from day one
- if LangGraph is not used, equivalent manual LangSmith instrumentation is required

## Observability Requirements

- every graph run must be traced
- LangSmith traces must be shared as deliverables
- traces must show different execution paths under different conditions
- a graph that behaves identically across all runs is considered a pipeline, not a graph

## MVP Checklist

The MVP requires:

- one proactive detection wired end to end
- LangSmith tracing enabled
- at least two shared trace links with different execution paths
- `FLEETGRAPH.md` with agent responsibility and at least 5 use cases
- documented graph outline with nodes, edges, and branching conditions
- at least one human-in-the-loop gate
- real Ship data
- public deployment
- documented and defended trigger model

## Performance and Cost Expectations

The PRD requires FleetGraph to address:

- problem detection latency under 5 minutes
- documented cost per graph run
- documented estimated runs per day
- development and testing API cost tracking
- production cost projections at:
  - 100 users
  - 1,000 users
  - 10,000 users

The brief also expects assumptions for:

- proactive runs per project per day
- on-demand invocations per user per day
- average tokens per invocation

## Deliverable Structure

Two required root-level files:

- `PRESEARCH.md`
- `FLEETGRAPH.md`

The final `FLEETGRAPH.md` must include:

- Agent Responsibility
- Graph Diagram
- Use Cases
- Trigger Model
- Test Cases
- Architecture Decisions
- Cost Analysis

## Pre-Search Checklist from the PRD

The pre-search is meant to define **what the agent does**, not just how it is implemented.

It covers:

- agent responsibility scoping
- use case discovery
- trigger model decision
- node design
- state management
- human-in-the-loop design
- error and failure handling
- deployment model
- performance model

## Build Implications for Our Implementation

This PRD pushes the design toward:

- a graph-first implementation, not a single prompt flow
- proactive + on-demand support from the start
- strong observability
- explicit HITL boundaries
- real Ship-context integration
- a constrained, context-aware embedded chat experience

It also means our implementation should be judged less like a chatbot demo and more like:

- an operating workflow
- an event and state-driven agent
- a measurable product capability running against live data

## What This Means for FleetGraph Build Decisions

The most important practical implications are:

- we should optimize for **shared graph architecture**
- we should keep the first version narrow enough to ship, but broad enough to feel agentic
- we should preserve clear separation between:
  - deterministic detection
  - reasoning
  - action proposal
  - human approval
- we should design the output surfaces to feel native to Ship, not bolted on

