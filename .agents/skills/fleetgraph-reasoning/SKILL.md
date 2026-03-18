---
name: fleetgraph-reasoning
description: Use when building or revising FleetGraph sprint-risk reasoning, deterministic fallbacks, grounded explanation prompts, or HITL-ready recommendation language.
---

# FleetGraph Reasoning

Use this skill when FleetGraph needs better reasoning, better explanation quality, or tighter grounding.

## Workflow

1. Read [FLEETGRAPH.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/FLEETGRAPH.md) and [FLEETGRAPH-STATUS.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/FLEETGRAPH-STATUS.md).
2. Keep reasoning grounded in:
   - Active View Context
   - fetched Ship evidence
   - deterministic signals
3. Prefer deterministic fallback over brittle model retries.
4. Keep `reasoningSource` explicit as `deterministic` or `model`.
5. If the reasoning implies action, hand off to the bounded action catalog instead of inventing a new backend operation.

## Key files

- [reason-about-sprint.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/reasoning/reason-about-sprint.ts)
- [reason-about-sprint.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-sprint.ts)
- [fleetgraph-reasoner.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/services/fleetgraph-reasoner.ts)
- [types.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/types.ts)

## Guardrails

- Never invent sprint facts that are not in fetched evidence.
- Use structured outputs for model responses.
- Keep explanation output concise and actionable.
- Preserve deterministic behavior when the model is unavailable or parse-invalid.
