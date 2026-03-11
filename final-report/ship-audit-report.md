# Ship Audit Report

Date: 2026-03-10

This report consolidates the orientation findings from the repository walkthrough and the seven required audit categories into one baseline document.

Source inputs:

- orientation and architecture docs in `artifacts-documentation/`
- measured audit baselines in `audit-results/`
- raw evidence in `benchmarks/`

This report is baseline-first. It documents how the system works, what was measured, what the baseline numbers are, and where the main risks are before broad remediation work.

## Executive Summary

Ship has a strong architectural core:

- one monorepo with a clear `web/` + `api/` + `shared/` split
- one unified document model centered on `documents`
- one contained realtime collaboration path based on Yjs and WebSockets

The strongest product idea in the codebase is that docs, issues, projects, weeks, and related artifacts are all different views on one shared document graph. That makes the system coherent, but it also creates the main technical pressure points: relationship consistency, query complexity, and collaboration-state coordination.

The baseline audit shows a mixed picture:

- type safety is structurally strong because strict mode is on, but API routes rely heavily on assertions and casts
- frontend bundle size is large because the main app chunk is oversized
- sampled API latency is acceptable locally, but graph-heavy flows are the likely scaling bottlenecks
- database query cost is manageable now, but relationship-heavy flows are query-dense
- tests are meaningful but not yet a fully reliable safety net
- runtime error handling has real user-facing recovery gaps
- accessibility scores are often high, but there are still serious violations and incomplete assistive-technology coverage

If I had to prioritize one improvement area first, I would start with relationship consolidation around the unified document model. It affects correctness, query shape, feature complexity, and future maintainability more than any other single issue.

## 1. System Orientation

### 1.1 System Shape

Ship is a unified-document monolith.

- `web/` is the React + Vite frontend
- `api/` is the Express + TypeScript backend
- `shared/` is the common contract layer for shared types, enums, constants, and small helpers

Runtime interaction:

- `web/` talks to `api/` over REST for normal application data
- `web/` opens WebSocket connections to collaboration and event endpoints for realtime features
- `web/` and `api/` both import `shared/` at build and type-check time so they stay aligned on the same data shapes and business rules

This is the clearest high-level mental model of the codebase:

**one frontend, one backend, one shared contract package, and one central document graph**

### 1.2 Core Data Model

The database is centered on one `documents` table.

Instead of separate main tables for issues, projects, weeks, wiki pages, and other work objects, Ship stores them all as document rows and distinguishes them with `document_type`.

`document_type` is the discriminator column. Queries use it to filter the shared `documents` table down to the subset for issues, projects, docs, sprints, or other entity types.

That means the system is best understood as:

**one shared table, filtered into different entity subsets by query**

### 1.3 Relationship Model

Document relationships are handled in three layers:

- `parent_id` for true parent-child hierarchy
- `document_associations` for organizational membership like program, project, and sprint
- `document_links` for explicit cross-document linking and backlinks

This layered model is powerful, but it is also one of the main areas where the implementation is still partially inconsistent.

### 1.4 Request, Auth, and Collaboration Flow

A typical REST flow is conventional:

1. user action in React
2. frontend sends a request to `/api`
3. backend middleware runs
4. route validates and queries/writes Postgres
5. backend returns JSON
6. frontend updates state and rerenders

Example: `Create Issue`

1. user clicks `Create Issue`
2. frontend sends `POST /api/issues`
3. backend validates the request
4. backend inserts a row into `documents`
5. backend returns the created issue as JSON
6. frontend updates the UI from that response

Authentication is mainly database-backed session-cookie auth:

- login creates a `session_id` cookie
- later requests are authenticated by validating that session in the `sessions` table
- unauthenticated protected requests are usually rejected with `401`

Realtime collaboration is separate from the normal REST path:

