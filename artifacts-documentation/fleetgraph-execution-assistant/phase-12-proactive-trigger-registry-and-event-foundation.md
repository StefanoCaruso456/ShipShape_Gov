# Phase 12: Proactive Trigger Registry and Event Foundation

## Objective

Move FleetGraph proactive assistance from timer-only sweeps toward event-driven execution monitoring.

Phase 12 introduces the first bounded proactive trigger foundation so FleetGraph can react to high-signal scrum state changes when they happen, not only when the periodic sweep notices them later.

## Why

By the end of Phase 11, proactive FleetGraph is safer to run in production, but it is still fundamentally sweep-driven.

That leaves a product gap:

- PMs and engineers want the assistant to notice obvious execution problems at the moment the state becomes risky
- the current sweep can detect drift, but not every event-worthy state transition
- a future pub/sub system needs a typed trigger contract before it grows into a larger event bus

## What

Phase 12 delivers the first event-driven proactive foundation:

1. a transactional proactive event outbox written at the issue and sprint mutation boundary
2. a typed proactive trigger registry for high-signal scrum conditions
3. an event processor that evaluates those triggers and reuses FleetGraph findings + in-app delivery
4. roadmap documentation for which triggers are in scope now and which are still future work

The first trigger slice focuses on states we explicitly called out:

- issue in an active sprint with no assignee
- issue added to an active sprint after the sprint already started
- issue still open on the last day of an active sprint
- active sprint with no owner

## How

Phase 12 is built in this order:

1. define shared TypeScript contracts for proactive events and trigger kinds
2. add a database-backed proactive event outbox
3. enqueue issue and sprint mutation events inside the same transaction that changes Ship state
4. evaluate events against a deterministic trigger registry
5. persist/broadcast resulting FleetGraph findings through the existing proactive delivery path
6. validate the slice with focused tests for trigger matching and queue processing

## Purpose

The purpose of Phase 12 is to make proactive FleetGraph feel operationally aware instead of purely retrospective.

For PMs, this means:

- being told when sprint scope or ownership just became risky

For engineers, this means:

- being told when work entered sprint with no clear owner or is now at end-of-sprint risk

## Outcome

When Phase 12 is working well:

- proactive FleetGraph has a real mutation-driven entry point
- trigger-worthy scrum states can surface without waiting only on the next sweep
- the system has a clean foundation for later pub/sub or outbox-consumer expansion

## Scope

Included in Phase 12:

- proactive event and trigger types
- proactive event outbox table
- issue/sprint mutation event publishing
- deterministic trigger registry for the first high-signal states
- event-to-finding processing
- focused tests and roadmap docs

Not included in Phase 12:

- external SNS/SQS/Kafka infrastructure
- Slack/email delivery
- backlog-capacity pull-in recommendations
- full escalation policy by org role

## Exit Criteria

- issue and sprint mutations can enqueue proactive events transactionally
- the first trigger registry can detect the initial high-signal scrum states
- matching events can produce FleetGraph findings through the existing delivery path
- focused tests pass for trigger evaluation and event processing

## Status

As of 2026-03-20:

- implementation status: in progress
- verification status: pending
- merge-to-main status: not started
- production status: not live yet
