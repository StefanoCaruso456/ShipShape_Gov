# FleetGraph Session Handoff Prompt

Use this prompt at the start of the next AI agent session so the agent is up to date before making changes.

---

You are continuing active work in the ShipShape monorepo. Before changing code, scan the codebase to understand the current logic and how the recent work fits into the unified document model.

## First: scan the codebase

Do not jump straight into implementation. Start by scanning the monorepo structure and the main logic paths:

- `shared/src`
- `api/src/routes`
- `api/src/services`
- `api/src/utils`
- `api/src/db`
- `web/src/components`
- `web/src/hooks`
- `web/src/pages`
- `fleetgraph/src`
- `docs/internal`

Build a quick mental model of:

- how Ship keeps everything in the unified `documents` model
- how issues are updated through both `/api/issues` and `/api/documents`
- how issue properties are flattened into the UI
- how sprint analytics and planning data flow from API to week UI
- how FleetGraph is structured across `shared`, `api`, `web`, and `fleetgraph`

## Current branch and working direction

- Primary remote branch for this work: `codex/fleetgraph-page-context-schema-fix`
- Stack direction: TypeScript end to end
- Architecture direction: preserve the unified document model, avoid type-specific forks, and prefer simple additive properties over new entity types

## What was created in this session

### 1. Jira-like sprint planning foundation

The following are now implemented in code:

- `story_points` on issues
- `estimate_hours` on issues
- burn-tracking foundation for weeks
- sprint commitment and analytics groundwork
- week analytics API and UI support for burn-up / burn-down work

Important detail:

- story points were **not** set by FleetGraph or a hidden agent
- they were backfilled from existing hour estimates in backend logic/migration

### 2. Issue classification without breaking unified docs

We intentionally kept:

- `document_type = 'issue'`

We added:

- `issue_type`

Current supported `issue_type` values:

- `story`
- `bug`
- `task`
- `spike`
- `chore`

This is the correct Ship model:

- one issue document type
- one classification property
- not separate issue document subtypes

Existing issues are safely defaulted/backfilled to:

- `task`

## Important files changed recently

### Shared types

- `shared/src/types/document.ts`

### Issue and document backend

- `api/src/routes/issues.ts`
- `api/src/routes/documents.ts`
- `api/src/openapi/schemas/issues.ts`
- `api/src/utils/document-crud.ts`
- `api/src/db/migrations/042_story_points_burn_tracking.sql`
- `api/src/db/migrations/043_issue_type_work_items.sql`
- `api/src/db/demoWorkspaceBootstrap.ts`
- `api/src/db/seed.ts`
- `api/src/db/schema.sql`

### Frontend issue and week UI

- `web/src/components/sidebars/IssueSidebar.tsx`
- `web/src/components/IssuesList.tsx`
- `web/src/components/sidebars/PropertiesPanel.tsx`
- `web/src/components/UnifiedEditor.tsx`
- `web/src/pages/UnifiedDocumentPage.tsx`
- `web/src/hooks/useIssuesQuery.ts`
- `web/src/components/week/WeekAnalyticsPanel.tsx`

### FleetGraph and planning docs

- `docs/internal/ROADMAP.md`
- `docs/internal/story-points-burn-tracking-plan.md`
- `docs/internal/fleetgraph-phases/*`

## Current product logic to understand before editing

### Issue logic

- issue updates can flow through both the issue-specific route and the generic document route
- issue properties are flattened for the UI
- issue list filters now include type filtering
- issue UI now shows:
  - `Story Points`
  - `Estimate Hours`
  - `Issue Type`

### Planning logic

- burn-tracking is being built in a Jira-like way, but still aligned to Ship
- points are for sprint planning and burn tracking
- hours are for capacity interpretation
- the next work should preserve that split

### FleetGraph logic

- FleetGraph already has proactive and on-demand foundations
- planning intelligence was expanded to include:
  - scope growth
  - throughput gap
  - staffing pressure
  - dependency risk
- keep reasoning grounded in deterministic signals before LLM reasoning

## Current constraints

- Use TypeScript best practices
- Preserve the unified document architecture
- Do not create a new document type for issue subcategories
- Do not touch unrelated modified docs under:
  - `artifacts-documentation/fleetgraph-execution-assistant/*`
  unless explicitly asked

## Validation standard

Before reporting work complete, run the real checks:

- `pnpm --filter @ship/shared build`
- `pnpm --filter @ship/api build`
- `pnpm --filter @ship/web build`
- `pnpm verify:ci`

## Deployment context

- production deploy was previously blocked by CI
- a TypeScript test typing fix unblocked `verify:ci`
- if deployment behavior is relevant, check GitHub Actions and the production workflow before assuming AWS is the problem

## What the next agent should do

1. Scan the codebase first and summarize the current logic in `shared`, `api`, `web`, and `fleetgraph`
2. Confirm how `issue_type`, `story_points`, and `estimate_hours` currently behave end to end
3. Check whether the next requested feature belongs in:
   - issue properties
   - sprint analytics
   - FleetGraph reasoning
   - UI filters/badges/charts
4. Only then implement the next slice

## Working principle

Prefer small, explicit, additive improvements that strengthen:

- planning clarity
- unified issue modeling
- FleetGraph grounding
- sprint analytics quality

Do not introduce complexity unless it clearly improves the product.
