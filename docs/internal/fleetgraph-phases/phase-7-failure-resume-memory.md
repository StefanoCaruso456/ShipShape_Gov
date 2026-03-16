# Phase 7: Failure, Resume, and Memory

Status: `planned`

## What

Add runtime durability:

- failure classification
- retryable vs terminal behavior
- resume support
- dedupe, cooldown, and snooze memory

## Why

A happy-path-only graph is not enough for a system that runs proactively and pauses for humans.

## How

- classify errors explicitly
- store operational memory outside Ship domain truth
- support checkpoint-aware resume
- track intervention events

## Purpose

Keep the graph reliable under real runtime conditions.

## Outcome

- fewer repeated alerts
- better recovery behavior
- traceable interventions and resumes
