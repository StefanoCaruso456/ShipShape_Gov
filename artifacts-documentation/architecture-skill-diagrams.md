# Architecture Skill Diagram Notes

These diagrams were generated from the installed `skills/architecture-diagram/` guidance and are grounded in the checked-in Ship repository.

Generated Mermaid sources:

- `artifacts-diagrams/system-architecture.mmd`
- `artifacts-diagrams/package-dependency.mmd`
- `artifacts-diagrams/request-flow-create-issue.mmd`
- `artifacts-diagrams/data-model.mmd`

## System Architecture

File: `artifacts-diagrams/system-architecture.mmd`

What it shows:

- the browser-facing React/Vite application in `web/`
- the Express/Node API in `api/`
- PostgreSQL as the main persistence layer
- the Yjs/WebSocket collaboration server inside the API process
- `shared/` as the common types/constants package
- Docker, Terraform, and Playwright as the main infra and ops surfaces

Evidence:

- `web/src/main.tsx`
- `api/src/app.ts`
- `api/src/collaboration/index.ts`
- `api/src/db/client.ts`
- `shared/src/index.ts`
- `Dockerfile`, `docker-compose.local.yml`, `terraform/*.tf`, `playwright*.ts`

Notes:

- The realtime collaboration server is not a separate service. It runs inside the API node process.
- The diagram keeps infra high-level because the runtime edge to AWS services is configured primarily through Terraform, not through separate application packages.

## Package Dependency Diagram

File: `artifacts-diagrams/package-dependency.mmd`

What it shows:

- the pnpm workspace layout from the root package
- `web/` and `api/` both depending on `shared/`
- runtime edges: browser -> web -> api -> postgres

Evidence:

- `package.json`
- `pnpm-workspace.yaml`
- `shared/src/index.ts`

Notes:

- This is a package-level map, not a module-import graph. It intentionally shows the stable monorepo boundaries instead of every internal import.

## Request Flow Diagram

File: `artifacts-diagrams/request-flow-create-issue.mmd`

User action traced:

- creating a new issue from the week/sprint issues UI

Evidence:

- `web/src/components/document-tabs/WeekIssuesTab.tsx`
- `web/src/components/IssuesList.tsx`
- `web/src/hooks/useIssuesQuery.ts`
- `web/src/lib/api.ts`
- `web/vite.config.ts`
- `api/src/app.ts`
- `api/src/routes/issues.ts`

Notes:

- This path does not have a distinct service-layer module. The route handler owns the transaction and SQL directly.
- The UI uses optimistic React Query updates, then invalidates the issue list after the server response.

## Data Model Diagram

File: `artifacts-diagrams/data-model.mmd`

What it shows:

- `documents` as the unified core table
- `document_type` as the type discriminator
- `document_associations` as the main cross-document relationship table
- supporting auth/workspace tables around that core

Evidence:

- `api/src/db/schema.sql`
- `api/src/db/migrations/*`
- `shared/src/types/document.ts`

Notes:

- The ER diagram is intentionally conceptual. It only includes relationships that are directly supported by schema definitions.
- Some domain semantics still live in `documents.properties` JSONB, so not every relationship can be expressed as a strict FK edge.
