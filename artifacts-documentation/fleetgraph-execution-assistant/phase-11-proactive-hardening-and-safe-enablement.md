# Phase 11: Proactive Hardening and Safe Enablement

## Objective

Make FleetGraph proactive assistance safe to enable in production.

## Why

The proactive sweep exists in code, but production cannot trust it yet because:

- the worker is disabled by environment configuration
- worker authentication is brittle for multi-workspace sweeps
- there is no first-class runtime status endpoint to verify whether the worker is healthy

## What

Phase 11 delivers:

1. workspace-aware service auth for proactive internal API fetches
2. production config loading for proactive worker settings
3. admin-visible runtime status for proactive FleetGraph

## How

- allow super-admin API tokens to override workspace scope with an explicit internal header
- create workspace-scoped API clients for each proactive workspace sweep
- load `FLEETGRAPH_ENABLE_PROACTIVE_WORKER`, `FLEETGRAPH_INTERNAL_API_TOKEN`, `FLEETGRAPH_PROACTIVE_SWEEP_INTERVAL_MS`, and `FLEETGRAPH_FINDING_COOLDOWN_MS` from SSM in production
- record worker startup state, last sweep timing, last sweep counts, and last error in process memory
- expose that state at `GET /api/fleetgraph/proactive/status`

## Purpose

The purpose of this phase is operational trust.

Before we add event-driven proactive triggers, richer backlog-capacity logic, or Slack/email delivery, the system must be safe to run in production and easy to verify.

## Outcome

After Phase 11:

- FleetGraph proactive sweeps can authenticate safely across workspaces
- production can enable the worker without relying only on Elastic Beanstalk env vars
- admins can confirm whether proactive FleetGraph is disabled, misconfigured, idle, or actively sweeping

## Scope

In scope:

- worker auth hardening
- SSM-backed proactive config loading
- runtime status visibility

Out of scope:

- event bus / pub-sub triggers
- backlog-capacity pull-in logic
- Slack/email delivery
- expanded proactive signal catalog

## Exit Criteria

- proactive worker can send workspace-aware internal API requests safely
- proactive worker settings can be loaded from SSM in production
- admin route returns proactive runtime status
- targeted auth/runtime tests pass

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet
