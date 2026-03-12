# Category 4: Database Query Efficiency

## Result

- Improvement target met: `Yes`
- Strategy used: `Reduce total query count on the sprint-board flow by eliminating redundant session writes and tightening the repeated projects query`
- Primary passing metric: `Load sprint board` query count dropped from `32` to `25`
- Query-count improvement: `21.9%`
- Alternate EXPLAIN improvement on the repeated projects query: `1.214 ms -> 1.021 ms` (`15.9%`)

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](../stage-2/category-4-database-query-efficiency/benchmark-commands.txt).

### Saved artifacts

- [before-flow.json](../stage-2/category-4-database-query-efficiency/before-flow.json)
- [after-flow.json](../stage-2/category-4-database-query-efficiency/after-flow.json)
- [explain-projects-before.txt](../stage-2/category-4-database-query-efficiency/explain-projects-before.txt)
- [explain-projects-after.txt](../stage-2/category-4-database-query-efficiency/explain-projects-after.txt)
- [summary.json](../stage-2/category-4-database-query-efficiency/summary.json)
- [api-vitest-after.json](../stage-2/category-4-database-query-efficiency/api-vitest-after.json)

## Before / After

| User Flow | Before Queries | After Queries | Delta | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Load main page | `14` | `12` | `-2` | `14.3%` |
| View a document | `16` | `12` | `-4` | `25.0%` |
| List issues | `13` | `10` | `-3` | `23.1%` |
| Load sprint board | `32` | `25` | `-7` | `21.9%` |
| Search content | `4` | `3` | `-1` | `25.0%` |

### Repeated `/api/projects` query timing

| Flow | Before | After | Delta |
| --- | ---: | ---: | ---: |
| View a document | `0.923 ms` | `0.490 ms` | `-0.433 ms` |
| List issues | `1.058 ms` | `0.597 ms` | `-0.461 ms` |

### EXPLAIN ANALYZE

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Projects query execution time | `1.214 ms` | `1.021 ms` | `-0.193 ms` |

## What Changed

### 1. Throttled session `last_activity` writes in `authMiddleware`

Files:

- [auth.ts](../api/src/middleware/auth.ts)
- [auth.test.ts](../api/src/__tests__/auth.test.ts)

What changed:

- The API no longer updates `sessions.last_activity` on every authenticated request.
- It now writes `last_activity` only when the request arrives more than `60` seconds after the last recorded activity.
- The auth tests now reset queued mock responses between cases so the verification suite reflects the new behavior accurately.

Why the original code was suboptimal:

- Multi-request screens like the sprint board were paying one extra `UPDATE sessions ...` query for every API request in the same burst.
- That made query counts look worse on every flow without adding meaningful new information to the session timeout logic.

Why this is better:

- The sprint-board flow dropped by `7` queries largely because those repeated session writes disappeared.
- The timeout semantics are still enforced from the stored `last_activity` value, but the database no longer does unnecessary churn inside a sub-minute burst of requests.

Tradeoffs:

- `last_activity` can lag real user activity by up to `60` seconds.
- That is acceptable against a `15` minute inactivity timeout, but it is still a deliberate precision tradeoff in exchange for fewer writes.

### 2. Rewrote the projects list query to aggregate once instead of per project row

Files:

- [projects.ts](../api/src/routes/projects.ts)
- [explain-projects-optimized.sql](../benchmarks/explain-projects-optimized.sql)

What changed:

- The list route now builds a `visible_projects` CTE once, then joins two grouped aggregates:
  - relationship counts for issues and sprints
  - sprint allocation status by project
- This replaces the old correlated subqueries that recalculated counts and inferred status per project row.

Why the original code was suboptimal:

- The baseline plan showed `SubPlan` and `Memoize` loops repeating project-related work for each returned row.
- The same expensive `/api/projects` query showed up in multiple flows: document view, issues list, and sprint board.

Why this is better:

- The repeated `/api/projects` statement got materially faster in the flows where it mattered most:
  - `0.923 -> 0.490 ms` in document view
  - `1.058 -> 0.597 ms` in issues list
- The plan is structurally better because the route now aggregates once and joins the results instead of nesting repeated per-project lookups.

Tradeoffs:

- The SQL is more complex than the original correlated-subquery version.
- That complexity is justified here because the route is reused across several important screens and was already a measured hotspot.

### 3. Added a targeted sprint-project lookup index

Files:

- [038_project_query_efficiency.sql](../api/src/db/migrations/038_project_query_efficiency.sql)
- [schema.sql](../api/src/db/schema.sql)

What changed:

- Added `idx_documents_sprint_project_lookup` on `(workspace_id, properties->>'project_id')` for sprint documents that actually carry assignee allocations.

Why the original code was suboptimal:

- Sprint allocation lookups for inferred project status were scanning sprint documents repeatedly.
- The audit had already identified the missing project-allocation index as a real gap.

Why this is better:

- The optimized plan now uses the dedicated sprint-project lookup index for the grouped sprint-status aggregate.
- That keeps the new aggregate plan aligned to the actual filter shape used by the route.

Tradeoffs:

- Inserts and updates to matching sprint rows pay the maintenance cost of one more index.
- This is acceptable because the list route is read-heavy and used across multiple pages.

## Verification

### API type-check

```bash
# from repo root
cd api
../node_modules/.bin/tsc --noEmit
```

Result: passed

### Full API suite

```bash
# from repo root
cd api
DATABASE_URL='postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev' ../node_modules/.bin/vitest run --reporter=json --outputFile ../stage-2/category-4-database-query-efficiency/api-vitest-after.json
```

Result: passed

- Test files: `204/204`
- Tests: `451/451`

## Notes

- The before benchmark was captured from a temporary worktree at the pre-Category-4 commit so the baseline reflects the untouched code.
- The after benchmark reused the same Docker Compose project name and database volume so both measurements hit the same seeded data and IDs.
- The improvement target was met on total query count, not on the alternate `50%` slow-query threshold.
