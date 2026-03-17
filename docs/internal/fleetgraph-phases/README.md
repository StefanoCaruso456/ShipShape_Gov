# FleetGraph Phase Docs

This folder tracks the FleetGraph build one phase at a time.

Each phase document uses the same structure:

- **What**
- **Why**
- **How**
- **Purpose**
- **Outcome**

This keeps the implementation history and the future plan in one place without making the main roadmap too noisy.

## Cross-cutting build rules

- Keep FleetGraph in the existing TypeScript monorepo.
- Keep proactive and on-demand mode on the same graph.
- Keep LangGraph as the orchestration runtime.
- Keep state, runtime, and supervisor responsibilities separate.
- Keep on-demand mode bound to the current Ship view.

## Important product term

The requirement that FleetGraph knows what page or tab the user is on should be called:

- **Active View Context**

That means the graph receives the current Ship scope directly from the UI, such as:

- issue
- week / sprint
- project
- program
- person / My Week

Active View Context is partially accounted for in Phase 1 through the typed `contextEntity` state field and the on-demand initialization gate. It is implemented first for the sprint/week MVP slice in Phase 2, where real UI context and real Ship fetches get wired into the graph.

## Phase index

- [phase-0-mvp-framing.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-0-mvp-framing.md)
- [phase-1-graph-foundation.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-1-graph-foundation.md)
- [phase-2-context-and-fetch.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-2-context-and-fetch.md)
- [phase-3-deterministic-signals.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-3-deterministic-signals.md)
- [phase-4-proactive-mvp.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-4-proactive-mvp.md)
- [phase-5-on-demand-ui.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-5-on-demand-ui.md)
- [phase-6-reasoning-actions-hitl.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-6-reasoning-actions-hitl.md)
- [phase-7-failure-resume-memory.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-7-failure-resume-memory.md)
- [phase-8-planning-intelligence.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-8-planning-intelligence.md)
- [phase-9-evidence-and-submission.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/internal/fleetgraph-phases/phase-9-evidence-and-submission.md)
