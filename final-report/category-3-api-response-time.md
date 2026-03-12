# Category 3: API Response Time

## Result

- Improvement target met: `Yes`
- Strategy used: `Reduce fixed auth overhead on protected reads, remove the issue-list association round-trip, and add targeted indexes for the measured read paths`
- Primary passing metrics:
  - `GET /api/issues?sprint_id={id}` P95 `19.00 ms -> 14.32 ms`
  - `GET /api/documents/:id` P95 `18.09 ms -> 13.58 ms`
- P95 improvement on both passing endpoints: `24%+`
- Supporting improvement: `GET /api/dashboard/my-week` P95 `24.08 ms -> 20.48 ms` (`15.0%`)

## Demo Talking Point

Category 3 was about cutting real request latency on live authenticated endpoints, not inventing synthetic microbenchmarks. We seeded the local database above the assignment threshold, benchmarked the same five frontend-driven endpoints from an untouched `origin/main` baseline, and then removed repeated auth and association work from the hot read paths. The passing result came from two endpoints clearing the `20%` P95 target under the same warmed-up `25`-connection load: `GET /api/issues?sprint_id={id}` dropped from `19.00 ms` to `14.32 ms`, and `GET /api/documents/:id` dropped from `18.09 ms` to `13.58 ms`.

## Simple Overview

Before this change, several protected API reads were still doing small but repeated bits of database work that added up under load.

After this change, the server reuses auth context more efficiently, the sprint issue list returns association metadata in the main query, and the database has indexes that match the exact issue-board and title-search patterns we benchmarked.

| Endpoint | Before P95 | After P95 | What it means |
| --- | ---: | ---: | --- |
| `GET /api/issues?sprint_id={id}` | `19.00 ms` | `14.32 ms` | the sprint board list got rid of an extra association fetch and now benefits from a matching issue sort index |
| `GET /api/documents/:id` | `18.09 ms` | `13.58 ms` | document loads improved because every protected request now pays less auth overhead up front |
| `GET /api/dashboard/my-week` | `24.08 ms` | `20.48 ms` | the dashboard got faster too, but not enough to count toward the category threshold |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](../stage-2/category-3-api-response-time/benchmark-commands.txt).

### Saved artifacts

- [dataset.json](../stage-2/category-3-api-response-time/dataset.json)
- [before-benchmark.json](../stage-2/category-3-api-response-time/before-benchmark.json)
- [after-benchmark.json](../stage-2/category-3-api-response-time/after-benchmark.json)
- [api-vitest-after.json](../stage-2/category-3-api-response-time/api-vitest-after.json)
- [summary.json](../stage-2/category-3-api-response-time/summary.json)

## Before / After

The primary comparison below uses the warmed-up `25`-connection run:

- same MacBook
- same local Postgres database
- same benchmark sprint ID and document ID
- `60` measured requests per endpoint
- `5` warmup requests before each concurrency tier

