# ShipShape Clone User Flow Diagrams

## Purpose

This companion document translates the audited product into concrete user flows the factory can turn into route maps, wireframes, and interaction states.

Use it together with:

- `SHIPSHAPE_CLONE_PRODUCT_VISION.md`
- `SHIPSHAPE_CLONE_PRD.md`
- `SHIPSHAPE_CLONE_TECHNICAL_SPEC.md`
- `SHIPSHAPE_CLONE_SYSTEM_ARCHITECTURE_DIAGRAMS.md`

## How To Use This Document

1. Treat each diagram as a required product journey, not a nice-to-have.
2. Use the "Screens implied" notes after each diagram to derive wireframes.
3. Preserve the weekly and accountability rhythms. ShipShape is not just CRUD over tasks.

## Flow 1: First-Time Setup, Login, And Workspace Entry

```mermaid
flowchart TD
    Start["User opens app"] --> FirstRun{"Platform already initialized?"}
    FirstRun -- No --> Setup["Run first-user setup"]
    Setup --> CreateWorkspace["Create initial workspace"]
    CreateWorkspace --> CreateProfile["Create initial person profile"]
    CreateProfile --> SeedDemo{"Seed demo content?"}
    SeedDemo -- Yes --> Demo["Create example programs,\nprojects, weeks, and people"]
    SeedDemo -- No --> Login
    Demo --> Login["Sign in"]
    FirstRun -- Yes --> Login
    Login --> Auth{"Credentials valid?"}
    Auth -- No --> Retry["Show login error"]
    Retry --> Login
    Auth -- Yes --> WorkspaceSelect{"Multiple workspaces?"}
    WorkspaceSelect -- Yes --> ChooseWorkspace["Choose active workspace"]
    WorkspaceSelect -- No --> App["Open authenticated app shell"]
    ChooseWorkspace --> App
```

**Screens implied**

- first-user setup screen
- login screen
- optional workspace picker
- post-login dashboard or docs landing screen

## Flow 2: Global Navigation To Canonical Document Pages

```mermaid
flowchart TD
    App["Authenticated app shell"] --> Nav["User chooses a primary surface"]

    Nav --> Dashboard["Dashboard"]
    Nav --> MyWeek["My Week"]
    Nav --> Docs["Documents"]
    Nav --> Issues["Issues"]
    Nav --> Projects["Projects"]
    Nav --> Programs["Programs"]
    Nav --> Team["Team"]
    Nav --> Analytics["Analytics"]
    Nav --> Settings["Settings"]

    Docs --> Detail["Open document detail"]
    Issues --> Detail
    Projects --> Detail
    Programs --> Detail
    Team --> PersonDetail["Open person detail"]

    Detail --> Canonical["Route to /documents/:id/*"]
    PersonDetail --> Canonical
```

**Screens implied**

- persistent left navigation
- list or board surfaces for each module
- shared canonical document page frame
- route-aware breadcrumb or current-view header

## Flow 3: Create, Edit, And Collaborate On Any Document

```mermaid
flowchart TD
    Start["User is in docs, issues, programs,\nprojects, weeks, or person area"] --> Create["Create new document"]
    Create --> ChooseType["Choose document type"]
    ChooseType --> Save["Create base record"]
    Save --> Open["Open canonical document page"]
    Open --> Edit["Write content in shared editor"]
    Edit --> Properties["Update type-specific properties"]
    Edit --> Mentions["Mention people and documents"]
    Edit --> Attach["Attach files or embeds"]
    Edit --> Comment["Add comments or inline discussion"]
    Edit --> Live["See live presence and remote edits"]
    Properties --> Persist["Autosave and sync"]
    Mentions --> Persist
    Attach --> Persist
    Comment --> Persist
    Live --> Persist
```

**Screens implied**

- new-document modal or command palette action
- shared editor shell
- property sidebar or metadata panel
- comments rail
- attachment UI
- realtime presence affordances

## Flow 4: Issue Intake, Prioritization, And Promotion

```mermaid
flowchart TD
    CreateIssue["Create issue"] --> Classify["Set issue type,\npriority, source, assignee"]
    Classify --> Associate["Associate to program,\nproject, week, or parent issue"]
    Associate --> Queue["Issue appears in list and kanban"]
    Queue --> Triage["Triage and update state"]
    Triage --> Decide{"Stay an issue or become a project?"}
    Decide -- Stay issue --> Continue["Continue execution tracking"]
    Decide -- Promote --> Project["Promote to project"]
    Project --> Hypothesis["Define project hypothesis,\nowner, accountable, success criteria"]
    Hypothesis --> ProjectRoute["Open canonical project page"]
```

**Screens implied**

- issue create form
- issue list and kanban views
- issue detail page
- promote-to-project action
- project setup screen or sidebar

## Flow 5: Program To Project To Week Execution Chain

```mermaid
flowchart LR
    Program["Program page"] --> ProgramTabs["Overview, Issues, Projects, Weeks"]
    ProgramTabs --> Project["Project page"]
    Project --> ProjectTabs["Issues, Details, Weeks, Retro"]
    ProjectTabs --> Week["Week page"]
    Week --> WeekTabsPlanning["Planning: Overview, Analytics, Plan"]
    Week --> WeekTabsActive["Active or completed: Overview, Analytics,\nIssues, Review, Standups"]
    WeekTabsActive --> Issue["Issue execution"]
    WeekTabsActive --> Review["Weekly review"]
    ProjectTabs --> Retro["Project retro"]
```

**Screens implied**

- program overview with linked issues, projects, and weeks
- project details with value scoring and success criteria
- week detail with changing tab set by status
- linked issue drill-downs

## Flow 6: Weekly Planning, Execution, Review, And Retro Cadence

