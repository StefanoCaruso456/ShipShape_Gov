# Phase 8: Planning Intelligence

Status: `in progress`

## What

Expand beyond execution drift into product and portfolio intelligence.

Current implementation slice:

- planning-aware sprint analysis for:
  - scope growth
  - blocked work
  - dependency risk from issue updates and hierarchy
  - workload concentration
  - throughput gap compared to recent delivery history
  - staffing pressure from current project allocation
- planning evidence fetched from real Ship APIs:
  - sprint issue worklist
  - sprint scope-change history
  - issue iteration blocker notes
  - issue parent/child hierarchy
  - recent project week history for throughput comparison
  - project allocation grid for staffing comparison

Later expansion targets:

- capacity
- velocity
- roadmap generation
- burn-up / burn-down
- dependency and release confidence

## Why

This is where FleetGraph becomes more valuable to PMs, directors, and product owners, not just individual contributors. The first step is to stop answering planning questions with execution-only evidence.

## How

- first slice:
  - fetch sprint issues and scope changes in parallel
  - derive deterministic planning signals from those payloads
  - answer planning-aware questions from the same FleetGraph graph
- current extension:
  - separate generic blocked work from dependency-style blocked work
  - compare incomplete sprint work against recent project throughput
  - compare incomplete sprint work against the currently allocated team
  - surface grounded planning explanations before any model-only reasoning
- later slices:
  - add stronger planning primitives to Ship
  - add historical planning state
  - add roadmap and milestone structure
  - reason on top of those signals with the same graph foundation

## Purpose

Give the graph and the LLM a stronger product foundation so they can reason about planning, prioritization, and delivery risk.

## Outcome

- planning-aware FleetGraph has begun
- stronger PM / PO workflows can now start from real scope-drift and workload evidence
- FleetGraph can now answer overcommitment questions with recent project delivery history instead of only current-sprint intuition
- FleetGraph can now answer staffing-pressure questions from real allocation data instead of generic capacity language
- FleetGraph can now answer whether blocked sprint work appears to be waiting on another decision or work item
- better connection between roadmap questions and execution evidence
