# Ship Repo Map

This file is a navigation aid for the most important directories in the Ship repository.

## Top-Level Map

| Path | Responsibility |
| --- | --- |
| `web/` | Frontend package: React app, routes, editor UI, hooks, client-side data flow |
| `api/` | Backend package: Express app, route handlers, WebSocket collaboration server, DB access |
| `shared/` | Shared TypeScript types, constants, and a few cross-package helpers |
| `e2e/` | Playwright end-to-end tests and worker-isolated fixture infrastructure |
| `terraform/` | AWS infrastructure definitions |
| `scripts/` | Local dev, deployment, and repo workflow scripts |
| `docs/` | Architecture notes and reference docs |
| `Orientation/` | Existing task-oriented orientation artifacts created from earlier analysis |
| `artifacts-documentation/` | New architecture docs intended to support audit work |

## Frontend

| Path | Responsibility |
| --- | --- |
| `web/src/main.tsx` | Browser entry point, providers, router setup |
| `web/src/pages/` | Route-level screens like dashboard, documents, issues, projects, reviews |
| `web/src/components/` | Reusable UI, editor, sidebars, list widgets, dialogs |
| `web/src/hooks/` | TanStack Query hooks, auth, realtime events, session logic |
| `web/src/contexts/` | Shared client state providers |
| `web/src/lib/` | API client, query client, utilities, route/tab definitions |
| `web/src/services/` | Focused client-side services such as uploads |

## Backend

| Path | Responsibility |
| --- | --- |
| `api/src/index.ts` | Node HTTP entry point |
| `api/src/app.ts` | Express app construction and route mounting |
| `api/src/routes/` | HTTP endpoints grouped by domain |
| `api/src/middleware/` | Auth, visibility, request guards |
| `api/src/services/` | Focused backend domain logic |
| `api/src/utils/` | Shared helpers, SQL utilities, content transforms |
| `api/src/collaboration/` | WebSocket upgrade handling, Yjs room management, persistence |
| `api/src/db/` | Database pool, schema, migrations, seed scripts |
| `api/src/openapi/` | OpenAPI schema definitions and registry |
| `api/src/mcp/` | MCP server support |

## Database

| Path | Responsibility |
| --- | --- |
| `api/src/db/schema.sql` | Current full schema |
| `api/src/db/migrations/` | Incremental schema changes |
| `api/src/db/migrate.ts` | Migration runner |
| `api/src/db/seed.ts` | Development/demo seed data |
| `api/src/db/scripts/` | DB diagnostics/remediation helpers |

## Collaboration

| Path | Responsibility |
| --- | --- |
| `web/src/components/Editor.tsx` | TipTap editor, Yjs doc, IndexedDB cache, y-websocket client |
| `web/src/hooks/useRealtimeEvents.tsx` | Global event WebSocket client |
| `api/src/collaboration/index.ts` | WebSocket upgrade, room auth, Yjs sync, persistence |

## Testing

| Path | Responsibility |
| --- | --- |
| `playwright.config.ts` | Main Playwright config |
| `playwright.isolated.config.ts` | Alternate isolated Playwright config |
| `e2e/fixtures/isolated-env.ts` | Per-worker Postgres + API + web fixture |
| `api/src/__tests__/` | Backend test suites |
| `web/src/**/*.test.ts(x)` | Frontend/component tests |

## Infrastructure

| Path | Responsibility |
| --- | --- |
| `Dockerfile` | Production API container image |
| `Dockerfile.dev` | Local API image |
| `Dockerfile.web` | Local web image |
| `docker-compose.yml` | Local PostgreSQL only |
| `docker-compose.local.yml` | Local full stack |
| `terraform/elastic-beanstalk.tf` | API runtime infrastructure |
| `terraform/database.tf` | Aurora PostgreSQL |
| `terraform/s3-cloudfront.tf` | Frontend hosting and API/WebSocket routing |
| `terraform/waf.tf` | CloudFront WAF |

## Fastest Reading Order

If you are onboarding quickly, start here:

1. `package.json`
2. `pnpm-workspace.yaml`
3. `web/src/main.tsx`
4. `api/src/index.ts`
5. `api/src/app.ts`
6. `api/src/db/schema.sql`
7. `shared/src/types/document.ts`
8. `api/src/collaboration/index.ts`

That sequence gives you:

- package layout
- frontend boot path
- backend boot path
- schema and domain model
- collaboration/runtime complexity