| Endpoint | Before P50 | Before P95 | Before P99 | After P50 | After P95 | After P99 | P95 Improvement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /api/auth/me` | `10.58 ms` | `20.30 ms` | `25.55 ms` | `12.53 ms` | `23.42 ms` | `27.34 ms` | `-15.4%` |
| `GET /api/dashboard/my-week` | `20.04 ms` | `24.08 ms` | `24.66 ms` | `17.79 ms` | `20.48 ms` | `21.35 ms` | `15.0%` |
| `GET /api/issues?sprint_id={id}` | `13.43 ms` | `19.00 ms` | `19.87 ms` | `9.66 ms` | `14.32 ms` | `15.06 ms` | `24.6%` |
| `GET /api/documents/:id` | `11.75 ms` | `18.09 ms` | `19.12 ms` | `7.56 ms` | `13.58 ms` | `13.98 ms` | `24.9%` |
| `GET /api/search/mentions?q=dev` | `8.96 ms` | `12.98 ms` | `13.20 ms` | `9.06 ms` | `13.16 ms` | `14.70 ms` | `-1.4%` |

## What Changed

### 1. Auth now verifies workspace access in the session lookup itself

Files:

- [auth.ts](../api/src/middleware/auth.ts)
- [auth.test.ts](../api/src/__tests__/auth.test.ts)

What changed:

- Extended the session validation query to join `workspace_memberships` directly and attach the current workspace role to the request.
- Removed the follow-up membership lookup that used to run on every non-super-admin authenticated request.

Why the original code was suboptimal:

- Protected read endpoints were paying a fixed two-step auth cost before route-specific logic started.
- Endpoints like `GET /api/documents/:id` are especially sensitive to that baseline overhead because the route work itself is relatively small.

Why this is better:

- The document load benchmark improved from `18.09 ms` to `13.58 ms` at P95 under the same `25`-connection comparison.
- The same auth improvement also contributed to the dashboard and issue-list wins.

Tradeoffs:

- The auth query is slightly wider because it now carries the workspace role in the same round-trip.
- That is still a net win because it removes an entire database trip from the protected read path.

### 2. Sprint issue list now returns `belongs_to` in the main query

Files:

- [issues.ts](../api/src/routes/issues.ts)

What changed:

- Reused the role already verified by auth on the benchmarked issue-list path.
- Replaced the second association-hydration round-trip with a lateral aggregate that returns `belongs_to` directly in the main issue-list query.

Why the original code was suboptimal:

- `GET /api/issues?sprint_id={id}` executed the issue list query and then immediately executed another query to decorate the same rows with association metadata.
- That second trip showed up directly in the sprint-board latency profile.

Why this is better:

- The issue-list benchmark improved from `19.00 ms` to `14.32 ms` at P95.
- That clears the category threshold with a `24.6%` reduction under identical warmed-up load.

Tradeoffs:

- The SQL is more complex because the response now comes back pre-aggregated.
- That tradeoff is justified because this is a hot user-facing read path and the benchmark proved the extra round-trip mattered.

### 3. Added targeted indexes for title search and issue-board ordering

Files:

- [039_api_response_time_indexes.sql](../api/src/db/migrations/039_api_response_time_indexes.sql)

What changed:

- Added a trigram GIN index for active document titles.
- Added a partial expression index for active issues ordered by the same derived priority ranking the issue board uses.

Why the original code was suboptimal:

- Mention search relies on substring matching (`ILIKE '%...%'`), which is the classic case for trigram indexing.
- The issue board sorts active issues by derived priority rank and `updated_at`, which previously had no tailored index.

Why this is better:

- The issue list picked up additional P95 improvement once the new index was applied for the after-state benchmark.
- The title-search index is now available for the real mention-search access pattern even though that endpoint did not become one of the two passing metrics on this run.

Tradeoffs:

- Matching document writes now maintain extra indexes.
- That is acceptable because these are read-heavy, latency-sensitive endpoints and the category specifically measures response time under load.

## Verification

### API type-check

```bash
# from repo root
pnpm --filter @ship/api type-check
```

Result: passed

### Full API suite

```bash
# from repo root
export DATABASE_URL="$(awk -F= '/^DATABASE_URL=/{print $2}' api/.env.local)"
pnpm --filter @ship/api exec vitest run --reporter=json --outputFile ../stage-2/category-3-api-response-time/api-vitest-after.json
```

Result: passed

- Test files: `28/28`
- Tests: `451/451`

## Notes

- The before benchmark was captured from a temporary worktree at `origin/main`.
- The local benchmark dataset was topped up to `32` users, `550` documents, `104` issues, and `35` sprints before either benchmark run.
- The stable benchmark harness used [api-performance-login.mjs](../benchmarks/api-performance-login.mjs) to write a raw cookie header file because curl cookie jars were inconsistent across repeated local runs.
- The final passing threshold was met on `GET /api/issues?sprint_id={id}` and `GET /api/documents/:id`.
- `GET /api/dashboard/my-week` improved materially but did not reach the `20%` threshold, and `GET /api/auth/me` / `GET /api/search/mentions?q=dev` were not counted as passing metrics.