- the editor opens a document-specific WebSocket room
- the backend authenticates that socket using the existing session cookie and document access checks
- Yjs keeps a local document on each client and syncs updates between them
- concurrent edits merge through CRDTs
- the server keeps active Yjs docs in memory and periodically persists them into `documents.yjs_state`, with `content` kept in sync as a JSON fallback

### 1.5 Deployment and Test Shape

Operationally, the repo is simple but not fully productized:

- the root `Dockerfile` produces a production API container
- the root `docker-compose.yml` starts only PostgreSQL
- the full local stack uses `docker-compose.local.yml`
- Terraform expects an AWS deployment centered on Elastic Beanstalk/ALB, Aurora PostgreSQL, S3, CloudFront, WAF, IAM, and VPC networking
- there is no repo-managed CI/CD pipeline; deployment is handled by scripts

Testing is split across three surfaces:

- API Vitest tests
- web Vitest tests
- Playwright E2E tests

The Playwright setup is strongly isolated: each worker gets its own Postgres, API process, and preview server, which is a good reliability choice but expensive in memory and runtime.

## 2. Architecture Assessment

### 2.1 Strongest Architectural Decisions

1. **Unified document model**
   - gives the product one conceptual center
   - avoids building separate subsystems for docs, issues, projects, and weeks
   - enables shared UI and workflow patterns

2. **Clear `web/` + `api/` + `shared/` split**
   - keeps runtime architecture simple
   - makes shared contracts practical
   - reduces drift between frontend and backend

3. **Yjs collaboration isolated to the editor path**
   - keeps the hardest synchronization logic contained
   - lets the rest of the app stay conventional REST + SQL

### 2.2 Weakest Points

1. **Relationship modeling is still partially split**
   - similar relationships are represented through `parent_id`, `document_associations`, and some JSON properties

2. **Collaborative state has too many sources of truth**
   - `content`, `yjs_state`, in-memory Yjs docs, IndexedDB cache, and REST-mutated state must stay aligned

3. **`shared/` is useful but not fully authoritative**
   - some request/response and domain types are still duplicated locally instead of truly centralized

### 2.3 Onboarding Guidance

The first thing a new engineer should internalize is:

**This is a unified-document monolith. Do not model it as separate apps. Model it as one document graph with different views and workflows layered on top.**

After that, they should learn the two execution paths separately:

- normal app flow: React -> REST -> Express -> SQL
- editor flow: TipTap -> Yjs -> WebSocket -> persisted collaboration state

### 2.4 What Breaks First at 10x Users

The first likely fault line is the realtime collaboration layer.

Why:

- WebSockets run in the main API process
- active Yjs room state is stored in instance memory
- collaborative edits also generate persistence churn
- the current deployment assumptions are still modest

This makes collaboration the first place where connection count, memory pressure, state coordination, and horizontal scaling will collide.

## 3. Audit Methodology

The audit was run as a baseline exercise. No broad code changes were applied during the seven-category measurement phase.

Measurement approach by category:

1. Type Safety
   - compiler settings review
   - recursive type-check
   - static token-pattern counts for `any`, `as`, `!`, and ignore directives

2. Bundle Size
   - production frontend build with source maps
   - treemap generation
   - chunk counting and dependency-weight estimation
   - import cross-check for unused dependencies

3. API Response Time
   - local Docker stack with seeded realistic data
   - five real frontend-used endpoints
   - authenticated load runs at 10, 25, and 50 concurrency

4. Database Query Efficiency
   - PostgreSQL query logging
   - five real UI flows
   - query count capture plus `EXPLAIN ANALYZE` on dominant queries

5. Test Coverage and Quality
   - API Vitest run
   - web Vitest run
   - Playwright run attempt plus targeted flaky-spec repeat
   - source inventory of E2E test declarations

6. Runtime Error and Edge Case Handling
   - Playwright runtime probe
   - collaboration disconnect/reconnect scenarios
   - malformed input and concurrent edit scenarios
   - slow-network probe plus server-log capture

