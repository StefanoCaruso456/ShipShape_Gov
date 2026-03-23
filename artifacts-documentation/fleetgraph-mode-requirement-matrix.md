# FleetGraph Mode Requirement Matrix

## Purpose

This is the concise requirement chart for FleetGraph mode behavior.

It answers, objectively and briefly, whether the current implementation satisfies the quoted requirement set for:

- proactive push mode
- on-demand pull mode
- shared graph architecture

## Requirement Matrix

| Context | Requirement | Complete | Objective status |
|---|---|---:|---|
| Proactive | The agent pushes | ✅ | FleetGraph can run without a user asking first. |
| Proactive | The graph runs on its own schedule or in response to Ship events | ✅ | A proactive worker schedules sweeps, and issue/week mutations enqueue proactive event processing. |
| Proactive | It monitors project state, detects conditions worth surfacing, and delivers findings without being asked | ✅ | Proactive runs inspect active sprint targets, persist findings, and broadcast realtime `fleetgraph:finding` notifications when a recipient should be notified. |
| Proactive | The agent decides when something is worth acting on and when to stay quiet | ✅ | Delivery is gated by `derivedSignals.shouldSurface`; otherwise the run exits quietly. |
| On-demand | The user pulls | ✅ | Users invoke FleetGraph from the embedded Ship interface. |
| On-demand | The chat interface is context-aware and uses the current view as the starting point for reasoning | ✅* | Ship sends typed `active_view` and `page_context`, and the graph starts from that context rather than browser vision. |
| On-demand | The user asks a question or requests an action; the graph does the work | ✅ | The graph resolves scope, fetches evidence, derives signals, reasons, and can propose an action. Persistent consequential actions still require human approval. |
| Shared graph | Both modes run through the same graph architecture | ✅ | Proactive and on-demand both run through the same `createFleetGraph()` graph via the same `invokeFleetGraph(...)` runner. |
| Shared graph | The difference is the trigger, not the graph | ✅ | Mode changes the trigger, initialization path, entry context, and output path, while the underlying graph remains shared. |

\* Complete for the shipped supported surfaces. The current MVP slice is fully implemented, while broader surface coverage can continue to expand.

## Evidence

- Proactive sweep worker: [`api/src/index.ts`](../api/src/index.ts), [`api/src/services/fleetgraph-proactive.ts`](../api/src/services/fleetgraph-proactive.ts)
- Proactive event wiring: [`api/src/routes/issues.ts`](../api/src/routes/issues.ts), [`api/src/routes/weeks.ts`](../api/src/routes/weeks.ts), [`api/src/services/fleetgraph-proactive-events.ts`](../api/src/services/fleetgraph-proactive-events.ts)
- On-demand UI invoke path: [`web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx`](../web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx), [`api/src/routes/fleetgraph.ts`](../api/src/routes/fleetgraph.ts)
- Current-view context plumbing: [`web/src/lib/fleetgraph.ts`](../web/src/lib/fleetgraph.ts), [`web/src/hooks/useFleetGraphActiveView.ts`](../web/src/hooks/useFleetGraphActiveView.ts), [`web/src/hooks/useFleetGraphPageContext.ts`](../web/src/hooks/useFleetGraphPageContext.ts)
- Shared graph implementation: [`api/src/services/fleetgraph-runner.ts`](../api/src/services/fleetgraph-runner.ts), [`fleetgraph/src/graph.ts`](../fleetgraph/src/graph.ts), [`fleetgraph/src/nodes/supervisor-entry.ts`](../fleetgraph/src/nodes/supervisor-entry.ts)
- Shared-graph diagram: [`artifacts-diagrams/fleetgraph-shared-graph-end-to-end-flow.mmd`](../artifacts-diagrams/fleetgraph-shared-graph-end-to-end-flow.mmd)

## Related Detail

For the longer requirement-by-requirement explanation, see:

- [`artifacts-documentation/fleetgraph-on-demand-and-shared-graph-requirements.md`](./fleetgraph-on-demand-and-shared-graph-requirements.md)
