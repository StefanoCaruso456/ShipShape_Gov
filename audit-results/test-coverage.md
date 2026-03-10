# Test Coverage and Quality Baseline

Date: 2026-03-10

This is a baseline audit only. No application logic was changed as part of this step.

## Scope

This repo has three separate test surfaces:

- API Vitest tests in [api/src](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src)
- Web Vitest tests in [web/src](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src)
- Playwright E2E specs in [e2e](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e)

Important repo behavior:

- Root `pnpm test` only runs the API suite, as defined in [package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/package.json#L27)
- Web tests are separate in [web/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/package.json#L13)
- E2E tests are separate in [package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/package.json#L28)

That means the repo's default `pnpm test` command is not the full test suite.

## How It Was Measured

Commands used:

```bash
# repo default test command (API only)
DATABASE_URL="postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev" \
COREPACK_HOME=/tmp/corepack corepack pnpm --filter @ship/api test

# machine-readable API baseline
DATABASE_URL="postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev" \
COREPACK_HOME=/tmp/corepack corepack pnpm --dir api exec vitest run \
  --reporter=json --outputFile ../benchmarks/api-vitest-baseline.json

# machine-readable web baseline
COREPACK_HOME=/tmp/corepack corepack pnpm --dir web exec vitest run \
  --reporter=json --outputFile ../benchmarks/web-vitest-baseline.json

# full Playwright suite attempt
PLAYWRIGHT_WORKERS=1 PATH="/tmp/corepack-bin:$PATH" \
COREPACK_HOME=/tmp/corepack corepack pnpm exec playwright test --reporter=json \
  > benchmarks/playwright-run-1.json

# targeted flake probe on repo's known flaky spec
PLAYWRIGHT_WORKERS=1 PATH="/tmp/corepack-bin:$PATH" \
COREPACK_HOME=/tmp/corepack corepack pnpm exec playwright test \
  e2e/my-week-stale-data.spec.ts --repeat-each=3 --reporter=line \
  > benchmarks/playwright-my-week-repeat.txt 2>&1
```

Methodology notes:

- API and web counts come from the runners' JSON output.
- Playwright full-suite reliability was measured by a real run on this machine, but the run did not complete within a reasonable audit window and had to be stopped after more than 15 minutes.
- Because the full E2E suite did not finish, I used a targeted repeated run of the repo's own known flaky spec in [e2e/my-week-stale-data.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/my-week-stale-data.spec.ts#L10) to get concrete flaky-test evidence.
- To estimate total E2E suite size, I also inventoried Playwright specs in source: `71` `.spec.ts` files with `883` `test()` declarations under [e2e](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e).

## How The Tests Are Structured

### API

- Config: [api/vitest.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/vitest.config.ts)
- Shared DB setup/teardown: [api/src/test/setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/test/setup.ts)
- Pattern: route and service tests run against a shared Postgres database, with file-level serialization (`fileParallelism: false`)

### Web

- Config: [web/vitest.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/vitest.config.ts)
- Pattern: jsdom component and hook tests

### Playwright

- Config: [playwright.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/playwright.config.ts)
- Global build step: [e2e/global-setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/global-setup.ts)
- Worker isolation fixture: [e2e/fixtures/isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts)

Playwright design summary:

- each worker gets its own PostgreSQL testcontainer
- each worker gets its own API process
- each worker gets its own `vite preview` server

This is strong isolation, but it is also expensive in memory and startup time.

## Audit Deliverable

| Metric | Your Baseline |
| --- | --- |
| Total tests | `608 executed in audit runs` / `1,485 defined in repo` |
| Pass / Fail / Flaky | `592 / 13 / 3` |
| Suite runtime | API `14.208s`, web `2.966s`, targeted flaky-spec repeat `122.12s`, full Playwright suite `>900s` and did not complete |
| Critical flows with zero coverage | Browser CAIA/PIV/OAuth auth flow; normal UI document delete flow; sprint board drag/drop mutation flow |
| Code coverage % (if measured) | web: not measured / api: not measured |

Counting note:

- `608 executed` = `451` API tests + `151` web tests + `6` repeated Playwright tests from the flaky-spec probe
- `1,485 defined` = `451` API + `151` web + `883` E2E `test()` declarations
- the remaining E2E suite was source-inventoried but the full runner pass did not complete on this machine

## Measured Results By Surface

### API Vitest

Evidence:

- [api-vitest-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/api-vitest-baseline.json)

Baseline:

- `451` total tests
- `451` passed
- `0` failed
- runtime: `14.208s`

Interpretation:

- the backend test suite is healthy and fast when it can reach local Postgres
- the biggest practical issue is that root `pnpm test` only covers this surface, which can create a false sense of overall test health

### Web Vitest

Evidence:

- [web-vitest-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/web-vitest-baseline.json)

Baseline:

- `151` total tests
- `138` passed
- `13` failed
- runtime: `2.966s`

Observed failing files:

- [web/src/lib/document-tabs.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/document-tabs.test.ts) -> `9` failures
- [web/src/components/editor/DetailsExtension.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/editor/DetailsExtension.test.ts) -> `3` failures
- [web/src/hooks/useSessionTimeout.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useSessionTimeout.test.ts) -> `1` failure

Interpretation:

- these do not look flaky; they failed consistently across repeated web runs
- the failures are mostly expectation drift between tests and current UI/editor behavior, not harness instability

### Playwright E2E

Evidence:

- [playwright-run-1.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/playwright-run-1.json)
- [playwright-my-week-repeat.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/playwright-my-week-repeat.txt)

Full-suite baseline:

- full suite started successfully
- global setup rebuilt API and web successfully
- run was stopped after `>900s` because it was still not complete on one worker
- the run emitted repeated low-memory warnings from [playwright.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/playwright.config.ts#L24) and [e2e/fixtures/isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L76)

Interpretation:

- the E2E suite is too expensive to produce a reliable "full pass" baseline on this machine in its current form
- this is a test reliability problem, not just a local inconvenience, because the suite architecture is intentionally memory-heavy

### Flaky-test probe

Repeated spec:

- [e2e/my-week-stale-data.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/my-week-stale-data.spec.ts)

Baseline:

- `6` repeated tests executed (`2` tests x `repeat-each=3`)
- `3` passed
- `3` flaky
- runtime: `2m 2.12s`

Observed flaky case:

- `retro edits are visible on /my-week after navigating back`
- the same file already labels this as known flaky in [e2e/my-week-stale-data.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/my-week-stale-data.spec.ts#L10)

Failure signal:

- the retro content did not become visible on `/my-week` within the assertion window
- the captured output also shows AI/Bedrock credential errors during the run, which adds more noise to an already timing-sensitive scenario

## Coverage Map Of Critical Flows

### Document CRUD

Covered:

- view/create/edit document in [e2e/documents.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/documents.spec.ts)
- richer document/editor workflows in [e2e/document-workflows.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/document-workflows.spec.ts), [e2e/docs-mode.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/docs-mode.spec.ts), [e2e/file-attachments.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/file-attachments.spec.ts), and [e2e/images.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/images.spec.ts)

Gap:

- normal UI document delete behavior is not directly tested
- deletion coverage is mostly API-assisted or private-document specific in [e2e/private-documents.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/private-documents.spec.ts#L92)

### Real-time sync

Covered:

- document isolation in [e2e/document-isolation.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/document-isolation.spec.ts)
- mention sync in [e2e/mentions.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/mentions.spec.ts#L374)
- offline/reconnect behavior in [e2e/error-handling.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/error-handling.spec.ts#L127) and [e2e/race-conditions.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/race-conditions.spec.ts#L298)
- backend collaboration behavior in [api/src/collaboration/__tests__/collaboration.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/__tests__/collaboration.test.ts)

Assessment:

- this area is not untested, but it is also the clearest source of timing-sensitive behavior and current flake

### Auth

Covered:

- browser login/logout and protected-route redirects in [e2e/auth.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/auth.spec.ts)
- authorization checks in [e2e/authorization.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/authorization.spec.ts)
- session expiry UX in [e2e/session-timeout.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/session-timeout.spec.ts)
- backend session and bearer-token middleware tests in [api/src/__tests__/auth.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/__tests__/auth.test.ts)

Gap:

- no browser-level coverage for CAIA/PIV/OAuth authentication flows
- the only PIV-related test found is password rejection in [api/src/routes/auth.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.test.ts#L159)

### Sprint management

Covered:

- week/program flows in [e2e/weeks.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/weeks.spec.ts)
- program week UX in [e2e/program-mode-week-ux.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/program-mode-week-ux.spec.ts)
- project weeks in [e2e/project-weeks.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/project-weeks.spec.ts)
- issue/sprint assignment in [e2e/issue-estimates.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/issue-estimates.spec.ts)
- planning board visibility in [e2e/document-workflows.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/document-workflows.spec.ts#L196)

Gap:

- there is board/view coverage, but I did not find a true drag/drop sprint-board mutation spec
- the nearest coverage is list/bulk movement and board rendering, not direct board interaction

## Critical Flows With Zero Coverage

1. Browser CAIA/PIV/OAuth sign-in flow

- no E2E specs reference `CAIA`, `oauth`, or PKCE/browser auth flow behavior
- impact: high in any real government deployment using smart-card or federated auth

2. Normal UI document delete flow

- [e2e/documents.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/documents.spec.ts) covers create/edit but not delete
- delete behavior appears through API helpers or private-doc fixtures, not the normal docs UI
- impact: medium because document CRUD is a core workflow

3. Sprint board drag/drop mutation flow

- existing sprint coverage proves board/list rendering and some bulk moves
- I did not find a test that drags an issue across board columns or validates the resulting persisted state
- impact: medium because board interactions are user-facing and easy to regress

## Specific Weaknesses And Opportunities

### 1. The repo's default test command does not run the full suite

Severity: High

Why:

- [package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/package.json#L27) maps `pnpm test` to API only
- a green root test run hides failing web tests and unstable E2E behavior

### 2. Full Playwright reliability is poor on this machine

Severity: High

Why:

- one-worker full-suite attempt exceeded `15` minutes without finishing
- the E2E harness intentionally uses per-worker Postgres + API + preview servers, which is isolation-friendly but expensive
- low-memory warnings were emitted during execution

### 3. Web unit suite is failing in current head state

Severity: High

Why:

- `13` web tests fail consistently
- failures are concentrated in tab configuration, details editor schema assumptions, and session-timeout timing behavior

### 4. Real-time/editor behavior still has real flake

Severity: High

Why:

- the repeated [e2e/my-week-stale-data.spec.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/my-week-stale-data.spec.ts) probe produced `3 flaky` results
- this aligns with the file's own inline note that the retro case is known flaky

### 5. Coverage reporting is not currently available out of the box

Severity: Medium

Why:

- attempting to run Vitest coverage for both API and web failed with:
  - `MISSING DEPENDENCY Cannot find dependency '@vitest/coverage-v8'`
- because the dependency is absent, no line/branch percentages could be measured without changing the dependency graph

## Audit Deliverable Summary

| Metric | Baseline |
| --- | --- |
| Total tests | `608 executed in audit runs` / `1,485 defined in repo` |
| Pass / Fail / Flaky | `592 / 13 / 3` |
| Suite runtime | API `14.208s`; web `2.966s`; targeted flaky repeat `122.12s`; full Playwright `>900s` and incomplete |
| Critical flows with zero coverage | CAIA/PIV/OAuth browser auth; UI document delete; sprint board drag/drop mutation |
| Code coverage % (if measured) | Not measured: `@vitest/coverage-v8` missing for both `web` and `api` |
