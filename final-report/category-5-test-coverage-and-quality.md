# Category 5: Test Coverage and Quality

## Result

- Improvement target met: `Yes`
- Strategy used: `Add meaningful tests for 3 previously untested critical paths`
- Before: `3` critical flows with zero coverage
- After: `0` critical flows with zero coverage
- Net new defined tests: `+6`
- Web suite before: `138 passed / 13 failed`
- Web suite after: `157 passed / 0 failed`
- API suite before: `451 passed / 0 failed`
- API suite after: `451 passed / 0 failed`

## Reproducible Proof

### Measurement commands

```bash
node benchmarks/test-quality-inventory.mjs .
DATABASE_URL='postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev' COREPACK_HOME=/tmp/corepack corepack pnpm --dir api exec vitest run --reporter=json --outputFile ../stage-2/category-5-test-coverage-and-quality/api-vitest-after.json
COREPACK_HOME=/tmp/corepack corepack pnpm --dir web exec vitest run --reporter=json --outputFile ../stage-2/category-5-test-coverage-and-quality/web-vitest-after.json
```

### Saved artifacts

- `stage-2/category-5-test-coverage-and-quality/before-inventory.json`
- `stage-2/category-5-test-coverage-and-quality/after-inventory.json`
- `stage-2/category-5-test-coverage-and-quality/api-vitest-before.json`
- `stage-2/category-5-test-coverage-and-quality/api-vitest-after.json`
- `stage-2/category-5-test-coverage-and-quality/web-vitest-before.json`
- `stage-2/category-5-test-coverage-and-quality/web-vitest-after.json`
- `stage-2/category-5-test-coverage-and-quality/benchmark-commands.txt`

## Before / After

### Coverage inventory

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Defined test files | 115 | 118 | +3 |
| Defined tests | 1483 | 1489 | +6 |
| Critical flows with zero coverage | 3 | 0 | -3 |

### Critical flow coverage

| Critical path | Before | After | Evidence |
| --- | --- | --- | --- |
| Browser CAIA/PIV login start | Uncovered | Covered | `web/src/pages/Login.test.tsx` |
| Normal UI document delete flow | Uncovered | Covered | `web/src/pages/Documents.test.tsx` |
| Sprint board drag/drop mutation flow | Uncovered | Covered | `web/src/components/KanbanBoard.test.tsx` |

### Suite health

| Suite | Before | After | Delta |
| --- | --- | --- | --- |
| API Vitest | 451 passed / 0 failed | 451 passed / 0 failed | no regression |
| Web Vitest | 138 passed / 13 failed | 157 passed / 0 failed | +19 passing, -13 failing |

## What Changed

### 1. Added browser CAIA/PIV login coverage

Files:

- `web/src/pages/Login.test.tsx`
- `web/src/pages/Login.tsx`
- `web/src/lib/browser-navigation.ts`

What changed:

- Added a login-page test that verifies the browser initiates the CAIA/PIV flow and redirects to the CAIA authorization URL.
- Moved the redirect into `redirectTo()` so the browser navigation call can be mocked directly in the test.

Why the original code was suboptimal:

- The audit found no browser-level coverage for the CAIA/PIV sign-in start flow.
- A regression in the login page could break PIV users before the app ever reaches backend callback handling.

Why this is better:

- The login page now has direct regression coverage for the CAIA start path.
- The test verifies the exact user action that matters: clicking the PIV button starts federated auth.

Tradeoffs:

- This test covers the browser start of the flow, not the external CAIA provider itself.
- The redirect helper is intentionally tiny; it exists to keep the browser navigation boundary testable.

### 2. Added normal UI document delete coverage

Files:

- `web/src/pages/Documents.test.tsx`

What changed:

- Added a docs-page test that clicks the real delete control in the document tree, verifies the delete mutation is called, verifies the toast is shown, and verifies the item disappears from the rendered tree.

Why the original code was suboptimal:

- The audit found create/edit coverage for documents, but not the normal docs UI delete path.
- Delete is a core CRUD action; without coverage, the UI can silently stop wiring the action to the delete mutation.

Why this is better:

- The docs tree delete wiring is now covered end to end at the component/page boundary.
- The test checks both mutation and user feedback, which catches broken delete flows more reliably than a shallow callback assertion.

Tradeoffs:

- This is a page-level component test rather than a full Playwright flow.
- The test uses controlled hook mocks to keep it fast and deterministic.

### 3. Added sprint board drag/drop mutation coverage

Files:

- `web/src/components/KanbanBoard.test.tsx`

What changed:

- Added tests for the shared Kanban board drag/drop handler to verify that dropping an issue into a new column, or onto an issue in another column, calls the mutation with the correct target state.

Why the original code was suboptimal:

- The audit found board rendering coverage, but not the actual drag/drop mutation path.
- That means the most important board interaction could regress while the UI still looked intact.

Why this is better:

- The state-resolution logic behind board moves now has direct coverage.
- Sprint planning uses this shared board path, so the test guards the mutation logic that matters for board-based work movement.

Tradeoffs:

- The tests mock the DnD adapter layer instead of simulating the full browser drag stack.
- That keeps the tests stable and focused on the application logic rather than library internals.

### 4. Repaired stale failing web tests

Files:

- `web/src/lib/document-tabs.test.ts`
- `web/src/components/editor/DetailsExtension.test.ts`
- `web/src/hooks/useSessionTimeout.test.ts`

What changed:

- Updated stale tab-config expectations to match the current document-tab model.
- Updated the details extension tests to match the current node structure and the required companion nodes.
- Mocked `apiPost` in the session-timeout tests so reset/extend behavior is exercised against the current implementation boundary.

Why the original code was suboptimal:

- The existing web suite had drifted away from the current product behavior and was no longer a reliable safety net.

Why this is better:

- The web suite is green again, so the new critical-path tests land on top of a trustworthy surface instead of a broken one.

Tradeoffs:

- Some fixes updated test assumptions rather than production code because the tests, not the runtime behavior, were out of date.

## Verification

### Full web suite

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --dir web exec vitest run --reporter=json --outputFile ../stage-2/category-5-test-coverage-and-quality/web-vitest-after.json
```

Result: passed

- Test files: `19/19`
- Tests: `157/157`

### Repo default API suite

```bash
DATABASE_URL='postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev' COREPACK_HOME=/tmp/corepack corepack pnpm --dir api exec vitest run --reporter=json --outputFile ../stage-2/category-5-test-coverage-and-quality/api-vitest-after.json
```

Result: passed

- Test files: `28/28`
- Tests: `451/451`

## Notes

- The full Playwright suite remains expensive and was not the proof mechanism for this category.
- This category was satisfied by making the web suite green and adding direct coverage for the 3 previously uncovered critical paths.
- The unrelated deleted file `final-report/final-audit.pdf` was not part of this Category 5 work and should stay out of the commit.
