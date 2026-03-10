# Diagram Types Reference

## System architecture
Use for the high-level shape of the system.

Show:
- frontend
- backend
- database
- shared libraries
- infra/external services

Use when the question is "How is this system organized?"

## Package relationship diagram
Use for monorepos or multi-package repos.

Show:
- top-level packages
- which package depends on which
- shared type or utility packages
- tests and infra as supporting packages

Use when the question is "How do the repo folders fit together?"

## Request flow diagram
Use for a concrete user action.

Show:
- user action
- UI component
- API route
- service layer
- DB/query layer
- response/update path

Use when the question is "What happens when a user does X?"

## Data model diagram
Use when there are migrations, schemas, ORM models, SQL, or rich domain types.

Show:
- core entities
- relationships
- discriminators / type columns
- join or association structures

Use when the question is "How is the data shaped?"

## Realtime flow diagram
Use when the system has:
- WebSockets
- server-sent events
- pub/sub
- CRDTs
- presence / collaboration

Show:
- connection establishment
- sync/update path
- persistence path
- reconnect/conflict handling if visible

Use when the question is "How do clients stay in sync?"
