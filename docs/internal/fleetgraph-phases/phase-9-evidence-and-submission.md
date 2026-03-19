# Phase 9: Evidence and Submission

Status: `complete`

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
  - [collect-fleetgraph-evidence.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/collect-fleetgraph-evidence.ts)
- requirement verification harness:
  - [verify-fleetgraph-requirements.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/verify-fleetgraph-requirements.ts)
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

- quiet on-demand path
- flagged on-demand path
- HITL waiting path
- HITL resume / dismiss path
- proactive sweep path

Public deployment proof is now complete:

- `https://d1woqw06xb054i.cloudfront.net` is live
- `/health` returns `{"status":"ok"}`
- public FleetGraph routes are mounted and return `403 Forbidden` when unauthenticated
- the requirement verification harness is green against the public deployment

Closeout order completed:

1. exported LangSmith tracing env vars and captured shared trace links
2. reran the evidence harness and saved shared trace links
3. deployed the FleetGraph branch to the public Ship environment
4. reran the requirement verification harness against the live public URL

## Incremental closeout plan

### Phase 9A: Evidence readiness

Goal:

- ensure we can capture both quiet and flagged runs reliably against real Ship data

Current focus:

- normalize issue progress reads in the Claude review/retro context so seeded issue state maps correctly into FleetGraph signals

Exit criteria:

- local evidence harness captures a quiet path
- local evidence harness still captures a flagged path

Status:

- complete

### Phase 9B: LangSmith trace capture

Goal:

- collect the trace links required for submission

Exit criteria:

- tracing env is enabled
- at least two shared trace links are saved
- links show different execution paths

Status:

- complete

Completed evidence:

- quiet-path shared LangSmith trace captured in the `shipshape` project
- problem-detected shared LangSmith trace captured in the `shipshape` project

### Phase 9C: Public deployment

Goal:

- make FleetGraph reachable on a public Ship environment

Exit criteria:

- API and frontend are deployed together
- public FleetGraph routes respond as real API routes, not `Cannot POST` or SPA fallback

Status:

- complete

### Phase 9D: Public verification and packaging

Goal:

- package the final evidence bundle with objective verification

Exit criteria:

- public verification harness is green
- trace links are attached
- evidence bundle is ready for submission

Status:

- complete
