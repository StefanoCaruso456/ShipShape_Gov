# Category 1: Type Safety

## Result

- Baseline violations: `1292`
- Final violations: `883`
- Reduction: `409`
- Improvement: `31.7%`
- Threshold met: `Yes` (`25%` required)
- `strict` mode enabled: `Yes`

## Plain-Language Summary

Before this pass, the API and many tests were using TypeScript, but they were also bypassing it too often. The main problems were:

- route handlers were using `req.userId!` and `req.workspaceId!` to force TypeScript to trust that auth values existed
- some request inputs were cast into the expected shape instead of being validated
- some response types claimed values were always strings even when runtime data could be `null`
- dense test files were using `as any` and `as unknown as` so often that the compiler could not meaningfully verify the mocks

The result was that TypeScript was present, but a large part of the API surface was still relying on "trust me" patterns instead of real proof.

This improvement made the types more honest and more useful:

- authenticated routes now go through `getAuthContext(req, res)`, which either returns a checked auth object or exits with `401`
- query parameters in `search.ts` are now validated with `zod` instead of being cast optimistically
- nullable runtime values stay nullable in the response types instead of being forced into incorrect string types
- repeated unsafe test mocks were replaced with typed helpers so tests better match the real request and database contracts

Why this is better:

- the compiler now verifies more of the real API contract instead of being silenced by `!`, `as`, and `any`
- authentication preconditions are explicit and reusable instead of duplicated and assumed
- malformed input is rejected at the boundary instead of leaking deeper into the handler
- tests are closer to production behavior, so they are a better safety net

The measurable outcome was a reduction from `1292` to `883` total violations, with most of the gain coming from the `api/` package. The biggest single improvement was removing unsafe non-null assertions, which dropped from `329` to `117`.

## Concrete Before / After Examples

| Before | After | What was wrong | How it was fixed |
| --- | --- | --- | --- |
| `const workspaceId = req.workspaceId!;` | `const authContext = getAuthContext(req, res); if (!authContext) return; const { workspaceId } = authContext;` | `!` forced TypeScript to trust auth existed. | The route now proves auth first. |
| `const userId = req.userId!;` | `const { userId } = authContext;` | The handler assumed auth instead of checking it. | It now uses the checked auth context. |
| `const searchQuery = (req.query.q as string) || '';` | `const queryParsed = mentionQuerySchema.safeParse(req.query);` | Untrusted input was cast into shape. | Query params are now validated with `zod`. |
| `const programId = req.query.program_id as string \| undefined;` | `const { program_id: programId } = queryParsed.data;` | The query param was assumed valid without proof. | Parsing now creates a real typed value. |
| `const limit = Math.min(parseInt(req.query.limit as string) \|\| 10, 50);` | `limit: z.coerce.number().int().min(1).max(50).optional().default(10)` | Manual coercion plus unsafe cast weakened the boundary. | The route now validates numeric input and bounds. |
| `actorUserId: req.userId!` | `actorUserId: req.userId ?? null` | The code claimed user ID always existed even when nullable actors were allowed. | The audit-log call now matches the real nullable contract. |
| `role: null as unknown as string` | `role: null` | The type lied about a runtime `null` value. | The response type now allows `null`. |
| `joinedAt: null as unknown as string` | `joinedAt: null` | Same problem: runtime data and declared type disagreed. | The response contract now reflects reality. |
| `const req = { cookies } as unknown as Request;` | `const req = createMockRequest({ cookies });` | The test mock bypassed Express typing. | Tests now use a typed request helper. |
| `vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);` | `vi.mocked(pool.query).mockResolvedValueOnce(queryResponse({ rows: [], rowCount: 0 }));` | `any` disabled DB result typing in tests. | Tests now use a typed query-result helper. |

## Reproducible Proof

### Measurement command

```bash
node benchmarks/type-safety-audit.mjs .
```

### Saved artifacts

- `benchmarks/type-safety-baseline.json`
- `benchmarks/type-safety-after.json`

## Before / After

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `any` | 271 | 176 | -95 |
| `as` | 691 | 589 | -102 |
| non-null assertions (`!`) | 329 | 117 | -212 |
| `@ts-ignore` | 0 | 0 | 0 |
| `@ts-expect-error` | 1 | 1 | 0 |
| Total | 1292 | 883 | -409 |

### Package breakdown

| Package | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `api` | 851 | 442 | -409 |
| `web` | 439 | 439 | 0 |
| `shared` | 2 | 2 | 0 |

## What Changed

### 1. Centralized authenticated request narrowing

Files:

- `api/src/middleware/auth.ts`
- `api/src/routes/accountability.ts`
- `api/src/routes/backlinks.ts`
- `api/src/routes/dashboard.ts`
- `api/src/routes/documents.ts`
- `api/src/routes/issues.ts`
- `api/src/routes/iterations.ts`
- `api/src/routes/programs.ts`
- `api/src/routes/projects.ts`
- `api/src/routes/standups.ts`
- `api/src/routes/team.ts`
- `api/src/routes/weeks.ts`
- `api/src/routes/activity.ts`
- `api/src/routes/comments.ts`
- `api/src/routes/ai.ts`
- `api/src/routes/search.ts`

