# ShipShape Clone System Architecture Diagrams

## Purpose

This companion document gives the application factory an accurate visual model of ShipShape's architecture.

Use it together with:

- `SHIPSHAPE_CLONE_PRODUCT_VISION.md`
- `SHIPSHAPE_CLONE_PRD.md`
- `SHIPSHAPE_CLONE_TECHNICAL_SPEC.md`

The factory output should not resemble a generic work-queue app. It should resemble a unified execution workspace with canonical document pages, collaborative editing, weekly operating rhythms, accountability workflows, and bounded AI assistance.

## How To Use This Document

1. Use the diagrams here to define the major subsystems before generating screens.
2. Use the user-flow diagrams in `SHIPSHAPE_CLONE_USER_FLOW_DIAGRAMS.md` to derive wireframes and route transitions.
3. Preserve the unified document model. Do not split wiki, issue, project, and week into unrelated page systems.

## Diagram 1: End-To-End Runtime Architecture

```mermaid
flowchart LR
    subgraph Client["Client Browser"]
        Shell["App shell\nleft nav + top context + providers"]
        Routes["Route surfaces\nDashboard, My Week, Docs, Issues,\nProjects, Programs, Team, Analytics, Settings"]
        DocPage["Canonical document page\neditor + tabs + side panels"]
        Query["Server-state cache\nTanStack Query + IndexedDB"]
        YCache["Local editor cache\nYjs + IndexedDB"]
        Toasts["Realtime feed + toast client"]
    end

    subgraph Server["Node Backend"]
        API["HTTP API\nREST routes by domain"]
        Collab["Collaboration WebSocket\nYjs rooms + awareness"]
        Events["Realtime events WebSocket\nnotifications + refresh events"]
        Jobs["Background jobs\naccountability, reminders, proactive AI"]
    end

    subgraph Data["Stateful Services"]
        DB["PostgreSQL\ncore source of truth"]
        Files["Object storage\nattachments and uploads"]
        Models["AI services\nplan, retro, FleetGraph reasoning"]
    end

    Shell --> Routes
    Routes --> Query
    Routes --> DocPage
    DocPage --> YCache
    Toasts --> Events
    Routes --> API
    DocPage --> Collab

    API --> DB
    API --> Files
    API --> Models
    Collab --> DB
    Jobs --> DB
    Jobs --> Models
    Jobs --> Events
```

**Implementation implications**

- The product is a single-page app, not a collection of unrelated static pages.
- Collaborative editing and general notifications are separate realtime channels.
- The backend is a modular monolith that owns HTTP, collaboration, background work, and AI orchestration.

## Diagram 2: Frontend Information Architecture

```mermaid
flowchart TD
    App["Authenticated app shell"]

    App --> Dashboard["Dashboard"]
    App --> MyWeek["My Week"]
    App --> Analytics["Analytics"]
    App --> Docs["Documents"]
    App --> Issues["Issues"]
    App --> Projects["Projects"]
    App --> Programs["Programs"]
    App --> Team["Team"]
    App --> Settings["Settings"]

    Docs --> DocRoute["Canonical detail route\n/documents/:id/*"]
    Issues --> DocRoute
    Projects --> DocRoute
    Programs --> DocRoute
    Team --> PersonRoute["Person detail route\n/team/:id or /documents/:id"]

    DocRoute --> ProgramTabs["Program tabs\nOverview, Issues, Projects, Weeks"]
    DocRoute --> ProjectTabs["Project tabs\nIssues, Details, Weeks, Retro"]
    DocRoute --> WeekTabsPlanning["Week planning tabs\nOverview, Analytics, Plan"]
    DocRoute --> WeekTabsActive["Week active or completed tabs\nOverview, Analytics, Issues, Review, Standups"]
    DocRoute --> DirectEditor["Direct editor types\nWiki, Issue, Person, Weekly Plan,\nWeekly Retro, Standup, Weekly Review"]

    Team --> Allocation["Team Allocation"]
    Team --> Directory["Team Directory"]
    Team --> Status["Team Status"]
    Team --> Reviews["Team Reviews"]
    Team --> OrgChart["Org Chart"]
```

**Wireframe implications**

- The navigation shell needs persistent primary navigation and route-aware context.
- Most entity detail views should reuse one document-page frame rather than bespoke pages.
- The document page needs a shared editor area plus type-specific tabs and context sidebars.

## Diagram 3: Unified Document Model And Typed Relationships

```mermaid
flowchart LR
    Base["Document base record\nid, workspace_id, document_type,\ntitle, content, properties,\nparent_id, visibility, position"]

    Base --> Wiki["Wiki"]
    Base --> Issue["Issue"]
    Base --> Program["Program"]
    Base --> Project["Project"]
    Base --> Week["Week"]
    Base --> Person["Person"]
    Base --> WeeklyPlan["Weekly Plan"]
    Base --> WeeklyRetro["Weekly Retro"]
    Base --> Standup["Standup"]
    Base --> WeeklyReview["Weekly Review"]

    Program --> ProgramIssues["Program contains issues"]
    Program --> ProgramProjects["Program contains projects"]
    Program --> ProgramWeeks["Program contains weeks"]

    Project --> ProjectIssues["Project groups issues"]
    Project --> ProjectRetro["Project retro validates hypothesis"]

    Week --> WeekIssues["Week groups issues"]
    Week --> WeekReview["Week has review document"]
    Week --> WeekStandups["Week exposes standup stream"]

    Person --> PersonPlans["One weekly plan per person per week"]
    Person --> PersonRetros["One weekly retro per person per week"]
    Person --> PersonStandups["Many standups over time"]

    Issue --> Assignee["Assigned to person"]
    Issue --> Source["Source can be internal,\nexternal, or action_item"]
    Issue --> Associations["Can belong to program,\nproject, week, and parent issue"]
```

