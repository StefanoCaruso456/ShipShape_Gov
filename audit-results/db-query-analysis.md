# Database Query Efficiency Baseline

## Scope

This audit measures database work for five real UI flows in the current application:

- Load main page: app bootstrap + My Week page via [web/src/hooks/useAuth.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useAuth.tsx#L74) and [web/src/pages/MyWeekPage.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/MyWeekPage.tsx#L29)
- View a document: [web/src/pages/UnifiedDocumentPage.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/UnifiedDocumentPage.tsx#L47)
- List issues: [web/src/pages/Issues.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/Issues.tsx#L14) and [web/src/components/IssuesList.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/IssuesList.tsx#L235)
- Load sprint board: [web/src/components/week/WeekDetailView.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/week/WeekDetailView.tsx#L48), [web/src/components/StandupFeed.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/StandupFeed.tsx#L65), and [web/src/components/IssuesList.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/IssuesList.tsx#L253)
- Search content: command palette open in [web/src/components/CommandPalette.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/CommandPalette.tsx#L129)

All routes are measured as they actually run, including middleware such as [authMiddleware](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L55) and visibility checks in [api/src/middleware/visibility.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/visibility.ts#L1).

## Methodology

Dataset:

- `21` users
- `532` documents
- `104` issues
- `70` sprints

Instrumentation:

1. Enabled PostgreSQL statement timing on the local Docker database.
2. Authenticated once with a real `session_id` cookie.
3. Ran [benchmarks/db-query-flow-capture.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/db-query-flow-capture.mjs), which:
   - executed the frontend’s actual API request set for each flow
   - read PostgreSQL logs after each flow
   - counted only `execute` entries, not parse/bind noise
   - recorded the slowest SQL statement and its duration
4. Saved raw flow evidence to [benchmarks/db-query-flow-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/db-query-flow-baseline.json).
5. Ran `EXPLAIN ANALYZE` on the dominant slow queries and saved the plans:
   - [explain-search-content-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-search-content-baseline.txt)
   - [explain-projects-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-projects-baseline.txt)
   - [explain-issues-list-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-issues-list-baseline.txt)
   - [explain-sprint-detail-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-sprint-detail-baseline.txt)

Important measurement note:

- `Total Queries` includes middleware queries because they are part of the real request cost.
- The authenticated audit user was `dev@ship.local`, which is a super-admin. That slightly under-represents membership-check overhead on routes that would do more work for non-admin users.

## Audit Deliverable

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
| --- | ---: | ---: | --- |
| Load main page | `14` | `0.423 ms` | `No` |
| View a document | `16` | `1.972 ms` | `No` |
| List issues | `13` | `1.236 ms` | `No` |
| Load sprint board | `31` | `1.649 ms` | `No` |
| Search content | `4` | `2.564 ms` | `No` |

## Flow Breakdown

### Load main page

HTTP requests executed:

- `GET /api/auth/me`
- `GET /api/dashboard/my-week`

What the count shows:

- `14` SQL queries for just two API requests
- the flow is query-heavy because [web/src/hooks/useAuth.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useAuth.tsx#L74) does a session bootstrap request first, then [api/src/routes/dashboard.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/dashboard.ts#L498) aggregates plan, retro, previous retro, standups, and project assignments

Why N+1 is `No`:

- the route is serial and multi-query, but not “one query per returned item”

### View a document

HTTP requests executed:

- `GET /api/documents/:id`
- `GET /api/team/people`
- `GET /api/programs`
- `GET /api/projects`

What the count shows:

- the screen triggers `16` SQL queries
- the slowest query in the flow is not the document fetch itself; it is the global projects list query pulled in by [web/src/pages/UnifiedDocumentPage.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/UnifiedDocumentPage.tsx#L104)

Why N+1 is `No`:

- this is auxiliary preloading, not per-document fan-out

### List issues

HTTP requests executed:

- `GET /api/issues`
- `GET /api/team/people`
- `GET /api/projects`

What the count shows:

- the flow executes `13` SQL queries
- [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts#L115) does one main issue query and one batch association query via [api/src/utils/document-crud.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/utils/document-crud.ts#L148)

Why N+1 is `No`:

- the code explicitly batches `belongs_to` lookups with `getBelongsToAssociationsBatch(...)`

### Load sprint board

HTTP requests executed:

- `GET /api/weeks/:id`
- `GET /api/weeks/:id/issues`
- `GET /api/weeks/:id/standups`
- `GET /api/team/people`
- `GET /api/projects`
- `GET /api/programs/:programId/sprints`
- `GET /api/issues?sprint_id=:id`

What the count shows:

- this is the heaviest measured flow at `31` SQL queries
- the flow fans out across multiple widgets and also duplicates issue loading:
  - [web/src/components/week/WeekDetailView.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/week/WeekDetailView.tsx#L57) fetches `/api/weeks/:id/issues`
  - nested [web/src/components/IssuesList.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/IssuesList.tsx#L253) self-fetches `/api/issues?sprint_id=:id`

Why N+1 is `No`:

- it is redundant query duplication, not a one-query-per-item pattern

### Search content

HTTP requests executed:

- `GET /api/documents`

What the count shows:

- only `4` SQL queries total, but the slowest single SQL statement in the entire audit appears here
- [web/src/components/CommandPalette.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/CommandPalette.tsx#L129) loads all documents and filters client-side instead of calling a dedicated search endpoint

Why N+1 is `No`:

- this is one large list query, not per-item follow-up querying

## EXPLAIN ANALYZE Findings

### 1. Command palette search is doing a sequential scan over active documents

Evidence:

- [explain-search-content-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-search-content-baseline.txt)

Key planner output:

- `Seq Scan on documents`
- `Sort`
- execution time: `0.771 ms` on `532` documents

Why it matters:

- The current volume is still small, so the runtime is low.
- The query shape is the real problem: the command palette opens by loading every visible document, then filtering client-side.
- That design will scale linearly with workspace size.

### 2. The projects list query is the dominant repeated slow query across multiple flows

Evidence:

- [explain-projects-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-projects-baseline.txt)

Key planner output:

- execution time: `1.750 ms`
- repeated `SubPlan` loops over projects
- `Bitmap Heap Scan on documents sprint` with `rows=70 loops=15`
- correlated subquery repeated once per project row

Why it matters:

- This query was the slowest business query in:
  - View a document
  - List issues
  - Load sprint board
- The route is [api/src/routes/projects.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/projects.ts#L313).
- It computes inferred project status by scanning sprint documents per project, which is structurally expensive.

Concrete missing-index signal:

- There is no partial expression index for sprint-to-project lookup on `(properties->>'project_id')` for sprint documents.
- Existing indexes include a GIN on `properties`, but the planner still scans sprint rows repeatedly for the correlated subquery.

### 3. The core issues list query is acceptable and already avoids a classic N+1

Evidence:

- [explain-issues-list-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-issues-list-baseline.txt)

Key planner output:

- execution time: `0.792 ms`
- `Bitmap Heap Scan on documents d`
- separate batch association query in runtime evidence, not one follow-up query per issue

Why it matters:

- The issues route is not the current database bottleneck.
- The main positive pattern is the batch association fetch in [api/src/utils/document-crud.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/utils/document-crud.ts#L148).

### 4. Sprint detail query is subquery-heavy but currently well-supported by existing indexes

Evidence:

- [explain-sprint-detail-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-sprint-detail-baseline.txt)

Key planner output:

- execution time: `0.493 ms`
- primary lookups use `documents_pkey`, `idx_document_associations_related_type`, and `idx_documents_parent_id`

Why it matters:

- The sprint detail endpoint itself is not the root cause of the board flow’s `31` queries.
- The board’s cost comes mostly from screen fan-out and duplicate auxiliary requests, not a single pathological sprint query.

## Index Review

Reviewed current indexes via `pg_indexes` for:

- `documents`
- `document_associations`
- `sessions`
- `workspace_memberships`

Current useful indexes already in place:

- [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L367) -> `idx_documents_active`
- [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L358) -> `idx_documents_person_user_id`
- [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L374) through [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L378) -> document association indexes
- [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L339) through [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L342) -> session indexes

Gaps that showed up in the measured flows:

1. No targeted index for sprint documents by `properties->>'project_id'`

- This hurts the inferred-status subquery in [api/src/routes/projects.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/projects.ts#L344).
- Severity: `High`

2. No index aligned to the command-palette “load all active docs in a workspace ordered by position/created_at” pattern

- The flow falls back to a sequential scan in [explain-search-content-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/explain-search-content-baseline.txt).
- Severity: `Medium`

3. Session writes inflate total query count across every multi-request flow

- This is not an index gap; it is a query-volume pattern from [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L178).
- Severity: `Medium`

## N+1 Assessment

Objective result for the five measured flows:

- Load main page -> `No`
- View a document -> `No`
- List issues -> `No`
- Load sprint board -> `No`
- Search content -> `No`

What I did find instead:

- redundant screen-level query duplication on the sprint board
- repeated auxiliary preloads (`/api/projects`, `/api/team/people`) on screens where that data is not always immediately needed
- correlated subqueries inside the projects route, which are expensive but not a classic app-level N+1

Positive evidence of deliberate N+1 avoidance:

- [api/src/utils/document-crud.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/utils/document-crud.ts#L148) batches issue associations
- [api/src/routes/weeks.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/weeks.ts#L1872) batch-loads issue references for standups before transforming content

## Highest-Impact Weaknesses

### 1. Sprint board query fan-out is too high

Severity: `High`

- `31` SQL queries for one board screen
- root cause is screen composition and duplicate issue fetches, not one broken SQL statement

### 2. Projects list is an expensive shared dependency

Severity: `High`

- it was the slowest business query in three separate flows
- it runs even when the user is not on a dedicated projects screen

### 3. Command palette search scales poorly

Severity: `Medium`

- it loads all visible documents instead of searching on the server
- current runtime is fine only because the dataset is still relatively small

### 4. Middleware query overhead is material in every flow

Severity: `Medium`

- session lookup and `last_activity` updates add fixed DB work to every authenticated request

## Notes

- No application code was modified for this audit.
- Logging was temporarily enabled to capture PostgreSQL statement timings for the measured flows.
- Raw evidence is preserved in [db-query-flow-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/db-query-flow-baseline.json).
