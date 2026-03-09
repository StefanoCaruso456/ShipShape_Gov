# Task 16: What I Would Tell a New Engineer First

If I had one sentence to start with, it would be:

**This is a unified-document monolith. Do not think of it as a wiki app plus an issue tracker plus a sprint tool. Think of it as one document graph with different views and workflows layered on top.**

## The first things I would tell them

### 1. Start with the document model, not the UI

Before touching features, understand:

- the `documents` table in [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L105)
- the shared document types in [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts#L33)

That is the real center of the system. Programs, projects, weeks, issues, wiki pages, and weekly artifacts are all variations of that same base model.

### 2. Learn the two execution paths separately

Most of the app is conventional:

- React frontend
- Express REST API
- raw SQL against Postgres

But the editor body is different:

- TipTap
- Yjs
- WebSocket
- IndexedDB cache

So I would tell them to keep two mental models:

- **normal app state**: REST + TanStack Query
- **editor collaboration state**: Yjs + WebSocket + IndexedDB

The collaboration path is implemented in:

- [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts#L606)
- [web/src/components/Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx#L285)

### 3. Assume some architectural drift and verify in code

I would warn them early that some docs and some code paths reflect an ongoing migration:

- relationships are moving toward `document_associations`
- some flows still use `parent_id`
- some legacy logic still reads `properties.project_id`
- some shared types still have local duplicates in `web/`

So when in doubt:

- trust current schema, current routes, and current tests over older prose docs
- trace one real request end to end before changing a feature

## Where I would have them read first

In order:

1. [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql)
2. [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts)
3. [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts)
4. [web/src/hooks/useIssuesQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useIssuesQuery.ts)
5. [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts)
6. [web/src/components/Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx)

That sequence teaches:

- the data model
- the shared contract
- a normal REST feature path
- the special real-time editor path

## Bottom line

The first thing I would teach is not a command or a folder layout. It is the system’s core idea:

**everything important is a document, and almost every feature is either a query over that document graph or an editor/view over it.**

Once a new engineer internalizes that, the rest of the codebase becomes much easier to navigate.
