# ShipShape

Stefano Caruso

AI Product Engineer

From Discovery To Measurable Improvements

---

# Discovery

- I started by building a mental model before changing code
- Ship is a unified-document monolith: `web/`, `api/`, and `shared/`
- The core model is one `documents` table filtered by `document_type`
- That discovery shaped the implementation work: fix the contract layer, first-load path, hot read paths, and relationship-heavy flows

---

# AI Layer, Telemetry, And Cost Analysis

- **Scope:** Ship already has a narrow AI layer for plan and retro quality analysis, not a full app-wide copilot
- **Telemetry:** the app already captures request metadata, tokens, latency, and traceable AI usage
- **Cost:** that makes AI cost measurable before the feature surface expands
- **Takeaway:** the right strategy is to prove value and cost efficiency first, then broaden the AI layer

---

# Category 1: Type Safety

- **Before:** API routes and tests relied too heavily on `!`, `as`, and `any`
- **Why it mattered:** TypeScript was present, but too many important paths still bypassed the compiler
- **What changed:** added checked auth helpers, `zod` request validation, honest nullable response types, and typed test helpers
- **Outcome:** violations dropped from `1292` to `883`, a `31.7%` reduction

---

# Category 2: Bundle Size

- **Before:** the app shipped almost the entire frontend on first load
- **Why it mattered:** lightweight routes were paying for heavy editor and route code up front
- **What changed:** added route-level lazy loading, limited devtools to development, and reduced the highlighting payload
- **Outcome:** authenticated startup dropped from `2078.55 kB` to `485.14 kB`, a `76.7%` improvement

---

# Category 3: API Response Time

- **Before:** protected read endpoints were doing repeated auth and association work
- **Why it mattered:** those fixed costs become bottlenecks as load and data volume grow
- **What changed:** reduced auth overhead, removed an extra issue-association round-trip, and added targeted indexes
- **Outcome:** P95 improved from `19.00 ms` to `14.32 ms` on `GET /api/issues` and from `18.09 ms` to `13.58 ms` on `GET /api/documents/:id`

---

# Category 4: Database Query Efficiency

- **Before:** the app was doing unnecessary database work, especially repeated session writes and repeated project-query work
- **Why it mattered:** relationship-heavy flows are where the unified document model becomes more expensive
- **What changed:** throttled session `last_activity` writes, tightened the repeated projects query, and added a targeted index
- **Outcome:** sprint-board flow dropped from `32` queries to `25`, a `21.9%` reduction

---

# Category 5: Test Coverage And Quality

- **Before:** `3` critical flows had zero coverage, and web Vitest had `13` failures
- **Why it mattered:** the test suite was not a reliable regression safety net
- **What changed:** added tests for CAIA/PIV login start, UI document delete, and sprint-board drag/drop, then stabilized the web suite
- **Outcome:** critical uncovered flows dropped from `3` to `0`, and web Vitest improved from `138 passed / 13 failed` to `157 passed / 0 failed`

---

# Category 6: Runtime Error And Edge Case Handling

- **Before:** several failure states were silent or confusing, especially around collaboration and title-save failures
- **Why it mattered:** users could miss recovery actions or think failed work had been saved
- **What changed:** added a global realtime degradation banner, a collaboration disconnect warning, and explicit title-save retry recovery
- **Outcome:** console errors during normal usage dropped from `10` to `0`, and the three targeted user-facing recovery gaps were fixed

---

# Category 7: Accessibility Compliance

- **Before:** repeated low-contrast UI patterns and docs-tree semantics were causing serious accessibility failures
- **Why it mattered:** this was both a compliance risk and a usability problem on key pages
- **What changed:** fixed contrast on repeated badges and labels, removed opacity-based contrast loss, and cleaned up docs sidebar tree semantics
- **Outcome:** serious automated violations dropped from `3` to `0`, contrast failures dropped from `22` to `0`, and `/my-week` improved from `96` to `100`

---

# Future Insights And Next Steps

- Relationship consistency is still the biggest structural pressure point
- The next scale risk is the realtime layer, because WebSockets and live Yjs room state are still closely tied to the main API process
- `shared/` should become a more authoritative contract layer between frontend and backend
- The path forward is: relationship consolidation, scale hardening, stronger accessibility validation, and continued test reliability work