What changed:

- Added `getAuthContext(req, res)` to convert optional request auth fields into a checked `AuthContext`.
- Replaced repeated `req.userId!` and `req.workspaceId!` usage in route handlers with the narrowed context.

Why the original code was suboptimal:

- Route handlers relied on non-null assertions to bypass the compiler instead of proving the request was authenticated at the point of use.
- That made the type system blind to real request preconditions and encouraged copy-pasted unsafe access patterns.

Why this is better:

- The auth boundary is now explicit and reusable.
- Each handler either exits early with a consistent `401` or gets a real typed auth object.
- The compiler now tracks the authenticated shape instead of being silenced by `!`.

Tradeoffs:

- Routes are slightly more verbose because they opt into the helper explicitly.
- Tests that mock the auth module also had to expose `getAuthContext`, which is the correct contract after this change.

### 2. Removed nullable-user audit-log assertions and ad hoc route casts

Files:

- `api/src/routes/admin.ts`
- `api/src/routes/admin-credentials.ts`
- `api/src/routes/api-tokens.ts`
- `api/src/routes/auth.ts`
- `api/src/routes/workspaces.ts`
- `api/src/routes/search.ts`

What changed:

- Replaced `actorUserId: req.userId!` with `actorUserId: req.userId ?? null` where audit logging already accepts nullable actors.
- Replaced `any[]` placeholders in auth responses with precise empty-tuple types where the value is intentionally always empty.
- Added `zod`-based query parsing in `search.ts` so `q`, `program_id`, and `limit` are validated instead of cast.
- Replaced impossible `null as unknown as string` placeholders in workspace member responses with a response type that allows `null`.

Why the original code was suboptimal:

- The code asserted values that were already modeled as optional downstream.
- Query parameters were cast instead of validated, which weakens the API boundary and hides bad input from the compiler.
- Some response fields lied about their nullability just to satisfy TypeScript.

Why this is better:

- Types now reflect the actual runtime contract: nullable audit actors stay nullable, and archived workspace members can really have `null` role/join date values.
- Query parsing now matches the request validation pattern already used elsewhere in the API.

Tradeoffs:

- `search.ts` now returns `400` for malformed query payloads instead of coercing everything optimistically.

### 3. Replaced high-volume loose test mocks with typed helpers

Files:

- `api/src/test/query-result.ts`
- `api/src/test/express-mocks.ts`
- `api/src/__tests__/auth.test.ts`
- `api/src/__tests__/transformIssueLinks.test.ts`
- `api/src/services/accountability.test.ts`
- `api/src/__tests__/activity.test.ts`
- `api/src/routes/projects.test.ts`
- `api/src/routes/issues-history.test.ts`
- `api/src/routes/iterations.test.ts`

What changed:

- Added typed helpers for mocked Postgres query results and Express request/response objects.
- Replaced repeated `as any`/`as unknown as` patterns in dense test files with reusable helpers and small runtime guards.
- Updated route-test auth mocks so they expose `getAuthContext` alongside `authMiddleware`.

Why the original code was suboptimal:

- The tests were opting out of type checking at almost every database and request boundary.
- That made the compiler useless in the exact places where test fixtures should mirror production contracts.

Why this is better:

- The tests now model the same request/auth/query shapes the runtime uses.
- The new helper functions concentrate the unavoidable mock shims into a small surface area instead of duplicating assertions across dozens of tests.
- Updating route-test auth mocks keeps the tests aligned with the new middleware contract.

Tradeoffs:

- The test helpers still use a narrow amount of assertion-based bridging because Express/Vitest mocks are not full framework objects.
- That small boundary is deliberate; it is much smaller and more maintainable than the previous repeated `any` usage.

## Remaining Highest-Density Files

The top remaining files after this pass are:

1. `api/src/__tests__/activity.test.ts` (`49`)
2. `api/src/routes/weeks.ts` (`41`)
3. `api/src/routes/issues-history.test.ts` (`40`)
4. `web/src/pages/UnifiedDocumentPage.tsx` (`37`)
5. `api/src/db/seed.ts` (`35`)

Why they still matter:

- `weeks.ts` is still a large API surface with mixed request parsing and document-shape transformations.
- `UnifiedDocumentPage.tsx` and other editor-heavy web files still carry many narrowing/cast hot spots.
- `seed.ts` still relies on non-null assertions around setup assumptions.
- The remaining dense tests still contain mock-heavy setup that can be tightened in later passes.

## Verification

### Type check

```bash
cd api
../node_modules/.bin/tsc --noEmit
```

Result: passed

### API tests

```bash
cd api
DATABASE_URL='postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev' ../node_modules/.bin/vitest run
```

Result: passed

- Test files: `28/28`
- Tests: `451/451`

## Notes

- Full-suite testing required a local Postgres container from `docker-compose.local.yml`.
- The unrelated deleted file `final-report/final-audit.pdf` was not part of this Category 1 work and should stay out of the commit.
