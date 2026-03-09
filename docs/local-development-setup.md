# Local Development Setup

This guide documents the actual local startup flow for Ship from a clean clone.

It includes the steps that are missing, misleading, or outdated in [README.md](../README.md).

## Summary

Ship has two realistic local startup paths:

1. `pnpm dev` with native PostgreSQL installed locally
2. `docker compose -f docker-compose.local.yml up --build` with Docker Desktop running

The important difference is:

- `pnpm dev` is the better active-development path because it runs the app directly on your machine
- `docker-compose.local.yml` is the easier full-stack path if you do not want local PostgreSQL, but it is not true hot-reload development because the containers copy source at build time and do not bind-mount your working tree

## What The README Gets Wrong

Before following any setup steps, note these differences from the current README:

1. The README says to copy `api/.env.example` and `web/.env.example` first. That is optional for the native `pnpm dev` path and unnecessary for the Docker full-stack path.
2. The README says `docker-compose up -d`. The root [docker-compose.yml](../docker-compose.yml) only starts PostgreSQL, not the full app.
3. The actual full-stack Docker file is [docker-compose.local.yml](../docker-compose.local.yml).
4. The README tells you to run `pnpm db:seed` before `pnpm db:migrate`. The repo scripts do the opposite: migrate first, then seed.
5. The README assumes the app always comes up on `localhost:5173` and `localhost:3000`. The native [scripts/dev.sh](../scripts/dev.sh) auto-picks the first free ports, so the web port may not be `5173`.
6. The README does not mention that native `pnpm dev` depends on `psql` and `createdb` being installed and available on `PATH`.
7. The README does not mention that `pnpm install` warns about missing `comply-cli`. That tool is not required to run the app, but it is required for the repo's pre-commit hooks.

## Prerequisites

### Required for all paths

- Git
- Node.js 20 or newer
- `corepack` available from Node, or a working `pnpm` install

Recommended check:

```bash
node -v
corepack --version
```

## Path A: Native Development With Local PostgreSQL

This is the path the root `pnpm dev` script is built around.

### 1. Install PostgreSQL locally, including CLI tools

You need both the server and the command-line tools:

- `psql`
- `createdb`

Check them:

```bash
psql --version
createdb --version
```

If either command is missing, `pnpm dev` will fail before the app starts.

### 2. Start PostgreSQL

Make sure PostgreSQL is running locally and accessible as your current OS user.

The native dev script creates a database with:

```bash
createdb <database_name>
```

and writes:

```bash
DATABASE_URL=postgresql://localhost/<database_name>
```

That means local socket or trust auth must work for your current user.

### 3. Install dependencies

If you already have `pnpm`, use it. Otherwise use the version pinned by the repo through `corepack`.

```bash
corepack pnpm install
```

