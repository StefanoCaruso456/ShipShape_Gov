# Phase 9: Evidence and Submission

Status: `in progress`

## What

Close the loop on proof and deliverables:

- shared LangSmith traces
- `FLEETGRAPH.md`
- test cases
- detection latency proof
- cost analysis
- deployment verification
- repeatable evidence capture

## Why

This project is graded on both implementation and evidence.

## How

- save trace links for different graph paths
- document trigger model, nodes, edges, and branching
- measure latency and cost
- verify public deployment
- automate local evidence capture from the live stack

## Purpose

Make the build defensible, reproducible, and ready to submit.

## Outcome

- MVP checklist fully covered
- clear evidence package
- complete submission readiness

## Built so far

- local evidence harness:
  - [collect-fleetgraph-evidence.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/collect-fleetgraph-evidence.mjs)
- requirement verification harness:
  - [verify-fleetgraph-requirements.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/verify-fleetgraph-requirements.mjs)
- generated evidence bundle:
  - [summary.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.md)
  - [summary.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.json)
  - [flagged-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/flagged-run.json)
  - [hitl-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/hitl-run.json)
  - [resume-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/resume-run.json)
  - [proactive-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/proactive-run.json)
- generated requirement verification bundle:
  - [summary.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-requirements/summary.md)
  - [summary.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-requirements/summary.json)
- LangSmith run-id / URL capture support when tracing is configured

## Current result

We now have objective local evidence for:

- flagged on-demand path
- HITL waiting path
- HITL resume / dismiss path
- proactive sweep path

Still open:

- shared LangSmith trace links
- a quiet-path evidence run from a traced healthy scenario
- deployment verification and public URL proof

Current blocker details:

- public Ship URLs respond, but deployed FleetGraph routes are not live yet
- this shell currently has no LangSmith tracing env configured

Closeout order:

1. export LangSmith tracing env vars
2. rerun the evidence harness and save shared trace links
3. deploy the FleetGraph branch to a public Ship environment
4. rerun the requirement verification harness

## Incremental closeout plan

### Phase 9A: Evidence readiness

Goal:

- ensure we can capture both quiet and flagged runs reliably against real Ship data

Current focus:

- normalize issue progress reads in the Claude review/retro context so seeded issue state maps correctly into FleetGraph signals

Exit criteria:

- local evidence harness captures a quiet path
- local evidence harness still captures a flagged path

### Phase 9B: LangSmith trace capture

Goal:

- collect the trace links required for submission

Exit criteria:

- tracing env is enabled
- at least two shared trace links are saved
- links show different execution paths

### Phase 9C: Public deployment

Goal:

- make FleetGraph reachable on a public Ship environment

Exit criteria:

- API and frontend are deployed together
- public FleetGraph routes respond as real API routes, not `Cannot POST` or SPA fallback

### Phase 9D: Public verification and packaging

Goal:

- package the final evidence bundle with objective verification

Exit criteria:

- public verification harness is green
- trace links are attached
- evidence bundle is ready for submission
