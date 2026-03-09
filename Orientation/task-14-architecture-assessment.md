# Task 14: Architecture Assessment

## The 3 strongest architectural decisions

### 1. The unified document model

This is the strongest decision in the codebase.

Evidence:

- one `documents` table for wiki, issue, program, project, sprint, person, and weekly artifacts [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L105)
- `document_type` as the discriminator [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L98)
- JSONB `properties` for type-specific fields [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L126)
- `document_associations` for program/project/sprint membership [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L208)
- the same model is mirrored in TypeScript in [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts#L33)

Why it is strong:

- it matches the product directly: Ship really is “everything is a document”
- it avoids building separate subsystems for wiki, issues, projects, and weeks
- it enables conversions and shared UI patterns because the underlying entity shape is already aligned
- it keeps the schema flexible without losing key relational structure like parent-child and associations

This decision gives the codebase one center of gravity instead of several competing domain models.

### 2. A boring monorepo split: `web/`, `api/`, and `shared/`

Evidence:

- root workspace scripts explicitly treat the repo as three coordinated packages [package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/package.json#L11)
- backend compiles against `shared/dist` [api/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/tsconfig.json#L2)
- frontend references the `shared/` project directly [web/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/tsconfig.json#L20)

Why it is strong:

- it keeps the runtime architecture simple: one frontend, one API, one shared contract package
- it centralizes important domain types and constants without pretending everything must be shared
- it avoids microservice overhead while still preserving clear package boundaries
- it makes coordinated refactors practical, especially around document types, auth constants, and API-facing shapes

This is a good “high-leverage boring” decision: simple enough to operate, but structured enough to keep drift under control.

### 3. Real-time collaboration is isolated to the editor layer, not the whole app

Evidence:

- the server keeps per-room `Y.Doc` instances, persists them to Postgres, and serves them over WebSocket [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L88)
- the client editor uses `Y.Doc`, `IndexeddbPersistence`, and `WebsocketProvider` together [web/src/components/Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx#L194)
- the API explicitly invalidates collaboration cache when REST updates happen [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L448)
- WebSocket auth and visibility checks are enforced before joining a collaboration room [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L346)

Why it is strong:

- collaborative editing is inherently complex, and this design contains that complexity to the document body/editor path
- the rest of the application can stay conventional: REST, Postgres, explicit queries, explicit mutations
- it still gives the product the hard capability it needs: multi-user rich-text editing with local cache and server sync
- it shows practical engineering judgment: use CRDTs where they matter, not as the data model for the whole app

This is a strong boundary decision. The codebase gets real-time collaboration without turning the entire system into a distributed state problem.

## Bottom line

The three strongest decisions are:

1. the unified document model
2. the monorepo split with a real `shared/` contract layer
3. isolating real-time collaboration to the editor/document-sync path

They are strong because they reduce conceptual fragmentation. All three push the system toward one domain model, one repository, and one contained place where the hardest state-synchronization logic lives.
