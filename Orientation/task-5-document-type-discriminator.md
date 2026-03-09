# Task 5: Document Type Discriminator

## Short Answer

The document type discriminator is:

- the `documents.document_type` column in PostgreSQL

It is defined as a PostgreSQL enum named `document_type`, and it tells the application what kind of document a row is.

In TypeScript, the shared package mirrors it as the `DocumentType` union type.

## Where It Is Defined

### Database definition

In `api/src/db/schema.sql`:

- PostgreSQL enum `document_type`
- `documents.document_type document_type NOT NULL DEFAULT 'wiki'`

Current enum values:

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

### TypeScript definition

In `shared/src/types/document.ts`:

- `export type DocumentType = ...`

This mirrors the database enum and gives frontend/backend code a shared discriminator type.

## What the Discriminator Does

The discriminator answers the question:

- "What kind of document is this row?"

Because many entity types share the same `documents` table, the app needs a reliable way to distinguish:

- wiki pages
- issues
- programs
- projects
- weeks
- people
- weekly docs
- standups

`document_type` is that mechanism.

## How It Is Used In Queries

The codebase uses `document_type` in a few repeated query patterns.

### 1. Filtering one logical entity type out of the shared table

This is the most common usage.

Examples:

- `api/src/routes/issues.ts` queries `documents` with `WHERE d.document_type = 'issue'`
- `api/src/routes/projects.ts` queries `documents` with `WHERE d.document_type = 'project'`
- `api/src/routes/weeks.ts` queries `documents` with `WHERE d.document_type = 'sprint'`
- `api/src/routes/programs.ts` queries `documents` with `WHERE d.document_type = 'program'`
- `api/src/routes/search.ts` queries `documents` with `document_type IN ('wiki', 'issue', 'project', 'program')`

This is how the backend turns one physical table into multiple logical entity collections.

## 2. Validating the semantic role of joined documents

The app often joins the `documents` table to itself or to `document_associations`, then uses `document_type` to assert what each joined row is supposed to represent.

Examples:

- join a related row and require `s.document_type = 'sprint'`
- join a related row and require `proj.document_type = 'project'`
- join a related row and require `person_doc.document_type = 'person'`

This matters because IDs in `document_associations` always point back to the same `documents` table. The query needs the discriminator to know whether a related row is being used as:

- a week
- a project
- a person
- an issue

Without the discriminator filter, the join would be structurally valid but semantically ambiguous.

## 3. Selecting type-specific behavior inside generic document routes

The generic document route reads a row first, then branches on `doc.document_type`.

Examples in `api/src/routes/documents.ts`:

- if `doc.document_type === 'project'`, resolve project owner info
- if `doc.document_type === 'sprint'`, resolve owner/person info differently
- if `doc.document_type === 'weekly_plan'` or `weekly_retro`, resolve linked person title
- if `doc.document_type` is one of `issue`, `wiki`, `sprint`, or `project`, attach `belongs_to`

So the discriminator is not only used in SQL. It is also used after query execution to decide how to shape the response.

## 4. Restricting create/update/delete operations to the correct logical type

Many write queries guard against accidental cross-type mutation by including the discriminator in the `WHERE` clause.

Examples:

- update an issue only if `WHERE id = $1 AND workspace_id = $2 AND document_type = 'issue'`
- delete a project only if `WHERE id = $1 AND workspace_id = $2 AND document_type = 'project'`
- fetch a week only if `WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'`

This is a safety boundary. It prevents one route from mutating the wrong logical kind of row.

## 5. Controlling creation in the shared table

When new rows are inserted into `documents`, the app explicitly sets `document_type`.

Examples:

- issues route inserts rows with `document_type = 'issue'`
- programs route inserts rows with `document_type = 'program'`
- weeks route inserts rows with `document_type = 'sprint'`
- generic documents route accepts a validated `document_type` and inserts accordingly

So the discriminator is the first thing that makes a new row "become" a project, issue, week, or wiki doc.

## 6. Aggregation and counting by type

Some queries group by `document_type` to compute counts over mixed document sets.

Example in `api/src/routes/programs.ts`:

- query child documents joined through `document_associations`
- `GROUP BY d.document_type`
- interpret counts differently for `project`, `issue`, and `sprint`

This shows that the discriminator is also used analytically, not just for CRUD filtering.

## 7. Ordering and ranking search results

The search route uses `CASE document_type ...` inside `ORDER BY`.

Example in `api/src/routes/search.ts`:

- issues rank first
- wiki docs next
- then projects
- then programs

That means the discriminator also drives query result ranking and UI-oriented sorting logic.

## 8. Enabling type conversion

The discriminator is updated when a document is converted from one logical type to another.

Examples in `api/src/routes/documents.ts`:

- generic type change path updates `document_type`
- conversion path updates `document_type` in place for issue <-> project conversion

Related behavior:

- when converting to `issue`, the code allocates a ticket number by querying `documents WHERE document_type = 'issue'`
- conversions snapshot old state before changing the type interpretation

This is strong evidence that `document_type` is the core polymorphic switch in the model.

## 9. Supporting indexes and performance

The schema includes indexes that make discriminator-based queries practical:

- `idx_documents_document_type ON documents(document_type)`
- `idx_documents_active ON documents(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL`

There are also type-specific partial indexes such as:

- `idx_documents_person_user_id ... WHERE document_type = 'person'`

So the schema is explicitly optimized for queries that filter by document type.

## Common Query Shapes

Across the codebase, `document_type` appears in these standard patterns:

### Exact type filter

- `WHERE d.document_type = 'issue'`

Used when a route owns one logical entity type.

### Type set filter

- `WHERE document_type IN ('wiki', 'issue', 'project', 'program')`

Used in mixed search/list screens.

### Type-qualified self-join

- `JOIN documents s ON s.id = da.related_id AND s.document_type = 'sprint'`

Used when related rows come from the same table but must play a specific role.

### Group by type

- `SELECT d.document_type, COUNT(*) ... GROUP BY d.document_type`

Used for summaries and counts.

### CASE by type

- `CASE document_type WHEN 'issue' THEN 1 ...`

Used for ranking or custom sort behavior.

### Update guarded by type

- `UPDATE documents ... WHERE id = $1 AND document_type = 'project'`

Used to prevent cross-type writes.

## Relationship To `properties`

`document_type` and `properties` work together.

- `document_type` tells the code which shape to expect
- `properties` holds the type-specific fields for that shape

Examples:

- if `document_type = 'issue'`, then `properties.state` and `properties.priority` matter
- if `document_type = 'project'`, then `properties.impact`, `properties.confidence`, and `properties.ease` matter
- if `document_type = 'sprint'`, then `properties.sprint_number` and `properties.owner_id` matter

So the discriminator does not store all the details itself. It tells the app how to interpret the rest of the row.

## Bottom Line

The document type discriminator is `documents.document_type`, a PostgreSQL enum-backed column mirrored by the shared `DocumentType` TypeScript union.

It is used in queries to:

- filter the shared `documents` table into logical entity types
- validate the role of joined document rows
- guard updates/deletes so routes only affect the correct type
- group and rank mixed document results
- drive type conversion and type-specific application behavior

In practice, `document_type` is the primary switch that makes the unified document model workable.
