# Task 17: What Would Break First at 10x Scale?

## Short answer

The first thing I would expect to break is the real-time collaboration path, especially when multiple users edit the same documents at once across multiple app instances.

I would not expect simple read/write REST traffic to fail first. I would expect trouble to start where WebSocket connection count, in-memory Yjs room state, and horizontal scaling all intersect.

## Why this is the first fault line

### 1. Collaboration runs inside the main API process

The API server and collaboration server are attached to the same Node HTTP server, not split into separate runtime tiers:

- the main server creates one HTTP server and attaches collaboration to it [api/src/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/index.ts#L21)
- the architecture doc explicitly calls out "`WebSocket same process`" as a simplicity choice and notes sticky-session implications when scaling [docs/application-architecture.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/application-architecture.md#L807)

That is a good tradeoff for a small deployment, but it means the same instance has to absorb normal API load, WebSocket upgrades, live document sync, awareness traffic, and persistence work.

### 2. Live document state is stored in instance memory

The collaboration service keeps active room state in process-local maps:

- `docs` stores active `Y.Doc` instances in memory [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L88)
- `awareness`, `conns`, `eventConns`, and `pendingSaves` are also held in memory on that instance [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L90)

At 10x usage, this creates two immediate pressures:

- more concurrent users means more open WebSocket connections and more active room state per instance
- more instances means the same document can end up “split” across app nodes unless routing stays sticky or the collaboration layer is externalized

### 3. Each active document also drives persistence churn

Collaborative edits are not only live-memory events. They also trigger DB synchronization:

- Yjs state is converted and persisted back into `documents.yjs_state`, `documents.content`, and `documents.properties` [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L111)
- saves are debounced, but still scheduled per active room [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L181)

So higher collaboration load does not just increase connection count. It also increases CPU work, JSON conversion, and database write frequency.

### 4. The intended deployment size is still small

The repo’s own docs and infrastructure settings point to a modest scale target:

- the architecture notes expected scale as “Department-level (20-200 users)” [docs/application-architecture.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/application-architecture.md#L820)
- Terraform config uses `t3.small` instances with autoscaling from `1` to `4` instances in a load-balanced Elastic Beanstalk environment [terraform/elastic-beanstalk.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/elastic-beanstalk.tf#L140)

That is a reasonable starting point, but it is not a strong signal that the current topology was tuned for a 10x concurrency jump.

## What failure would likely look like

If usage jumped sharply, I would expect symptoms like:

- rising memory pressure and GC churn on API instances
- unstable or inconsistent collaboration when users on the same document land on different instances
- reconnect churn and more cache invalidation edge cases during editor sessions
- increased DB write load from collaboration persistence before classic CRUD endpoints become the main bottleneck

## Where I would harden first

If I had to prepare this app for 10x more users, I would prioritize:

1. separating or externalizing the collaboration tier
2. making room routing deterministic or sticky for document sessions
3. adding observability for active docs, active sockets, persistence latency, and per-instance memory
4. load-testing collaboration traffic before optimizing ordinary REST endpoints

## Bottom line

The first thing most likely to break is not the unified document model itself. It is the current collaboration runtime shape: WebSockets in the main API process, per-document Yjs state held in memory, and a deployment topology that is explicitly optimized for simplicity at roughly 20 to 200 users rather than a 10x jump beyond that range.
