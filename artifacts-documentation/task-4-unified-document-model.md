# Task 4: How the Unified Document Model Works

## Short Answer

One table serves docs, issues, projects, and weeks because the system treats them all as the same base object:

- one row in `documents`
- one discriminator column: `document_type`
- one shared content shape: `title`, `content`, `yjs_state`
- one flexible JSONB payload: `properties`
- one shared relationship table: `document_associations`

The app does not create separate `issues`, `projects`, `wiki_pages`, or `weeks` tables. Instead, it stores all of them in `documents` and interprets each row differently based on `document_type`.

## The Core Mechanism

The `documents` table provides a common base schema for every major content entity:

- identity: `id`, `workspace_id`
- type: `document_type`
- shared presentation: `title`
- shared rich text body: `content`
- shared collaboration state: `yjs_state`
- shared hierarchy: `parent_id`, `position`
- shared lifecycle: `created_at`, `updated_at`, `created_by`, `archived_at`, `deleted_at`
- shared visibility: `visibility`
- flexible type-specific payload: `properties`

That means a wiki page, issue, project, and week all start from the same database shape.

## What Makes Each Type Different

The row's meaning comes from three things working together:

1. `document_type`

- tells the app what kind of thing the row is

2. `properties`

- stores the type-specific fields for that kind of document

3. `document_associations`

- stores organizational relationships like program/project/week membership

## Current Main Types

The current shared type layer and schema treat these as valid document kinds:

- `wiki`
- `issue`
- `program`
- `project`
- `sprint`
- `person`
- `weekly_plan`
- `weekly_retro`
- `standup`
- `weekly_review`

For the question you asked, the important subset is:

- docs/wiki pages
- issues
- projects
- sprints/weeks

## How a Wiki Doc Uses the Table

A wiki document is the simplest case.

Typical pattern:

- `document_type = 'wiki'`
- most meaning lives in `title` and `content`
- optional metadata lives in `properties`
- hierarchy can use `parent_id`

So a wiki page is basically:

- a generic document row
- with prose-heavy content
- and little or no workflow state

## How an Issue Uses the Same Table

An issue is still the same base row, but the app reads a different `properties` shape.

Typical issue data:

- `document_type = 'issue'`
- `ticket_number` is used
- `properties.state`
- `properties.priority`
- `properties.assignee_id`
- `properties.estimate`
- `properties.source`
- issue status timestamps like `started_at`, `completed_at`, `cancelled_at`

Relationships such as program, project, sprint, and parent issue are not stored in issue-specific columns anymore. They come from `document_associations`.

So an issue is:

- a document row
- plus workflow fields in `properties`
- plus issue-specific relationships in `document_associations`

## How a Project Uses the Same Table

A project is also just a document row interpreted differently.

Typical project data:

- `document_type = 'project'`
- `properties.impact`
- `properties.confidence`
- `properties.ease`
- `properties.color`
- `properties.emoji`
- `properties.owner_id`
- `properties.accountable_id`
- `properties.plan`
- `properties.target_date`
- approval fields like `properties.plan_approval` and `properties.retro_approval`

Its program membership is stored through `document_associations`.

So a project is:

- the same document base
- with prioritization, ownership, and plan metadata in `properties`
- and higher-level organization through associations

## How a Week/Sprint Uses the Same Table

Weeks are stored as documents whose historical database name is still `sprint`.

Typical week data:

- `document_type = 'sprint'`
- `properties.sprint_number`
- `properties.owner_id`
- `properties.status`
- `properties.plan`
- `properties.success_criteria`
- `properties.confidence`
- `properties.plan_approval`
- `properties.review_approval`

Its project and program links are stored in `document_associations`.

Important detail:

- the actual date window is mostly derived from `workspaces.sprint_start_date` plus `properties.sprint_number`
- the row represents the explicit week document, not a fully separate calendar table

So a week is:

- still a document row
- with week-specific planning/accountability fields in `properties`
- and project/program placement via associations

## The Shared Base vs Type-Specific Overlay

The model works because every type shares a stable base, then layers type-specific semantics on top.

### Shared by all document types

