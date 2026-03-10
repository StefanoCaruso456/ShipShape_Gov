# Mermaid Patterns Reference

## System architecture template

```mermaid
flowchart LR
  User[User] --> Web[Web App]
  Web --> API[API Server]
  API --> DB[(Database)]
  API --> Realtime[Realtime Service]
  Web <--> Realtime
```

## Package relationship template

```mermaid
flowchart TD
  web[web/] --> shared[shared/]
  web --> api[api/]
  e2e[e2e/] --> web
  e2e --> api
  api --> db[api/src/db]
```

## Request flow template

```mermaid
flowchart TD
  A[User clicks Save] --> B[React Component]
  B --> C[POST /api/resource]
  C --> D[Service Layer]
  D --> E[(Database)]
  E --> D
  D --> C
  C --> B
  B --> F[UI updates]
```

## Data model template

```mermaid
erDiagram
  DOCUMENTS ||--o{ RELATIONSHIPS : links
  DOCUMENTS {
    string id
    string document_type
    string title
  }
  RELATIONSHIPS {
    string parent_id
    string child_id
    string relation_type
  }
```

## Realtime flow template

```mermaid
flowchart LR
  UserA[Client A] <--> WS[WebSocket Server]
  UserB[Client B] <--> WS
  UserA --> YA[Yjs Doc]
  UserB --> YB[Yjs Doc]
  WS --> Persist[(Persistence)]
```

## Style guidance
- Use `flowchart TD` for step-by-step flows.
- Use `flowchart LR` for high-level component maps.
- Use `erDiagram` only when entities and relationships are well supported.
- Keep node labels consistent with repo terminology.
- Prefer 5-12 nodes per diagram.
