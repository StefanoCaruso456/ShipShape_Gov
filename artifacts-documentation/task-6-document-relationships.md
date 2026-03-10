# Task 6: How Document Relationships Are Handled

## Short Answer

The application handles document relationships through multiple mechanisms, not one:

1. `document_associations`

- for organizational membership like program, project, and week assignment

2. `parent_id`

- for direct containment hierarchy on documents

3. `document_links`

- for explicit cross-document linking and backlinks

4. `properties` JSON references

- for a smaller set of soft relationships like person/user linkage or ownership metadata

The most important operational pattern today is:

- organizational relationships use `document_associations`

## Relationship Mechanisms

## 1. Organizational membership: `document_associations`

This is the main relationship system for:

- program membership
- project membership
- week membership
- some parent/sub-issue relationships

### Table shape

In `api/src/db/schema.sql`, the table is:

- `document_id`
- `related_id`
- `relationship_type`
- `metadata`

Allowed relationship types:

- `program`
- `project`
- `sprint`
- `parent`

### How it is used

The app uses this table to answer questions like:

- which project does this issue belong to?
- which week is this issue assigned to?
- which program contains this project?
- which issues belong to this project?

Typical query patterns:

- `EXISTS (...) WHERE da.document_id = d.id AND da.related_id = $x AND da.relationship_type = 'project'`
- `JOIN document_associations da ON da.document_id = d.id AND da.related_id = $x AND da.relationship_type = 'sprint'`
- `LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'`

### API shape

At the API level, these relationships are exposed as `belongs_to`.

Examples:

- an issue can be created with `belongs_to: [{ id, type: 'project' }, { id, type: 'sprint' }]`
- the backend writes those into `document_associations`
- reads hydrate them back into `belongs_to` arrays with `id`, `type`, and optional display info

### Central helpers

`api/src/utils/document-crud.ts` contains the shared helpers for this model:

- `getBelongsToAssociations`
- `getBelongsToAssociationsBatch`
- `syncBelongsToAssociations`
- `addBelongsToAssociation`
- `removeBelongsToAssociation`
- `removeAssociationsByType`

That file is the clearest implementation proof that the junction table is the intended source of truth for membership-style relationships.

## 2. Parent-child hierarchy: `parent_id`

There is still a direct hierarchy column on `documents`:

- `documents.parent_id`

This is the containment relationship.

It is used when one document is structurally inside another document.

Examples from the docs and routes:

- nested wiki documents
- weekly plan under a week document
- weekly retro under a week document

### Database behavior

`parent_id` is a self-referencing foreign key:

- `parent_id UUID REFERENCES documents(id) ON DELETE CASCADE`

There is also a trigger to prevent circular parent references.

So this mechanism gives the app:

- true tree hierarchy
- cascading deletes
- cycle protection

### Where the app writes it

The generic documents route uses `parent_id` directly:

- create document with `parent_id`
- patch document and update `parent_id`

This is the cleanest direct implementation of containment.

## 3. Parent-child also appears in `document_associations`

This is the main nuance.

Although `parent_id` exists and the convention docs say it is the hierarchy field, parts of the app also use:

- `document_associations` with `relationship_type = 'parent'`

for parent/sub-issue and context-tree operations.

Examples:

- `api/src/routes/issues.ts` checks child issues via `document_associations ... relationship_type = 'parent'`
- `api/src/routes/associations.ts` builds ancestor/child context using recursive queries over `document_associations`
- `getBelongsToAssociations()` can return `type: 'parent'`

### Objective conclusion

Parent-child handling is currently split:

- `parent_id` is still the direct containment column in the schema
- some application features also model parent relationships in `document_associations`

So the codebase has a mixed hierarchy model in practice, even though the architectural direction favors a cleaner distinction.

## 4. Explicit linking and backlinks: `document_links`

This is separate from hierarchy and membership.

`document_links` exists for:

- “this document links to that document”
- backlinks

Table shape:

- `source_id`
- `target_id`

Both columns reference `documents.id`.

### How it works

The backlinks route handles this explicitly:

- `GET /api/documents/:id/backlinks`
- `POST /api/documents/:id/links`

The update flow:

