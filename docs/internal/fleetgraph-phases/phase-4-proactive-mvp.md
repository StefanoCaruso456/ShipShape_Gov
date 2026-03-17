# Phase 4: Proactive MVP

Status: `implemented`

## What

Ship one proactive detection end to end:

- admin-triggered proactive sweep endpoint for verification
- env-gated 5-minute proactive worker
- shared graph detection using the same sprint signal path as on-demand mode
- realtime Ship toast for the sprint owner
- persisted cooldown / dedupe memory in the API database

## Why

This is the first assignment-critical product moment where FleetGraph acts without being asked, and it is where the project stops looking like a contextual helper and starts behaving like a real agent system.

## How

- use a hybrid trigger:
  - env-gated background sweep every 5 minutes
  - manual sweep endpoint for objective verification and future automation
- keep the MVP scope narrow:
  - sprint is drifting before anyone asks
- persist active findings with cooldown so the same sprint is not rebroadcast every sweep
- surface the result in a native Ship realtime toast with an "Open Sprint" action

## Purpose

Prove that proactive mode is real, useful, and traceable.

## Outcome

- one real proactive flow on live Ship data
- one quiet proactive path
- one problem-detected proactive path
- one persisted finding record that survives beyond a single request
