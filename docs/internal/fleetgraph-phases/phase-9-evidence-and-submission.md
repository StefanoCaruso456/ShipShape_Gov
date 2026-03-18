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
- generated evidence bundle:
  - [summary.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.md)
  - [summary.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.json)
  - [flagged-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/flagged-run.json)
  - [hitl-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/hitl-run.json)
  - [resume-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/resume-run.json)
  - [proactive-run.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/proactive-run.json)
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