7. Accessibility Compliance
   - Lighthouse audits on major pages
   - Playwright + axe automated scans
   - keyboard sampling
   - accessibility-tree inspection as a screen-reader proxy

Important accessibility caveat:

- native VoiceOver/NVDA was not run in this environment, so screen-reader verification is partial rather than complete

## 4. Baseline Results by Category

### 4.1 Category 1: Type Safety

| Metric | Baseline |
| --- | ---: |
| Total `any` types | 346 |
| Total type assertions (`as`) | 1,500 |
| Total non-null assertions (`!`) | 348 |
| Total `@ts-ignore` / `@ts-expect-error` | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A |

Top 5 violation-dense files:

- `api/src/routes/weeks.ts` `216`
- `api/src/routes/team.ts` `171`
- `api/src/routes/projects.ts` `106`
- `api/src/routes/claude.ts` `79`
- `api/src/routes/issues.ts` `78`

Interpretation:

- strict mode is on, which is structurally good
- in practice, safety is weakened by heavy use of assertions and casts
- the dominant risk is concentrated in API route files at trust boundaries

### 4.2 Category 2: Bundle Size

| Metric | Baseline |
| --- | --- |
| Total production bundle size | `2,274.46 KB` |
| Largest chunk | `app-DOVWGuIu.js` (`2,025.14 KB`) |
| Number of chunks | `262` |
| Top 3 largest dependencies | `emoji-picker-react` (`398.43 KB`), `highlight.js` (`376.41 KB`), `react-router` (`346.71 KB`) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister`, `@uswds/uswds` |

Interpretation:

- code splitting exists
- the real problem is the oversized main app chunk
- some attempted lazy loading is currently neutralized by static imports elsewhere

### 4.3 Category 3: API Response Time

Primary baseline at 25 concurrent connections:

| Endpoint | P50 | P95 | P99 |
| --- | ---: | ---: | ---: |
| `GET /api/auth/me` | `41.49 ms` | `45.69 ms` | `45.90 ms` |
| `GET /api/dashboard/my-week` | `56.62 ms` | `61.70 ms` | `63.37 ms` |
| `GET /api/issues?sprint_id={id}` | `20.07 ms` | `24.39 ms` | `24.47 ms` |
| `GET /api/documents/:id` | `38.04 ms` | `43.77 ms` | `45.75 ms` |
| `GET /api/search/mentions?q=dev` | `31.57 ms` | `36.66 ms` | `37.01 ms` |

Dataset used:

- `21` users
- `532` documents
- `104` issues
- `70` sprints

Interpretation:

- current local latency is acceptable
- the slowest path is `GET /api/dashboard/my-week`
- graph-heavy aggregate endpoints are the likely bottlenecks as data volume and concurrency increase

### 4.4 Category 4: Database Query Efficiency

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
| --- | ---: | ---: | --- |
| Load main page | `14` | `0.423 ms` | `No` |
| View a document | `16` | `1.972 ms` | `No` |
| List issues | `13` | `1.236 ms` | `No` |
| Load sprint board | `31` | `1.649 ms` | `No` |
| Search content | `4` | `2.564 ms` | `No` |

Interpretation:

- no classical N+1 pattern was found in the sampled flows
- the larger issue is query fan-out across multi-request, relationship-heavy flows
- sprint and document flows are query-dense because they preload related graph data

### 4.5 Category 5: Test Coverage and Quality

| Metric | Baseline |
| --- | --- |
| Total tests | `608 executed in audit runs` / `1,485 defined in repo` |
| Pass / Fail / Flaky | `592 / 13 / 3` |
| Suite runtime | API `14.208s`, web `2.966s`, targeted flaky-spec repeat `122.12s`, full Playwright suite `>900s` and did not complete |
| Critical flows with zero coverage | Browser CAIA/PIV/OAuth auth flow; normal UI document delete flow; sprint board drag/drop mutation flow |
| Code coverage % (if measured) | web: not measured / api: not measured |

Interpretation:

- there is meaningful coverage in place
- the test surface is larger than the default repo command suggests
- the suite is not yet a fully trustworthy safety net because web failures exist and full Playwright is operationally expensive on this machine

### 4.6 Category 6: Runtime Error and Edge Case Handling

| Metric | Baseline |
| --- | --- |
| Console errors during normal usage | `10` |
| Unhandled promise rejections (server) | `0` observed |
| Network disconnect recovery | `Partial` |
| Missing error boundaries | documented in category report |
| Silent failures identified | documented in category report |

Most important baseline findings:

- session timeout polling hit the wrong origin in the Docker setup and failed noisily
- collaboration reconnect resumed, but offline-authored text did not survive browser refresh consistently
- concurrent title edits produced last-write-wins behavior with no warning

Interpretation:

- the main risk is not just that errors happen
- the bigger issue is whether users are informed clearly and can recover safely, especially in collaboration scenarios

Note:

- a later remediation document exists in `audit-results/runtime-error-remediation.md`, but the table above is the baseline audit view

### 4.7 Category 7: Accessibility Compliance

| Metric | Baseline |
| --- | --- |
| Lighthouse accessibility score (per page) | `/login` `98`, `/my-week` `96`, `/docs` `91`, `/issues` `100`, `/projects` `100`, `/programs` `100`, `/team/allocation` `100` |
| Total Critical/Serious violations | `5` |
| Keyboard navigation completeness | `Partial` |
| Color contrast failures | `28` |
| Missing ARIA labels or roles | `web/src/pages/App.tsx:665`, `web/src/pages/App.tsx:679` |

Interpretation:

- page scores are often strong
- the real deliverable shows that meaningful accessibility gaps still remain
- the docs page is the weakest major page
- keyboard support is incomplete at the audit level
- native screen-reader verification is still not fully complete

## 5. Cross-Cutting Findings

### What the codebase does well

- one clear product idea: everything is a document
- one clear runtime shape: frontend, backend, shared contract package
- one clear collaboration strategy: Yjs contained to the editor path

### What the codebase is still missing

- one fully authoritative relationship model
- one fully authoritative shared contract boundary
- one fully reliable test and runtime safety net
- one fully verified accessibility posture that matches the stated compliance target

### Jira comparison

Compared with Jira:

- Ship is stronger as a unified work-and-context system
- Jira is stronger as a mature PM operating system

Jira currently has the advantage in:

- roadmap and release planning depth
- workflow customization
- reporting and governance
- admin controls
- integration ecosystem
- mature documentation ecosystem

Ship’s differentiation is tighter continuity between planning, documentation, execution, and collaboration.

## 6. Recommended Improvement Order

1. **Consolidate relationship handling**
   - finish the move toward one authoritative relationship model
   - reduce overlap across `parent_id`, `document_associations`, and JSON-based legacy fields

2. **Make `shared/` more authoritative**
   - reduce duplicated contract types
   - make frontend/backend DTOs more consistently centralized

3. **Harden the collaboration runtime**
   - reduce ambiguity in collaborative state authority
   - improve reconnect and conflict handling
   - prepare the collaboration layer for higher concurrency

4. **Improve test reliability**
   - stabilize web test failures
   - make the full-suite story more operationally practical
   - add coverage on currently untested critical flows

5. **Close accessibility gaps**
   - fix the docs tree semantics
   - fix the contrast failures
   - complete native screen-reader verification

## 7. Final Conclusion

Ship has a strong and coherent architectural core.

The system is easy to summarize at a high level:

- one document graph
- one frontend
- one backend
- one shared contract layer
- one contained realtime collaboration path

That is a good foundation.

The main challenge is not that the architecture is directionless. The challenge is that the implementation still needs consistency and operational maturity around its strongest ideas.

The most important conclusion from the orientation work and the seven-category audit is this:

**Ship already has a strong product and architectural thesis. The next phase should be about making that thesis more consistent, more testable, more recoverable, and more scalable in practice.**
