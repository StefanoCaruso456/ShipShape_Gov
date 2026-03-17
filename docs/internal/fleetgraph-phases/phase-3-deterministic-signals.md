# Phase 3: Deterministic Signals

Status: `completed`

## What

Add rules-first sprint signal detection for the MVP scope:

- missing rituals
- low activity in active work
- no completed work
- all work still incomplete / not started
- changes-requested approval state
- missing weekly review for completed sprint

## Why

The LLM should analyze flagged situations, not act as the first filter for every run.

## How

- derive structured signals from fetched sprint, activity, and accountability data
- compute typed metrics:
  - issue counts
  - standup count
  - recent activity
  - completion rate
- generate stable signal-level dedupe keys
- branch the graph into:
  - quiet completion when nothing meaningful is found
  - recorded finding when a sprint condition should be surfaced
- return `derivedSignals` and `finding` in the API response for verification

## Purpose

Control cost, improve reliability, and make the graph more explainable.

## Outcome

- deterministic sprint-risk detection before LLM reasoning
- separate quiet vs flagged graph paths for the sprint/week MVP slice
- live API output that shows:
  - signal severity
  - signal reasons
  - signal evidence
  - summarized finding

## Validation

Phase 3 was validated in three ways:

- container build succeeded for `shared`, `fleetgraph`, and `api`
- graph test passed for both:
  - flagged sprint path
  - quiet sprint path
- live request against `/api/fleetgraph/on-demand` returned:
  - `derivedSignals`
  - `finding`
  - preserved `Active View Context`
