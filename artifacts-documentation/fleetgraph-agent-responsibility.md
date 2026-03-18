# FleetGraph Agent Responsibility

Concise responsibility answers for the FleetGraph MVP.

Source of truth:
- [FLEETGRAPH.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/FLEETGRAPH.md)

## Core Responsibility

FleetGraph is responsible for:

- monitoring active sprint drift in Ship
- surfacing findings worth a human's attention
- explaining why the current sprint is at risk
- identifying the right person to act next
- preparing a safe next step in context

FleetGraph is not responsible for:

- acting like a standalone chatbot
- replacing normal Ship dashboards
- mutating project state without review
- becoming a second source of truth outside Ship

## Clear Answers

| Question | Answer |
|---|---|
| What does this agent monitor proactively? | Active sprint drift. MVP signals include low or missing recent activity, stale or blocked work, missing standups, no completed work, work not started, missing review, and approval or review friction. |
| What does it reason about when invoked on demand? | Why the sprint in the current view is at risk, which signals matter most, who should act next, and whether a follow-up or escalation draft should be prepared. |
| What can it do autonomously? | Resolve scope, fetch Ship REST data, detect and rank findings, explain likely causes, surface in-app findings, prepare bounded draft actions, and manage dedupe, snooze, and cooldown memory. |
| What must it always ask a human about before acting? | Any consequential action, including posting a persistent comment, notifying people beyond the directly responsible chain, changing issue or sprint state, or creating follow-up work. |
| Who does it notify, and under what conditions? | Responsible owner first when a real risk finding should be surfaced. Accountable person if the risk is severe or unresolved. Manager or director only if the chain has stalled or the impact is cross-project. Informed roles only for high-signal summaries. |
| How does it know who is on a project and what their role is? | From Ship REST data plus authenticated actor context. The graph uses owner, assignee, accountable, project, program, and workspace-role data returned by Ship APIs. |
| How does the on-demand mode use context from the current view? | The UI sends Active View Context with route, surface, entity id, entity type, tab, and project scope. The graph uses that as the starting point, resolves it to the right sprint when needed, then reasons over fetched Ship evidence for that scope. |

## MVP Summary

For MVP, FleetGraph is intentionally narrow:

- Proactive use case: sprint is drifting before anyone asks.
- On-demand question: why is this sprint at risk?
- First action boundary: FleetGraph can draft the next step, but a human must approve before anything persistent happens.
