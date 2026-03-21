# Phase 15: Notification Targeting, Escalation, and Delivery Channels

## Objective

Make proactive FleetGraph findings reach the right person with the right urgency and the right context.

## Why

Even strong proactive analysis can fail if delivery is weak.

FleetGraph currently has a narrow in-app delivery path. It still needs a clearer model for:

- who gets the finding first
- when a local follow-up becomes an escalation
- which delivery channel is appropriate
- how to present actionable context without turning into spam

## What

Phase 15 adds a proactive notification policy and delivery layer.

This phase should include:

- role-aware targeting:
  - responsible owner first
  - accountable person when risk is severe or unresolved
  - broader roles only when impact justifies it
- escalation policy:
  - local follow-up vs escalation
  - severity and staleness thresholds
  - cross-project / cross-team impact rules
- delivery channels in order:
  - in-app feed/inbox
  - toast
  - optional Slack/email later
- structured message generation:
  - deterministic trigger gating first
  - LLM-generated wording second, grounded in structured evidence

## How

Phase 15 should be built in this order:

1. define notification target resolution rules
2. define escalation policy by severity, age, and impact
3. build a persistent in-app finding feed/inbox on top of the existing finding model
4. keep toasts as the lightweight immediate surface
5. add optional external channel adapters only after in-app delivery is working well
6. generate channel-specific wording from structured evidence with deterministic safety rails

## Purpose

The purpose of Phase 15 is to make proactive FleetGraph feel like a useful execution teammate rather than a noisy background system.

## Outcome

When Phase 15 is working well:

- the right person gets the finding first
- escalation happens only when needed
- proactive findings are actionable and concise
- FleetGraph can move from simple toast delivery to a fuller in-app feed and later external channels

## Scope

Included in Phase 15:

- target resolution rules
- escalation rules
- in-app feed/inbox delivery design
- channel-aware delivery contracts
- structured notification copy generation
- targeted tests and docs

Not included in Phase 15:

- broad marketing-style outbound messaging
- unconstrained autonomous notifications
- non-Ship systems as the primary source of truth

## Exit Criteria

- FleetGraph can resolve who should receive a proactive finding first
- escalation rules are explicit and deterministic
- in-app proactive findings can live in a durable feed/inbox, not only a transient toast
- notification content is grounded and role-aware

## Status

As of 2026-03-20:

- implementation status: not started
- verification status: not started
- merge-to-main status: not started
- production status: not live yet