```mermaid
flowchart TD
    WeekStart["Week enters planning"] --> OwnerPlan["Week owner defines week plan"]
    OwnerPlan --> Contributors["Individuals write weekly plans"]
    Contributors --> Approval{"Manager or accountable approval needed?"}
    Approval -- Yes --> ReviewPlan["Approve or request changes"]
    ReviewPlan --> Ready["Week becomes active"]
    Approval -- No --> Ready
    Ready --> Standups["People submit standups during week"]
    Ready --> IssueWork["Issues move through execution states"]
    Ready --> Analytics["Week analytics update"]
    Standups --> EndWeek["Week nears completion"]
    IssueWork --> EndWeek
    Analytics --> EndWeek
    EndWeek --> WeeklyReview["Owner writes weekly review"]
    WeeklyReview --> Retro["Individuals write weekly retros"]
    Retro --> ApprovalReview{"Approvals complete?"}
    ApprovalReview -- No --> Changes["Changes requested and follow-up items"]
    Changes --> WeeklyReview
    ApprovalReview -- Yes --> Complete["Week marked complete"]
```

**Screens implied**

- week planning tab
- my-week plan and retro forms
- standup stream
- week analytics tab
- weekly review surface
- changes-requested states and action items

## Flow 7: Manager Review And Accountability Escalation

```mermaid
flowchart TD
    Pending["Plans, reviews, retros, or accountability items pending"] --> Queue["Manager review queue"]
    Queue --> Inspect["Open person, project, or week context"]
    Inspect --> Decision{"Approve or request changes?"}
    Decision -- Approve --> Approved["Mark approved\nand capture approver metadata"]
    Decision -- Request changes --> Request["Send changes-requested feedback"]
    Request --> ActionItem["Create or update accountability issue"]
    ActionItem --> Notify["Notify responsible owner"]
    Notify --> Revision["Owner revises artifact"]
    Revision --> Queue
```

**Screens implied**

- manager review queue
- review detail panel with context
- approve and request-changes controls
- accountability issue surfaces
- notification or toast states

## Flow 8: Team Allocation And People Management

```mermaid
flowchart TD
    TeamNav["Open Team area"] --> Allocation["Allocation grid"]
    TeamNav --> Directory["Directory"]
    TeamNav --> Status["Status heatmap"]
    TeamNav --> OrgChart["Org chart"]
    TeamNav --> Reviews["Review matrix"]

    Allocation --> Assign["Assign people to projects and weeks"]
    Directory --> Person["Open person profile"]
    OrgChart --> Person
    Status --> Person
    Reviews --> Person

    Person --> Capacity["Edit role, capacity,\nreporting line, persona"]
    Capacity --> MyWeekLink["Connect person to My Week artifacts"]
```

**Screens implied**

- team allocation grid
- people directory table
- reporting-structure view
- person profile editor
- status and review matrix views

## Flow 9: Public Feedback Intake To Internal Work

```mermaid
flowchart TD
    Public["External user opens public feedback page for a program"] --> Submit["Submit feedback form"]
    Submit --> Intake["Create external issue in workspace"]
    Intake --> Review["Internal team reviews submission"]
    Review --> Decision{"Accept, reject, or convert?"}
    Decision -- Accept --> Backlog["Keep as issue in backlog"]
    Decision -- Reject --> Closed["Store rejection reason"]
    Decision -- Convert --> Project["Promote into project or attach to existing work"]
```

**Screens implied**

- public feedback form
- internal moderation or triage screen
- external-issue badges and provenance
- promote-or-link actions

## Flow 10: FleetGraph On-Demand Assistance

```mermaid
flowchart TD
    Page["User is viewing a Ship page"] --> OpenDrawer["Open FleetGraph drawer"]
    OpenDrawer --> Ask["Ask a question or choose a prompt"]
    Ask --> Context["Capture current route,\nentity, tab, page context, actor role"]
    Context --> Graph["Run shared FleetGraph graph"]
    Graph --> Answer["Return contextual answer\nwith evidence and route suggestions"]
    Answer --> FollowUp{"Consequential action proposed?"}
    FollowUp -- No --> Continue["User follows suggested route or asks another question"]
    FollowUp -- Yes --> Approval["Show human approval gate"]
    Approval --> Resume["Resume execution after approval"]
    Resume --> Result["Return final action outcome"]
```

**Screens implied**

- FleetGraph drawer
- starter prompts and freeform question input
- evidence-backed response card
- route buttons
- human-approval UI when required

## Flow 11: FleetGraph Proactive Push Flow

```mermaid
flowchart TD
    Trigger["Scheduled sweep or Ship mutation event"] --> Evaluate["Evaluate workspace, week, and issue state"]
    Evaluate --> Surface{"Worth surfacing?"}
    Surface -- No --> Quiet["Stay quiet"]
    Surface -- Yes --> FindAudience["Map finding to responsible,\naccountable, manager, or team"]
    FindAudience --> Persist["Persist proactive finding"]
    Persist --> Notify["Send toast or feed notification"]
    Notify --> Open["Recipient opens route or FleetGraph context"]
    Open --> FollowUp["Take action, ask follow-up,\nor dismiss/snooze"]
```

**Screens implied**

- proactive toast
- findings feed or inbox area
- contextual deep-link destination
- dismiss and snooze controls

## Flow 12: Wireframe Priority Order

The factory should wireframe these flows in this order:

1. authenticated app shell and navigation
2. canonical document page
3. documents, issues, programs, projects, and weeks list surfaces
4. week planning and review experience
5. team allocation and review surfaces
6. public feedback intake
7. FleetGraph on-demand drawer
8. proactive findings and notifications
