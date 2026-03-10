# API Response Time Baseline

## Scope

This baseline measures five user-facing API endpoints under authenticated load in the local Docker environment:

- Session bootstrap: [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L346) -> [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L261)
- Week dashboard load: [web/src/hooks/useMyWeekQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useMyWeekQuery.ts#L43) -> [api/src/routes/dashboard.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/dashboard.ts#L498)
- Sprint issue list: [web/src/hooks/useIssuesQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useIssuesQuery.ts#L109) -> [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts#L115)
- Document load: [web/src/pages/UnifiedDocumentPage.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/UnifiedDocumentPage.tsx#L47) -> [api/src/routes/documents.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/documents.ts#L221)
- Mention search: [web/src/components/editor/MentionExtension.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/editor/MentionExtension.ts#L23) -> [api/src/routes/search.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/search.ts#L16)

All five routes run through [authMiddleware](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L55), so session lookup and `last_activity` writes are part of every measured request.

## Methodology

Environment:

- Docker stack: `docker compose -f docker-compose.local.yml up`
- API at `http://localhost:3000`
- Authentication via real `session_id` cookie from `/api/auth/login`

Data volume used for this audit:

- `21` users
- `532` documents
- `104` issues
- `70` sprints

Those counts were verified from the live database and satisfy the assignment threshold of `20+` users, `500+` documents, `100+` issues, and `10+` sprints.

Measurement steps:

1. Seeded the local database with the repo seed script, then added local-only audit rows to reach the required volume.
2. Logged in with `dev@ship.local` / `admin123` to obtain a real session cookie.
3. Ran [benchmarks/api-performance-benchmark.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/api-performance-benchmark.mjs) against the live API.
4. For each endpoint, executed `30` requests at `10`, `25`, and `50` concurrent connections.
5. Saved the raw result set to [benchmarks/api-performance-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/api-performance-baseline.json).

Why this method:

- It exercises the real middleware chain, auth path, and SQL queries.
- It uses endpoints that the current frontend actually calls.
- It gives comparable P50/P95/P99 numbers at the exact concurrency levels the assignment requires.

## Audit Deliverable

Primary baseline table below uses the `25`-connection run as the comparison baseline because it is the middle load tier between the required `10` and `50` connection tests.

| Endpoint | P50 | P95 | P99 |
| --- | ---: | ---: | ---: |
| `GET /api/auth/me` | `41.49 ms` | `45.69 ms` | `45.90 ms` |
| `GET /api/dashboard/my-week` | `56.62 ms` | `61.70 ms` | `63.37 ms` |
| `GET /api/issues?sprint_id={id}` | `20.07 ms` | `24.39 ms` | `24.47 ms` |
| `GET /api/documents/:id` | `38.04 ms` | `43.77 ms` | `45.75 ms` |
| `GET /api/search/mentions?q=dev` | `31.57 ms` | `36.66 ms` | `37.01 ms` |

## Supporting Concurrency Results

### 10 concurrent connections

| Endpoint | P50 | P95 | P99 |
| --- | ---: | ---: | ---: |
| `GET /api/auth/me` | `13.21 ms` | `76.29 ms` | `121.97 ms` |
| `GET /api/dashboard/my-week` | `18.89 ms` | `97.00 ms` | `97.07 ms` |
| `GET /api/issues?sprint_id={id}` | `14.88 ms` | `21.73 ms` | `21.83 ms` |
| `GET /api/documents/:id` | `11.63 ms` | `33.22 ms` | `34.61 ms` |
| `GET /api/search/mentions?q=dev` | `11.22 ms` | `32.72 ms` | `33.30 ms` |

### 25 concurrent connections

| Endpoint | P50 | P95 | P99 |
| --- | ---: | ---: | ---: |
| `GET /api/auth/me` | `41.49 ms` | `45.69 ms` | `45.90 ms` |
| `GET /api/dashboard/my-week` | `56.62 ms` | `61.70 ms` | `63.37 ms` |
| `GET /api/issues?sprint_id={id}` | `20.07 ms` | `24.39 ms` | `24.47 ms` |
| `GET /api/documents/:id` | `38.04 ms` | `43.77 ms` | `45.75 ms` |
| `GET /api/search/mentions?q=dev` | `31.57 ms` | `36.66 ms` | `37.01 ms` |

### 50 concurrent connections

| Endpoint | P50 | P95 | P99 |
| --- | ---: | ---: | ---: |
| `GET /api/auth/me` | `44.06 ms` | `47.93 ms` | `48.07 ms` |
| `GET /api/dashboard/my-week` | `61.71 ms` | `64.59 ms` | `64.63 ms` |
| `GET /api/issues?sprint_id={id}` | `41.58 ms` | `44.90 ms` | `45.64 ms` |
| `GET /api/documents/:id` | `42.58 ms` | `48.81 ms` | `49.65 ms` |
| `GET /api/search/mentions?q=dev` | `30.13 ms` | `33.84 ms` | `34.19 ms` |

## Weaknesses And Opportunities

### 1. `GET /api/dashboard/my-week` is the slowest sustained endpoint

Severity: `High`

Why:

- The route in [api/src/routes/dashboard.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/dashboard.ts#L498) performs a serial aggregation flow:
  - person lookup
  - workspace lookup
  - plan lookup
  - retro lookup
  - previous retro lookup
  - standups lookup
  - project allocations lookup
- Those queries run one after another inside a single request handler.
- It also does response shaping work after the SQL returns.

Impact:

- It was the highest P95 at both `25` and `50` concurrency.
- This endpoint is a dashboard entry point, so any slowdown is user-visible immediately after page load.

### 2. Authenticated routes pay an avoidable write cost on every request

Severity: `Medium`

Why:

- [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L106) always does:
  - session lookup
  - workspace membership check
  - `UPDATE sessions SET last_activity = $1 WHERE id = $2`
- That means even read-only endpoints incur a database write in the auth layer.

Impact:

- It increases latency floor across all protected endpoints, especially `GET /api/auth/me`.
- It creates unnecessary write pressure as concurrency increases.

### 3. `GET /api/documents/:id` has variable query count based on document type

Severity: `Medium`

Why:

- The route in [api/src/routes/documents.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/documents.ts#L221) always checks access first, then conditionally runs extra lookups for:
  - converted documents
  - owner lookup
  - weekly plan/retro title expansion
  - `belongs_to` associations
- The exact query count depends on the document type, which makes the route cost less predictable.

Impact:

- Wiki loads are fine now, but project/sprint/weekly document reads can cost materially more than the measured baseline.
- This variability is a scaling risk for generic document screens.

### 4. Issue list route is relatively efficient now, but still JSONB- and association-heavy

Severity: `Low`

Why:

- [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts#L115) already avoids a classic N+1 pattern by calling `getBelongsToAssociationsBatch(issueIds)`.
- It still filters and sorts on JSONB fields plus association subqueries, which can become more expensive as issue volume grows.

Impact:

- Current latency is good.
- It is still a likely candidate for future indexing work once issue counts increase further.

### 5. Mention search is currently fast, but it does two searches plus an admin check

Severity: `Low`

Why:

- [api/src/routes/search.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/search.ts#L16) does:
  - `isWorkspaceAdmin(...)`
  - one query for people
  - one query for documents

Impact:

- It is not a current bottleneck.
- The route is still chatty enough that search volume spikes could matter later.

## Endpoint Ranking By Current Sustained P95

Based on the `50`-connection run:

1. `GET /api/dashboard/my-week` -> `64.59 ms`
2. `GET /api/documents/:id` -> `48.81 ms`
3. `GET /api/auth/me` -> `47.93 ms`
4. `GET /api/issues?sprint_id={id}` -> `44.90 ms`
5. `GET /api/search/mentions?q=dev` -> `33.84 ms`

## Notes

- No fixes were applied to application code for this audit.
- The only local environment changes were benchmark setup and local audit data inserts to meet the assignment’s required measurement volume.
- Raw evidence is preserved in [benchmarks/api-performance-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/api-performance-baseline.json).
