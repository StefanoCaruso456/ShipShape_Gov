---
name: fleetgraph-action-catalog
description: Use when adding or changing FleetGraph actions, tool schemas, executors, or HITL policy so the model stays bounded to a curated action catalog.
---

# FleetGraph Action Catalog

Use this skill when FleetGraph needs a new action type or a change to how actions are proposed, approved, suppressed, or executed.

## Workflow

1. Read [fleetgraph-skills-and-tools.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-skills-and-tools.md).
2. Update the bounded action catalog first.
3. Keep action definitions explicit:
   - purpose
   - target entity types
   - risk level
   - HITL requirement
   - strict input schema
   - executor type
4. Keep runtime execution in backend-owned executors.
5. Update HITL and suppression behavior together with any action change.

## Key files

- [catalog.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/actions/catalog.ts)
- [propose-sprint-action.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/actions/propose-sprint-action.ts)
- [propose-sprint-action.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/propose-sprint-action.ts)
- [human-approval-gate.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/human-approval-gate.ts)
- [execute-proposed-action.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/execute-proposed-action.ts)

## Guardrails

- Do not expose raw backend freedom to the model.
- Keep high-risk actions behind human approval.
- Add suppression and memory rules for repeated drafts.
- Update tests whenever the catalog or executor behavior changes.