- verifies source and target docs are visible in the workspace
- deletes existing `document_links` rows for the source
- inserts the new `(source_id, target_id)` pairs

The read flow:

- finds documents where `document_links.target_id = :id`
- joins back to `documents` to return backlink metadata

This relationship is:

- not hierarchical
- not membership-based
- just a graph edge for navigation/reference

## 5. Soft references in `properties`

Some relationships are stored as IDs inside `documents.properties` instead of formal relational edges.

Examples:

- person document -> auth user via `properties.user_id`
- week owner via `properties.owner_id`
- issue assignee via `properties.assignee_id`
- weekly plan/retro -> person via `properties.person_id`
- weekly review -> week via `properties.sprint_id`

These are application-level relationships, but they are not modeled through `document_associations` and usually are not foreign-key enforced.

So they should be treated as:

- typed metadata references
- not the main graph structure

## Relationship Type by Use Case

### Linking

Use:

- `document_links`

Behavior:

- many-to-many reference graph
- source document can link to many targets
- target document can have many backlinks

### Parent-child containment

Use:

- `documents.parent_id`

Behavior:

- true containment
- child sits under a parent
- cascading delete
- cycle protection

Important caveat:

- some parts of the app also mirror or query parent relationships through `document_associations`

### Project membership

Use:

- `document_associations` with `relationship_type = 'project'`

Behavior:

- issues belong to projects
- weeks belong to projects
- project-scoped queries join through the association table

### Program membership

Use:

- `document_associations` with `relationship_type = 'program'`

Behavior:

- projects belong to programs
- weeks belong to programs
- issues can also carry a direct program association

### Week assignment

Use:

- `document_associations` with `relationship_type = 'sprint'`

Behavior:

- issues can be assigned to a week
- standups can be associated to a week
- weekly reviews can be associated to a week

## How Reads Work

The read pattern is usually one of these:

### Membership read

- join `document_associations`
- filter by `relationship_type`
- join back to `documents`

Example:

- list project issues
- list weeks in a program
- list a document’s `belongs_to`

### Hierarchy read

- either query `documents.parent_id`
- or query `document_associations` with `relationship_type = 'parent'`

Example:

- nested documents
- sub-issue checks
- breadcrumb/context trees

### Backlink read

- query `document_links` by `target_id`
- join `documents` on `source_id`

## How Writes Work

### Creating/updating membership relations

Usually done by:

- `belongs_to` payloads
- direct association endpoints
- route-specific insert/delete logic

Common pattern:

- delete or replace old association rows
- insert `(document_id, related_id, relationship_type)`
- use `ON CONFLICT DO NOTHING`

### Creating/updating containment

Usually done by:

- setting `parent_id` in document create/update routes

### Creating/updating explicit links

Done by:

- replacing the source document’s `document_links` rows through `/api/documents/:id/links`

## What the Architecture Docs Say

`docs/document-model-conventions.md` states the intended distinction clearly:

- `parent_id` for true containment hierarchy
- `document_associations` for organizational many-to-many relationships

That is the clean conceptual model.

## What the Code Actually Does

The code mostly follows that model for:

- program membership
- project membership
- week assignment
- backlinks

But hierarchy is not perfectly unified yet because:

- `parent_id` still exists and is written directly
- some issue/context features use `document_associations` with `relationship_type = 'parent'`

So the practical answer is:

- project/program/week relationships are handled through `document_associations`
- explicit linking is handled through `document_links`
- containment uses `parent_id`
- but parent-child issue/context behavior still has some overlap with `document_associations`

## Bottom Line

The application handles document relationships with a layered approach:

1. `document_associations` for organizational membership like program, project, and week
2. `parent_id` for containment hierarchy
3. `document_links` for explicit cross-document links and backlinks
4. `properties` for soft metadata references

If the question is specifically “how does the app handle project membership?”, the answer is:

- through `document_associations`
- surfaced as `belongs_to`
- queried with `relationship_type = 'project'`

If the question is specifically “how does the app handle parent-child?”, the answer is:

- conceptually through `parent_id`
- but some code paths also use `document_associations` with `relationship_type = 'parent'`, so that area is still somewhat transitional.
