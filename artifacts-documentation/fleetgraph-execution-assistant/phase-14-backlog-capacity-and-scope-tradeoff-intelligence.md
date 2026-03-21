# Phase 14: Backlog, Capacity, and Scope Tradeoff Intelligence

## Objective

Teach proactive FleetGraph to reason not just about sprint drift, but about what the team should do next when capacity, value, and scope change.

## Why

A useful execution agent should not stop at:

- this sprint is drifting
- this issue is blocked

It should also be able to answer:

- capacity opened up, should we pull something in
- a dependency just cleared, is there ready backlog worth bringing forward
- lower-value work is sitting in sprint while higher-value work waits, should scope move
- what can we cut and still protect delivery

## What

Phase 14 adds proactive tradeoff reasoning for:

- capacity opened unexpectedly because work finished early
- ready backlog exists and should be considered for pull-in
- dependency blocker cleared, making work pull-in ready
- low-value work in sprint while higher-value backlog work waits
- too much carryover from prior sprint
- scope/value mismatch that should trigger a cut or swap recommendation

This phase should use:

- project business value
- execution attention
- backlog readiness
- current sprint capacity and completion signals
- dependency resolution evidence

## How

Phase 14 should be built in this order:

1. add deterministic capacity-open and backlog-readiness evidence
2. rank eligible backlog items by readiness plus business value
3. identify low-value in-sprint work that is safest to cut or move out
4. create proactive recommendation contracts for:
   - pull-in
   - cut
   - protect
   - watch
5. add focused tests for capacity, pull-in, and cut recommendation logic

## Purpose

The purpose of Phase 14 is to make proactive FleetGraph useful for scrum planning and mid-sprint tradeoffs, not just exception reporting.

## Outcome

When Phase 14 is working well:

- FleetGraph can suggest when to pull in ready, high-value backlog work
- FleetGraph can suggest when to move out lower-value work to protect delivery
- proactive findings become more decision-oriented for PMs and engineers

## Scope

Included in Phase 14:

- backlog readiness signals
- capacity-open detection
- pull-in candidate ranking
- cut/scope-tradeoff recommendation logic
- targeted tests and docs

Not included in Phase 14:

- Slack/email delivery
- external roadmap/KPI integrations
- free-form LLM prioritization without deterministic gating

## Exit Criteria

- FleetGraph can detect when capacity opens
- FleetGraph can identify ready backlog candidates worth pulling in
- FleetGraph can identify safer low-value work to cut or move out
- proactive recommendations stay grounded in deterministic evidence and business value

## Status

As of 2026-03-20:

- implementation status: not started
- verification status: not started
- merge-to-main status: not started
- production status: not live yet
