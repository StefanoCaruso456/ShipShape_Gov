# Phase 6: Reasoning, Actions, and HITL

Status: `next`

## What

Add explanation quality and safe action handling:

- reasoning node
- action proposal node
- human-in-the-loop gate
- approve / dismiss / snooze paths

## Why

FleetGraph should not just detect problems. It should explain why they matter and what should happen next, while staying safe around consequential actions.

## How

- add a reasoning node on top of deterministic signals and fetched evidence
- generate evidence-backed recommendations
- pause the graph before consequential mutations
- resume through a typed approval path

## Purpose

Turn FleetGraph from a detector into an agent that can explain and propose, while still staying safe.

## Outcome

- at least one explanation path beyond deterministic signals
- at least one action proposal
- at least one interrupt / resume path
- safe HITL behavior
