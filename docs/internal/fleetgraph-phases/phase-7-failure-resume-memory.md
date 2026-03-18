# Phase 7: Failure, Resume, and Memory

Status: `complete for MVP slice`

## What

Add runtime durability:

- failure classification
- retryable vs terminal behavior
- resume support
- dedupe, cooldown, and snooze memory
- loop and deadline guardrails
- per-node telemetry
- Braintrust span instrumentation
- bounded action schemas and reasoning skills

## Why

A happy-path-only graph is not enough for a system that runs proactively and pauses for humans.

## How

- classify errors explicitly
- store operational memory outside Ship domain truth
- support checkpoint-aware resume
- track intervention events
- track reasoning, resume, and action-attempt counts
- stop runs that exceed transition, resume, retry, or deadline budgets
- record compact node trace history with latency
- emit one top-level telemetry span per run and child spans for major node groups
- keep model actions bounded behind a typed action catalog instead of open-ended tool freedom

## Purpose

Keep the graph reliable under real runtime conditions.

## Outcome

- fewer repeated alerts
- better recovery behavior
- traceable interventions and resumes
- explicit terminal outcomes for quiet, surfaced, waiting, executed, suppressed, and failed runs
- tighter observability for reasoning source and action execution behavior

## Built in this phase

- state fields for:
  - attempts
  - guard budgets
  - timing
  - reasoning source
  - suppression reason
  - last node
  - compact node history
  - telemetry ids
- hard stops for:
  - too many transitions
  - too many resumes
  - expired deadlines
- deterministic reasoning fallback when model reasoning exceeds budget
- retry classification for retryable vs terminal failures
- Braintrust telemetry spans for:
  - fetch
  - signal derivation
  - reasoning
  - HITL pause / resume
  - action execution
- bounded action catalog and FleetGraph reasoning/action skills

## Validation

- `@ship/fleetgraph` tests passed, including:
  - transition budget hard stop
  - resume budget hard stop
  - suppression memory classification
  - deterministic reasoning-source tracking
- `@ship/shared` build passed
- `@ship/api` build passed
- `@ship/web` build passed
- targeted API proactive test passed against Docker Postgres