If `corepack` fails because of a cache permission problem, set a writable cache dir first:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm install
```

### 4. Run the app

```bash
corepack pnpm dev
```

What this really does, from [scripts/dev.sh](../scripts/dev.sh):

1. Checks whether `api/.env.local` already exists
2. If not, derives a database name from the folder name
3. Creates that database if needed
4. Writes `api/.env.local`
5. On a fresh database only, builds `shared`, runs migrations, then seeds sample data
6. Chooses the first open API port starting at `3000`
7. Chooses the first open web port starting at `5173`
8. Writes a temporary `.ports` file
9. Starts API and web in parallel

### 5. Check which ports were selected

The native dev script does not guarantee `3000` and `5173`.

Look at:

- [scripts/dev.sh](../scripts/dev.sh)
- `.ports` in the repo root after startup

Example:

```bash
cat .ports
```

### 6. Log in

If seed data exists, use:

- Email: `dev@ship.local`
- Password: `admin123`

### 7. Important native-path behavior that is not obvious from the README

- On this clone, the first-run database name would be `ship_shipshape`, because the folder name is `ShipShape`.
- `api/.env.local` is auto-generated on first native startup. You do not have to copy [api/.env.example](../api/.env.example) unless you want to customize it before first run.
- `web/.env` is not required for `pnpm dev`. The root dev script exports `VITE_PORT` and `VITE_API_URL` itself.
- The script only seeds automatically when it creates a brand-new database. If the database already exists, it will not reseed.
- If you want the demo data back later, run:

```bash
corepack pnpm db:seed
```

### 8. If you want to customize the database connection

Create `api/.env.local` yourself before the first `pnpm dev` run.

Minimal example:

```env
DATABASE_URL=postgresql://localhost/my_custom_db
SESSION_SECRET=dev-secret-change-in-production
```

## Path B: Full Stack In Docker

This is the better option if you do not want local PostgreSQL installed.

### 1. Start Docker Desktop first

Having the `docker` CLI installed is not enough. The Docker daemon must be running.

Check:

```bash
docker info
```

If the server section says it cannot connect to the daemon, start Docker Desktop and try again.

### 2. Start the full stack

Use the full-stack compose file, not the root compose file:

```bash
docker compose -f docker-compose.local.yml up --build
```

Or, once `pnpm` is available:

```bash
corepack pnpm docker:up
```

### 3. What this starts

From [docker-compose.local.yml](../docker-compose.local.yml):

- PostgreSQL on `localhost:5433`
- API on `localhost:3000`
- Web on `localhost:5173`

### 4. Important Docker-path behavior that is not obvious from the README

- The API container automatically runs migrations and seed on startup. You do not need to run `pnpm db:migrate` or `pnpm db:seed` yourself for this path.
- The full-stack compose file uses port `5433` for PostgreSQL, not `5432`.
- The root [docker-compose.yml](../docker-compose.yml) is PostgreSQL-only.
- This is not a bind-mounted live development setup. Both [Dockerfile.dev](../Dockerfile.dev) and [Dockerfile.web](../Dockerfile.web) copy the repo into the images. Host-side code changes do not automatically appear inside already-running containers.
- If you change source code while using the Docker stack, rebuild and restart.

### 5. Log in

Use the same seeded account:

- Email: `dev@ship.local`
- Password: `admin123`

## Path C: Docker PostgreSQL Only + Native API/Web

This path is not documented in the README, but it is useful if:

- you do not want a native PostgreSQL install
- you do want the API and web processes to run directly on your machine

### 1. Start only PostgreSQL

```bash
docker compose up -d
```

This uses the root [docker-compose.yml](../docker-compose.yml).

### 2. Create `api/.env.local` manually

```env
DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5432/ship_dev
SESSION_SECRET=dev-secret-change-in-production
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
PORT=3000
```

### 3. Install dependencies

```bash
corepack pnpm install
```

### 4. Build shared types, migrate, and seed

```bash
corepack pnpm build:shared
corepack pnpm db:migrate
corepack pnpm db:seed
```

### 5. Start API and web in separate terminals

Terminal 1:

```bash
PORT=3000 CORS_ORIGIN=http://localhost:5173 corepack pnpm dev:api
```

Terminal 2:

```bash
VITE_API_URL=http://localhost:3000 corepack pnpm dev:web
```

This path bypasses [scripts/dev.sh](../scripts/dev.sh), so you do not need local `psql` or `createdb`.

## First Things To Check If Startup Fails

### `pnpm dev` fails immediately with `psql: command not found`

Cause:

- PostgreSQL CLI tools are not installed locally

Fix:

- Install PostgreSQL client tools
- Or use the Docker full-stack path
- Or use the hybrid "Docker PostgreSQL only" path

### `pnpm dev` fails creating the database

Cause:

- PostgreSQL is not running
- local auth is not configured for the current OS user

Fix:

- Start PostgreSQL
- Verify `createdb <name>` works directly in your shell

### `docker compose` cannot connect to the daemon

Cause:

- Docker Desktop is installed but not running

Fix:

- Start Docker Desktop
- Re-run `docker info`

### The app starts but login fails

Cause:

- The database exists but was never seeded

Fix:

```bash
corepack pnpm db:seed
```

### The app is not on `localhost:5173`

Cause:

- The native dev script detected a port conflict and incremented the port

Fix:

```bash
cat .ports
```

## Optional But Useful

### Install `comply-cli` if you plan to commit changes

`pnpm install` prints a warning if `comply` is missing. The app still runs without it, but the repo's hooks expect it.

```bash
pip install comply-cli
```

## Recommended Fastest Path

If you want the least friction:

1. Start Docker Desktop
2. Run `docker compose -f docker-compose.local.yml up --build`
3. Open `http://localhost:5173`
4. Log in as `dev@ship.local` / `admin123`

If you want the best day-to-day coding workflow:

1. Install local PostgreSQL including `psql` and `createdb`
2. Run `corepack pnpm install`
3. Run `corepack pnpm dev`
4. Read `.ports` if the default ports are occupied
