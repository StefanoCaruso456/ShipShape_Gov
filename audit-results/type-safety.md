# Type Safety Baseline

Date: 2026-03-09

Scope:

- `web/src`
- `api/src`
- `shared/src`

This is a baseline audit only. No type-safety fixes were applied as part of this step.

## How It Was Measured

Tools and commands:

- Checked compiler settings in `tsconfig.json`
- Ran the workspace type check under the repo's configured settings:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --recursive run type-check
```

- Ran a regex-based static analysis over `.ts` and `.tsx` files in `web/src`, `api/src`, and `shared/src` to count:
  - explicit `any`
  - type assertions with `as`
  - non-null assertions `!`
  - `@ts-ignore`
  - `@ts-expect-error`

Methodology notes:

- The static counts are token-pattern baselines, not semantic AST classification.
- The `as` count includes all type assertions, including lower-risk patterns like `as const`.
- Missing return types and implicit-any issues were checked indirectly via the strict compiler run. Because strict mode is enabled and the recursive type-check passed, there is no current compiler-reported baseline of strict-mode failures.

## Baseline Numbers

| Metric | Baseline |
| --- | ---: |
| Total `any` types | 346 |
| Total type assertions (`as`) | 1,500 |
| Total non-null assertions (`!`) | 348 |
| Total `@ts-ignore` / `@ts-expect-error` | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |

Tracked total across these categories: `2,195`

## Breakdown By Package

| Package | `any` | `as` | `!` | `@ts-ignore` | `@ts-expect-error` | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `api/` | 278 | 1,053 | 306 | 0 | 0 | 1,637 |
| `web/` | 67 | 442 | 42 | 0 | 1 | 552 |
| `shared/` | 1 | 5 | 0 | 0 | 0 | 6 |

Package concentration:

- `api/` holds about `74.6%` of the tracked violations
- `web/` holds about `25.1%`
- `shared/` is effectively clean at `0.3%`

Violation concentration:

- type assertions (`as`) are the dominant category at about `68.3%`
- non-null assertions (`!`) are about `15.9%`
- explicit `any` is about `15.8%`

## Top 5 Violation-Dense Files

| File | Total | `any` | `as` | `!` | Why It Is Problematic |
| --- | ---: | ---: | ---: | ---: | --- |
| `api/src/routes/weeks.ts` | 216 | 11 | 157 | 48 | Heavy request/query casting and row-shape assumptions around sprint/week workflows. Example patterns include `req.query.user_id as string` and `extractSprintFromRow(row: any)` in `api/src/routes/weeks.ts:91`, `api/src/routes/weeks.ts:123`, and `api/src/routes/weeks.ts:186`. |
| `api/src/routes/team.ts` | 171 | 2 | 141 | 28 | Team grid logic depends on many casted query params and loosely typed SQL rows. The route builds nested association maps from dynamic result shapes and frequently casts request data, for example `req.query.fromSprint as string` in `api/src/routes/team.ts:79`. |
| `api/src/routes/projects.ts` | 106 | 19 | 61 | 26 | Project routes rely on `row: any`, `projectData: any`, and broad content objects while mixing JSONB properties with computed response shapes. Representative examples are `extractProjectFromRow(row: any)` in `api/src/routes/projects.ts:18` and `generatePrefilledRetroContent(projectData: any, sprints: any[], issues: any[])` in `api/src/routes/projects.ts:123`. |
| `api/src/routes/claude.ts` | 79 | 3 | 76 | 0 | This file is dominated by broad query/request casting for AI context assembly. The most obvious example is `req.query as unknown as ClaudeContextRequest` in `api/src/routes/claude.ts:62`, which bypasses safer request validation. |
| `api/src/routes/issues.ts` | 78 | 5 | 36 | 37 | Issue routes combine dynamic request input, SQL rows, and repeated non-null assumptions on request auth context like `req.workspaceId!` / `req.userId!`, especially in create/update handlers such as `api/src/routes/issues.ts:563`. |

## Specific Weaknesses And Opportunities

### 1. API route layer is the dominant type-safety hotspot

Severity: High

Why:

- The API package contains nearly three quarters of the tracked violations.
- The worst files are route handlers, not isolated adapters or test code.
- These routes sit at trust boundaries: request params, auth context, SQL rows, and JSONB payloads all meet here.

Likely impact:

- runtime bugs from malformed request data
- response-shape drift between frontend and backend
- fragile refactors because route code relies on casts instead of validated shapes

### 2. Type assertions are being used as a primary escape hatch

Severity: High

Why:

- `1,500` `as` assertions is the largest category by far.
- The densest files use casting to bridge query params, database rows, and dynamic properties rather than modeling those boundaries explicitly.

Likely impact:

- hides incorrect assumptions from the compiler
- makes "strict mode enabled" less meaningful in practice
- increases the chance of subtle bugs surviving code review

### 3. Non-null assertions are concentrated around auth and request context

Severity: Medium

Why:

- `348` non-null assertions is materially high.
- Common patterns include `req.userId!` and `req.workspaceId!` after middleware, which assumes every protected route is wired correctly.

Likely impact:

- a missing middleware or route reordering bug becomes a runtime crash instead of a compile-time failure
- makes handler preconditions harder to reason about

### 4. Explicit `any` still exists in core data-shaping helpers

Severity: Medium

Why:

- `346` explicit `any` usages remain.
- Some are in core row extractors and content builders, which means type information is lost before responses are shaped.

Likely impact:

- weakens contract safety at exactly the places that convert database output into API payloads
- increases regression risk when schema fields evolve

### 5. Shared contracts are relatively clean; the problem is concentrated at dynamic boundaries

Severity: Low, but strategically important

Why:

- `shared/` only shows `6` tracked violations total.
- That suggests the codebase already has a reasonable place for stronger shared contracts, but the API route layer is not leveraging it consistently enough.

Likely impact:

- improvement work should focus on request validation, DB row typing, and route helpers first, not on `shared/`

## Strict Mode Result

`tsconfig.json` has:

- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"noImplicitReturns": true`

The recursive workspace type-check completed successfully under those settings:

- `shared`: pass
- `api`: pass
- `web`: pass

Interpretation:

- there is no current compiler-reported strict-mode failure baseline
- the main type-safety weakness is not "strict mode is off"
- the main weakness is that the codebase uses many casts and assertions inside a strict project

## Audit Deliverable Summary

| Metric | Your Baseline |
| --- | --- |
| Total any types | 346 |
| Total type assertions (`as`) | 1,500 |
| Total non-null assertions (`!`) | 348 |
| Total `@ts-ignore` / `@ts-expect-error` | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |
| Top 5 violation-dense files | `api/src/routes/weeks.ts` (216), `api/src/routes/team.ts` (171), `api/src/routes/projects.ts` (106), `api/src/routes/claude.ts` (79), `api/src/routes/issues.ts` (78) |

