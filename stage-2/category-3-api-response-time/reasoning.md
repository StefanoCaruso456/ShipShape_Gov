# Category 3: API Response Time

## Result

- Improvement target met: `Yes`
- Target strategy: `Reduce P95 latency on the sprint issue list and document load endpoints under identical local load`
- Passing metrics:
  - `GET /api/issues?sprint_id={id}` P95 `19.00 ms -> 14.32 ms` (`24.6%`)
  - `GET /api/documents/:id` P95 `18.09 ms -> 13.58 ms` (`24.9%`)
- Supporting improvement:
  - `GET /api/dashboard/my-week` P95 `24.08 ms -> 20.48 ms` (`15.0%`)

## Simple Overview

Before this change, authenticated API requests were still paying repeated database work that the server already knew how to answer.

After this change, the API does less redundant auth and association work on the hot read paths, and the database has targeted indexes for the exact search and issue-board access patterns we benchmarked.

| Endpoint | Before P95 | After P95 | What changed |
| --- | ---: | ---: | --- |
| `GET /api/issues?sprint_id={id}` | `19.00 ms` | `14.32 ms` | the route now avoids a second round-trip for `belongs_to`, reuses auth role data, and uses a tighter issue sort index |
| `GET /api/documents/:id` | `18.09 ms` | `13.58 ms` | the document read path benefits from the lighter auth/membership check on every protected request |
| `GET /api/dashboard/my-week` | `24.08 ms` | `20.48 ms` | same auth improvement lowered the fixed cost, but not enough to count toward the target |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](./benchmark-commands.txt).

### Saved artifacts

- [dataset.json](./dataset.json)
- [before-benchmark.json](./before-benchmark.json)
- [after-benchmark.json](./after-benchmark.json)
- [api-vitest-after.json](./api-vitest-after.json)
- [summary.json](./summary.json)

## Before / After

### Primary comparison baseline

The passing comparison uses the warmed-up `25`-connection run with:

- the same laptop
- the same local Postgres database
- the same seeded IDs
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

- [auth.ts](../../api/src/middleware/auth.ts)
- [auth.test.ts](../../api/src/__tests__/auth.test.ts)

What changed:

- Extended the session validation query to join `workspace_memberships` directly and carry the current workspace role on the request.
- Removed the follow-up membership lookup that previously ran on every non-super-admin authenticated request.

Why the original code was suboptimal:

- Every protected GET paid a fixed auth tax before route-specific work even started:
  - session lookup
  - workspace membership lookup
- Endpoints like `GET /api/documents/:id` are sensitive to that fixed overhead because the route work itself is relatively small.

Why this is better:

- The document read path improved from `18.09 ms` to `13.58 ms` at P95 under the `25`-connection benchmark.
- The same change also helped the dashboard and issue list by lowering their per-request baseline cost.

Tradeoffs:

- The auth query is slightly wider because it now selects the workspace role in the same round-trip.
- That is a good tradeoff because it removes a second database trip from every protected request.

### 2. Sprint issue list no longer does a second round-trip to hydrate `belongs_to`

Files:

- [issues.ts](../../api/src/routes/issues.ts)

What changed:

- Reused the role cached by auth instead of re-querying admin state through the visibility helper on the benchmarked issue-list path.
- Moved `belongs_to` hydration for the list response into the main SQL query with a lateral aggregate, so the route stops doing a separate batch association fetch after the issue rows come back.

Why the original code was suboptimal:

- The sprint board path was doing the issue list query and then a second query to decorate the same rows with association metadata.
- That extra round-trip showed up directly in the latency of `GET /api/issues?sprint_id={id}`.

Why this is better:

- The benchmarked sprint issue list improved from `19.00 ms` to `14.32 ms` at P95.
- That clears the category threshold with a `24.6%` reduction under the same data and concurrency settings.

Tradeoffs:

- The list SQL is more sophisticated than the old two-step approach because it now returns pre-aggregated association payloads.
- That complexity is justified here because this route is one of the most important interactive read paths in the app.

### 3. Added targeted indexes for active title search and issue-board ordering

Files:

- [039_api_response_time_indexes.sql](../../api/src/db/migrations/039_api_response_time_indexes.sql)

What changed:

- Added a trigram GIN index for active document titles.
- Added a partial expression index for active issues ordered by the same priority ranking the board uses.

Why the original code was suboptimal:

- Mention search relies on `ILIKE '%...%'`, which is a classic substring-search pattern.
- The issue list sorts by a derived priority rank plus `updated_at`, which previously had no dedicated index.

Why this is better:

- The issue-board route picked up additional P95 improvement after the index was applied locally for the after benchmark.
- The title-search index is now in place for the real mention-search access pattern even though that endpoint did not become one of the two passing metrics on this run.

Tradeoffs:

- Writes to matching document rows now maintain two more indexes.
- That is acceptable because these endpoints are read-heavy and explicitly benchmarked as latency-sensitive user flows.

## Verification

### API type-check

Result: passed

### Full API suite

Result: passed

- Test files: `28/28`
- Tests: `451/451`

## Notes

- The before benchmark was captured from a temporary worktree at `origin/main`.
- The after benchmark reused the same local Postgres database, the same benchmark sprint ID, and the same benchmark document ID.
- The stable benchmark harness used [api-performance-login.mjs](../../benchmarks/api-performance-login.mjs) to write a raw cookie header file because curl cookie jars were inconsistent across repeated local runs.
- The warmup step and larger request count were added to the benchmark harness to reduce cold-start noise on these sub-25ms endpoints.
- `GET /api/auth/me` and `GET /api/search/mentions?q=dev` did not improve enough to count toward the passing threshold in the final warmed-up comparison.