**Implementation implications**

- All core content types must share the same storage and editor model.
- Program, project, week, and issue associations are relationships inside one document system.
- Weekly plans, weekly retros, standups, and reviews are first-class documents, not ad hoc text fields.

## Diagram 4: Document Collaboration Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant SPA as Browser SPA
    participant Cache as IndexedDB caches
    participant API as HTTP API
    participant WS as Collaboration WebSocket
    participant DB as PostgreSQL

    User->>SPA: Open canonical document page
    SPA->>API: Fetch document metadata, tab context, comments, associations
    SPA->>Cache: Load cached query data and local Yjs state
    SPA->>WS: Join document room
    WS->>DB: Read persisted Yjs snapshot if needed
    WS-->>SPA: Sync CRDT state and peer presence
    User->>SPA: Edit rich text
    SPA->>WS: Send Yjs updates
    WS-->>SPA: Broadcast remote updates and cursors
    WS->>DB: Persist debounced Yjs snapshot
    User->>API: Upload file, add comment, or change properties
    API->>DB: Persist metadata change
    API-->>SPA: Return updated sidebar state
```

**Wireframe implications**

- The document page needs an editor region, presence affordances, and metadata surfaces that can update independently.
- Comments, files, relationships, and properties are not editor plugins alone; they are adjacent document systems.
- The clone should feel realtime and collaborative even before adding advanced AI.

## Diagram 5: FleetGraph And AI Runtime Architecture

```mermaid
flowchart TD
    CurrentPage["Current page in Ship"]
    UserAsk["User asks FleetGraph from drawer"]
    Trigger["Scheduled sweep or Ship event trigger"]

    CurrentPage --> Context["Current-view context builder"]
    UserAsk --> Context

    Context --> OnDemand["On-demand invoke route"]
    Trigger --> Proactive["Proactive trigger route"]

    OnDemand --> SharedGraph["Shared FleetGraph graph"]
    Proactive --> SharedGraph

    SharedGraph --> ContextNodes["Context nodes\nwho, where, role, scope"]
    ContextNodes --> FetchNodes["Fetch nodes\nparallel Ship data fetches"]
    FetchNodes --> SignalNodes["Deterministic signal derivation"]
    SignalNodes --> Reasoning["Reasoning node\ncurrent-view or sprint analysis"]

    Reasoning --> Branch{"Worth surfacing?"}
    Branch -- No --> Quiet["Quiet completion"]
    Branch -- Yes --> Action["Action proposal"]

    Action --> HITL{"Consequential action?"}
    HITL -- No --> Delivery["Return answer or proactive finding"]
    HITL -- Yes --> Approval["Human approval gate"]
    Approval --> Resume["Resume route"]
    Resume --> Delivery

    Delivery --> APIResult["UI response, finding record,\nroute suggestions, telemetry"]
    Delivery --> EventPush["Realtime toast or feed notification"]
```

**Implementation implications**

- On-demand and proactive modes share one graph architecture.
- AI is contextual and bounded, not a separate chat product.
- Human approval must interrupt consequential actions before execution.

## Diagram 6: Deployment Topology

```mermaid
flowchart LR
    User["End user browser"]
    CDN["CDN or edge static host\nserves SPA assets"]
    App["Application service\nHTTP API + WebSockets + jobs"]
    DB["PostgreSQL"]
    Storage["S3-compatible object storage"]
    Secrets["Secret manager / env config"]
    AI["AI providers"]

    User --> CDN
    User --> App
    CDN --> User
    App --> DB
    App --> Storage
    App --> Secrets
    App --> AI
```

**Implementation implications**

- The first release can be a single backend service plus PostgreSQL and object storage.
- The collaboration WebSocket and events WebSocket can run inside the same application process initially.
- This is a pragmatic modular monolith, not a microservices-first system.

## Diagram 7: Recommended Backend Module Boundaries

```mermaid
flowchart LR
    API["API application"]

    API --> Auth["Auth and sessions"]
    API --> Workspace["Workspaces, members, invites, tokens"]
    API --> Documents["Documents and relationships"]
    API --> Issues["Issues and bulk actions"]
    API --> Programs["Programs and public feedback"]
    API --> Projects["Projects and retros"]
    API --> Weeks["Weeks, plans, reviews, standups, analytics"]
    API --> Team["Allocation, directory, org chart, reviews"]
    API --> Comments["Comments and mentions"]
    API --> Files["Files and uploads"]
    API --> Search["Search and command palette lookup"]
    API --> Dashboard["Dashboard and accountability surfaces"]
    API --> AI["Plan, retro, FleetGraph"]
    API --> Admin["Audit logs and platform administration"]
```

**Implementation implications**

- Keep API boundaries explicit by domain.
- Preserve the distinction between execution workflows, people workflows, and AI workflows.
- Resist collapsing everything into a single generic "tasks" module.