- `id`
- `workspace_id`
- `title`
- `content`
- `yjs_state`
- `created_at`
- `updated_at`
- `created_by`
- `visibility`
- `archived_at`
- `deleted_at`

### Varies by document type

- the allowed keys inside `properties`
- how the API validates those keys
- which associations are expected
- which routes transform the row for the frontend

## How the Backend Actually Uses It

The backend does not use one giant generic route for everything in practice. Instead, it has specialized routes that all query the same `documents` table.

Examples:

- `api/src/routes/documents.ts` lists generic documents from `documents`
- `api/src/routes/issues.ts` queries `documents` filtered by `document_type = 'issue'`
- `api/src/routes/projects.ts` queries `documents` filtered by `document_type = 'project'`
- `api/src/routes/weeks.ts` queries `documents` filtered by `document_type = 'sprint'`

Each route:

- filters by `document_type`
- reads type-specific fields out of `properties`
- joins or looks up `document_associations`
- returns a shaped response for the frontend

So the specialization happens in application code, not in separate tables.

## Example of the Same Table Being Interpreted Four Ways

### Wiki row

- `document_type = 'wiki'`
- read `title`, `content`
- maybe `parent_id`

### Issue row

- `document_type = 'issue'`
- read `properties.state`, `properties.priority`, `properties.assignee_id`
- include `ticket_number`
- look up belongs-to associations

### Project row

- `document_type = 'project'`
- read `properties.impact`, `properties.confidence`, `properties.ease`
- compute ICE score
- look up program association

### Week row

- `document_type = 'sprint'`
- read `properties.sprint_number`, `properties.owner_id`, `properties.plan`
- derive dates from workspace start date
- look up project/program associations

## Why `document_associations` Matters

The unified table would break down if every type needed different FK columns.

The project avoids that by moving most organizational relationships into `document_associations`.

That table lets one document belong to:

- a program
- a project
- a week
- a parent document

without changing the base `documents` table for each new case.

This is what makes the single-table model scalable.

## Why JSONB `properties` Matters

The other half of the design is `properties JSONB`.

Without `properties`, the table would need many nullable columns like:

- `issue_state`
- `issue_priority`
- `project_impact`
- `project_owner_id`
- `sprint_number`
- `sprint_confidence`

That would turn the table into a sparse, hard-to-evolve mess.

Instead:

- shared fields stay as normal columns
- type-specific fields live in `properties`
- TypeScript and route-level validation define the expected shape

So the model is relational at the core, but schema-flexible at the type edge.

## Why Rich Text Is Shared Across Types

Another important design choice is that content is shared too.

All of these can carry document content:

- wiki pages
- issues
- projects
- weeks

That is why `content` and `yjs_state` live on the base row rather than in a separate docs-only table.

This allows:

- an issue to have a real narrative body, not just a short title
- a project to contain a plan or hypothesis narrative
- a week to contain planning and review content
- a wiki page to use the exact same editor infrastructure

## Strong Proof That This Is a Real Unified Model

The strongest proof is type conversion.

This codebase supports converting between document types like:

- issue -> project
- project -> issue

That only works cleanly because both are already the same base entity in the same table.

Instead of moving data across unrelated tables, the system can:

- keep the same underlying document identity
- snapshot previous state
- change how the row is interpreted

That is a direct consequence of the unified model.

## Tradeoffs

### Benefits

- one editor/content model for many entity types
- fewer tables and fewer schema migrations for new document kinds
- shared collaboration, visibility, archival, history, and conversion behavior
- flexible relationships through `document_associations`

### Costs

- more application logic is needed to interpret rows correctly
- many important relationships are soft, not hard foreign keys
- `properties` correctness depends on code conventions and validation
- querying can be less obvious than a fully normalized design

## Bottom Line

One table serves docs, issues, projects, and sprints because the system models them as variations of the same thing:

- a document with shared identity, content, lifecycle, and visibility

Then it specializes each row through:

- `document_type` for category
- `properties` for type-specific fields
- `document_associations` for relationships

So the answer is not that the table somehow behaves differently at the database level. It is that the application deliberately interprets the same base row through different schemas and workflows.
