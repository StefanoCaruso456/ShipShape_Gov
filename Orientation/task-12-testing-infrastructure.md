# Task 12: Testing Infrastructure

## How the Playwright tests are structured

- The E2E suite lives under [e2e](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e) and is driven by [playwright.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/playwright.config.ts#L56). It points `testDir` at `./e2e`, runs only the Chromium project, enables `fullyParallel`, and uses `globalSetup` instead of a shared `webServer`.
- The default fixture for the real suite is [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L92). Most spec files import `test` and `expect` from there.
- The main Playwright worker fixtures are:
  - `dbContainer`: one fresh Postgres testcontainer per worker, started and stopped in `try/finally` [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L106)
  - `apiServer`: one built API process per worker on a dynamic port [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L151)
  - `webServer`: one `vite preview` process per worker on a dynamic port [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L203)
  - `baseURL`: overridden to that worker’s web server [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L267)
  - `context`: injects a localStorage flag before navigation to disable the action-items modal [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L96)
- There is also a lighter alternative fixture, [dev-server.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/dev-server.ts#L1), which reuses already-running dev servers. It is faster for local iteration, but it does not isolate the database.
- Common flaky-action helpers live in [test-helpers.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/test-helpers.ts#L1).
- [global-setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/global-setup.ts#L19) builds the API and web app once before workers start, so workers can spawn lightweight API processes and `vite preview` instead of full dev servers.

## What fixtures are used

- Playwright E2E uses custom worker-scoped fixtures from [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L83):
  - `dbContainer`
  - `apiServer`
  - `webServer`
- It also overrides:
  - `context`
  - `baseURL`
- Local-development-only Playwright runs can use the simpler `apiUrl` and `webUrl` fixtures from [dev-server.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/dev-server.ts#L26).

## How the test database gets set up and torn down

### Playwright E2E

- Each worker gets its own disposable Postgres container [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L106).
- `runMigrations()` does the database bootstrap [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L276):
  - runs `api/src/db/schema.sql`
  - creates `schema_migrations`
  - marks all SQL migration files as already applied, because `schema.sql` already represents the current schema
  - seeds test data
- `seedMinimalTestData()` inserts a realistic fixture dataset: workspace, users, memberships, person documents, programs, sprints, issues, projects, and wiki docs [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L331).
- Teardown is simple: when the worker finishes, the Postgres container is stopped in `finally`, so that worker’s database disappears with it [isolated-env.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/fixtures/isolated-env.ts#L133).

### API Vitest

- API tests are configured in [api/vitest.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/vitest.config.ts#L3).
- `setupFiles` points to [api/src/test/setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/test/setup.ts#L1), which truncates the shared tables before each test file [api/src/test/setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/test/setup.ts#L7).
- `fileParallelism: false` is explicitly enabled to avoid DB conflicts across files [api/vitest.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/vitest.config.ts#L9).
- Individual route suites then create only the rows they need in `beforeAll` and delete them in `afterAll`, for example:
  - [auth.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.test.ts#L44)
  - [issues.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.test.ts#L21)

### Web Vitest

- Web tests use `jsdom` and do not use a database [web/vitest.config.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/vitest.config.ts#L33).
- Their setup file is just [web/src/test/setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/test/setup.ts#L1).

## Full test suite run

I treated the full suite as:

- API Vitest
- Web Vitest
- Playwright E2E

### Hidden prerequisites I had to discover

- `@ship/shared` must be built first, or API/Web Vitest cannot resolve the package export from `shared/dist`.
  - [shared/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/package.json#L7)
- The API tests need `DATABASE_URL` set. On this machine, the local Docker stack exposes Postgres on `localhost:5433`, not `5432`.
  - [docker-compose.local.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.local.yml#L25)
- Some repo scripts assume bare `pnpm` is on `PATH`. In this shell, `corepack pnpm` worked, but Playwright `globalSetup` still shells out to plain `pnpm`, so I had to provide a temporary shim on `PATH`.
  - [global-setup.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/e2e/global-setup.ts#L31)

### Results

- API Vitest:
  - Command used: `DATABASE_URL=postgres://ship:ship_dev_password@127.0.0.1:5433/ship_dev COREPACK_HOME=/tmp/corepack corepack pnpm --filter @ship/api test`
  - Result: passed
  - Count: 28 files, 451 tests
  - Time: `13.172s`

- Web Vitest:
  - Command used: `COREPACK_HOME=/tmp/corepack corepack pnpm --filter @ship/web test`
  - Result: failed
  - Count: 16 files, 151 tests, 13 failures
  - Time: `3.771s`
  - Failures were concentrated in:
    - [document-tabs.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/document-tabs.test.ts)
    - [useSessionTimeout.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useSessionTimeout.test.ts)
    - [DetailsExtension.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/editor/DetailsExtension.test.ts)

- Playwright E2E:
  - Command used: `PATH="/tmp/corepack-bin:$PATH" COREPACK_HOME=/tmp/corepack corepack pnpm exec playwright test --reporter=dot`
  - Initial discovery: 869 tests
  - Result: did not complete on this machine
  - What happened:
    - after fixing the `pnpm`-on-`PATH` issue, the suite built successfully
    - the run then reported only `0.1GB` to `0.8GB` free memory
    - Playwright dropped to 1 worker, but still entered repeated worker replacement/failure cycles while spinning isolated API/Postgres/web environments
    - I stopped the run after repeated failures because it was not making forward progress

## Bottom line

- The API test layer passes locally once `shared/` is built and `DATABASE_URL` points at the Docker Postgres on `5433`.
- The web unit test layer does not fully pass: `13` tests fail.
- The Playwright suite is architecturally solid and highly isolated, but on this machine it did not finish under current memory pressure, so I do not have a valid full-suite E2E completion time from this run.
