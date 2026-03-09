# Task 15: Weakest Points and Improvement Focus

## The 3 weakest points

### 1. The relationship model is still only partially unified

The intended direction is clear: use `document_associations` for program/project/sprint relationships. But the implementation is still mixed.

Evidence:

- schema says to use `document_associations` for relationship queries [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L122)
- `parent_id` still exists as a separate hierarchy mechanism [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L118)
- issue routes still use `relationship_type = 'parent'` in `document_associations` for parent/sub-issue logic [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts#L196)
- weekly plans still document `project_id` as a legacy field [api/src/routes/weekly-plans.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/weekly-plans.ts#L207)
- some team/weekly-plan logic still reads `properties.project_id` instead of associations [api/src/routes/weekly-plans.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/weekly-plans.ts#L963)

Why this is weak:

- the domain graph is harder to reason about because similar relationships are represented in different ways
- query logic becomes route-specific and brittle
- legacy compatibility leaks into new code paths

Where I would focus improvement:

- finish the migration to one authoritative relationship model
- reserve `parent_id` only for true containment, or remove overlap with `relationship_type='parent'`
- stop storing project/program membership in JSON properties for new logic
- add one shared relationship access layer so routes stop rebuilding graph logic ad hoc

### 2. Collaborative document state has too many sources of truth

The collaboration system is strong, but it is also the most fragile part of the codebase.

Evidence:

- the backend persists both `yjs_state` and `content` for the same document [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L169)
- it can regenerate Yjs state from JSON content on demand [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L202)
- it must invalidate in-memory docs and disconnect clients when REST updates happen [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L448)
- the frontend keeps another cached copy in IndexedDB and has custom cache-clear handling [web/src/components/Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx#L293)

Why this is weak:

- there are too many representations of “current document state”: DB JSON, DB Yjs binary, in-memory `Y.Doc`, browser IndexedDB, and live WebSocket state
- the system already needs custom close codes and cache-clearing messages to stay coherent
- this is the kind of area where subtle data loss or stale-content bugs appear

Where I would focus improvement:

- choose a clearer authority model for editor content
- for collaborative docs, make one representation canonical and derive the others in a more controlled way
- narrow the number of REST paths that can mutate collaborative content
- add stronger invariants and integration tests specifically around REST-edit plus WebSocket-edit interaction

### 3. The `shared/` contract layer is useful, but not authoritative enough

The repo has the right shape, but the actual type-sharing boundary is inconsistent.

Evidence:

- backend depends on built `shared/dist` via TS path mapping [api/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/tsconfig.json#L2)
- frontend references `../shared`, but still defines many overlapping local types [web/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/tsconfig.json#L20)
- `shared/` defines `ApiResponse` [shared/src/types/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/api.ts#L2), while `web/src/lib/api.ts` defines another `ApiResponse` [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L5)
- `shared/` defines workspace types [shared/src/types/workspace.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/workspace.ts#L3), while `web/src/lib/api.ts` defines another local `Workspace` shape [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L227)

Why this is weak:

- shared types help, but they do not fully prevent drift between frontend and backend contracts
- build/test reliability depends on build order for `shared/dist`
- developers still have to guess whether a type belongs in `shared/` or in a local file

Where I would focus improvement:

- decide whether `shared/` is truly the source of truth for API/domain contracts
- if yes, move more response/request DTOs there or generate them from OpenAPI/Zod
- remove duplicated local contract types where possible
- make package wiring less fragile so tests and builds do not depend on implicit prior compilation

## Bottom line

The weakest points are:

1. incomplete relationship consolidation
2. too many sources of truth in collaborative content state
3. partial contract sharing between `web/`, `api/`, and `shared/`

If I had to pick one improvement area first, I would start with the relationship model. It affects the most features, leaks legacy assumptions into new code, and makes the rest of the system harder to simplify.
