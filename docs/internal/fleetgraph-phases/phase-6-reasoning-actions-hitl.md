# Phase 6: Reasoning, Actions, and HITL

Status: `planned`

## What

Add recommendation quality and safe action handling:

- reasoning node
- action proposal node
- human-in-the-loop gate
- approve / dismiss / snooze paths

## Why

FleetGraph should not just detect problems. It should explain why they matter and what should happen next, while staying safe around consequential actions.

## How

- use Claude for real analysis, not formatting
- generate evidence-backed recommendations
- pause the graph before consequential mutations
- resume through a typed approval path

## Purpose

Turn FleetGraph from a detector into an actual agent system.

## Outcome

- at least one action proposal
- at least one interrupt / resume path
- safe HITL behavior
