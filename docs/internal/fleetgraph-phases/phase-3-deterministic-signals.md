# Phase 3: Deterministic Signals

Status: `planned`

## What

Add rules-first signal detection:

- stale issues
- missing rituals
- approval bottlenecks
- low activity in active work
- unresolved changes-requested state

## Why

The LLM should analyze flagged situations, not act as the first filter for every run.

## How

- derive structured signals from fetched data
- score severity and confidence
- generate dedupe keys
- route to quiet exit when nothing meaningful is found

## Purpose

Control cost, improve reliability, and make the graph more explainable.

## Outcome

- real anomaly detection before LLM reasoning
- cleaner branch conditions
- better proactive signal quality
