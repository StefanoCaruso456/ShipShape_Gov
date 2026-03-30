# ShipShape Clone Product Requirements Document

## Purpose

This PRD defines the functional requirements for a ShipShape clone that preserves the behavior, workflows, and information architecture of the audited product without requiring access to repository source code.

Companion diagram docs:

- `SHIPSHAPE_CLONE_SYSTEM_ARCHITECTURE_DIAGRAMS.md`
- `SHIPSHAPE_CLONE_USER_FLOW_DIAGRAMS.md`

## Product Summary

ShipShape is a multi-workspace collaboration and execution platform built around a unified document model. It combines:

- collaborative documentation
- issue tracking
- project and program management
- weekly planning and retros
- standups and reviews
- team allocation and accountability
- contextual AI assistance

## Goals

1. Unify documents, work items, and planning artifacts into one product.
2. Make weekly planning, review, and retros part of normal execution.
3. Make project prioritization and validation explicit.
4. Give managers clear accountability and review surfaces.
5. Support rich collaboration with minimal tool switching.
6. Provide contextual AI assistance that is helpful and bounded.

## Non-Goals

1. Fine-grained document ACLs beyond workspace and private visibility.
2. A generic no-code workflow builder.
3. A fully offline-first mutation model.
4. Unlimited autonomous AI actions without human approval.

## Users

### Workspace member

Can create and edit documents, issues, plans, retros, and standups within their workspace.

### Workspace admin

Can manage members, invites, API tokens, and workspace-level settings.

### Super admin

Can manage workspaces globally, impersonate users, and inspect platform-level audit data.

### Responsible owner

Owns a program, project, or week and is expected to maintain execution artifacts.

### Accountable reviewer

Approves or requests changes on plans, reviews, and retros.

## Core Domain Model

The factory must implement the following first-class entities:

| Entity | Purpose |
| --- | --- |
| Workspace | Tenancy boundary |
| User | Global identity |
| Workspace Membership | Access to a workspace with role |
| Document | Unified base record for all content types |
| Program | Long-lived initiative container |
| Project | Hypothesis-driven deliverable |
| Week | Program-specific execution window on shared workspace cadence |
| Issue | Atomic work item |
| Person | User profile and allocation identity |
| Weekly Plan | Per-person weekly commitment document |
| Weekly Retro | Per-person weekly reflection document |
| Standup | Daily or ad hoc progress update |
| Weekly Review | Review document for a week |
| Comment | Inline or document-level discussion |
| File | Attachment uploaded to a document |
| Audit Log | Security and admin event history |
| API Token | External tool credential |
| FleetGraph Finding | AI-generated proactive notification record |

## Product Navigation

The factory must ship the following primary app surfaces:

| Route area | Purpose |
| --- | --- |
| Dashboard | Personal execution overview |
| My Week | Personal weekly plan, retro, standups, and project assignments |
| Documents | Wiki-style documentation tree and list |
| Issues | Global issues list with list and kanban modes |
| Projects | Prioritized projects list |
| Programs | Programs list |
| Team / Allocation | People-by-week assignment grid |
| Team / Directory | Member directory |
| Team / Status | Accountability/status heatmap |
| Team / Reviews | Manager review queue and review matrix |
| Team / Org Chart | Reporting hierarchy |
| Analytics | Week-level analytics dashboards |
| Settings | Workspace admin management |
| Public Feedback | External feedback intake page for a program |

## Canonical Document Experience

All entity detail pages must route through a canonical document page pattern.

### Required behavior

- The product must support a single canonical document detail route.
- The detail page must use a unified editor shell plus a type-specific sidebar.
- The editor experience must be consistent across wiki pages, issues, programs, projects, weeks, plans, retros, and people.

### Required tab model

#### Program tabs

- Overview
- Issues
- Projects
- Weeks

#### Project tabs

- Issues
- Details
- Weeks
- Retro

#### Week tabs

Planning status:

- Overview
- Analytics
- Plan

Active or completed status:

- Overview
- Analytics
- Issues
- Review
- Standups

#### Types without tabs

- Wiki
- Issue
- Person
- Weekly Plan
- Weekly Retro
- Standup

## Functional Requirements By Module

### 1. Authentication and tenancy

The system must:

- support multi-workspace tenancy
- allow one user to belong to multiple workspaces
- support email/password login
- persist workspace selection
- enforce workspace roles of at least `admin` and `member`
- support workspace invites
- support secure session expiration and extension

Optional adapters:

- enterprise SSO
- PIV or certificate-based auth

### 2. Workspace bootstrap

The system must:

- provide a one-time setup flow for the first super admin
- create an initial workspace during first-time setup
- create a person profile document for the initial user
- seed or bootstrap demo content when configured to do so

### 3. Unified document model

The system must:

- store all major content types in one base document system
- support a `document_type` field
- support a shared rich-text content model
- support private or workspace visibility on documents
- support parent-child hierarchy for nested documentation
- support document relationships across programs, projects, and weeks

### 4. Rich collaborative editor

The editor must:

- support rich text
- support collaborative multi-user editing
- show live cursors and presence
- autosave content
- preserve content in realtime-safe format
- support slash commands
- support mentions of people and documents
- support checklists, code blocks, tables, toggles, links, and headings
- support attachments and embedded documents
- support comments and inline annotations

### 5. Documents module

The documents surface must:

- show all wiki-style documents
- support tree and list views
- support search by title
- support visibility filters
- allow creation of nested sub-documents
- allow archive or delete actions

### 6. Issues module

The issues module must:

- support issue creation, editing, archive, delete, and bulk actions
- support list and kanban views
- support state filters
- support issue priorities
- support issue types such as story, bug, task, spike, and chore
- support issue sources such as internal, external, and action_items
- support assignment to a person
- support association to program, project, and week
- support issue history
- support acceptance or rejection of external issues
- support promoting an issue into a project

### 7. Programs module

Programs must:

- represent long-lived initiative containers
- support owner and accountable assignments
- support color and optional emoji identity
- show counts of issues and weeks
- support merge workflows if two programs are consolidated
- support external/public feedback collection

### 8. Projects module

Projects must:

- belong to a program
- support ICE scoring fields: impact, confidence, ease
- support business-value scoring fields: ROI, retention, acquisition, growth
- compute and display ICE and business value scores
- support owner and accountable assignments
- support success criteria
- support plan approval and retro approval
- support design review status fields
- support conversion to and from an issue where applicable
- support a project retro that validates or invalidates the hypothesis

### 9. Weeks module

Weeks must:

- belong to a program
- live on a workspace-wide weekly cadence
- store a week number and derive dates from workspace start date
- require a single owner
- have statuses such as planning, active, and completed
- support week creation, editing, deletion, and carryover workflows
- support approval of plan and review
- support changes-requested flows for plans and retros
- support issue assignment to the week
- support week analytics and scope-change views

### 10. Weekly plan and retro workflow

The system must:

- support a weekly plan document per person per week
- support a weekly retro document per person per week
- allow users to create them from My Week and review workflows
- track submission timestamps
- keep revision history for accountability review
- show quality guidance but not block submission

### 11. Standups

The system must:

- support asynchronous standups as standalone documents or entries
- allow multiple standups per day where desired
- associate standups to a week
- show standups in a timeline view
- detect standup freshness for accountability reporting

### 12. Weekly review and performance workflow

The system must:

- support a weekly review artifact for each week
- allow managers to approve, request changes, or skip
- allow managers to rate retro performance on a 1-5 scale
- surface changed-since-approved states when content is edited after approval
- provide diff visibility between approved and current versions

### 13. Team allocation

The allocation surface must:

- show people as rows and weeks as columns
- show project assignments in the grid
- support assigning and unassigning people to projects in weeks
- support filtering to my team or everyone
- support hiding or showing archived members
- support grouping by current program assignment

### 14. Team directory and people profiles

The system must:

- provide a directory of workspace members
- open a dedicated person profile page
- store work persona and reporting-line metadata
- support archive and restore of people or memberships

### 15. Reviews page

The reviews surface must:

- show people x week review cells
- distinguish plan review and retro/review states
- show status categories such as approved, needs review, late, changed, and changes requested
- support batch review flows
- support my-team and everyone filters

### 16. Status overview and accountability

The system must:

- provide a manager-friendly overview of team accountability
- show overdue or missing artifacts
- trigger action-item style reminders
- surface accountability banners or modals for the affected user
- support an accountability grid or heatmap

### 17. Dashboard and My Week

The dashboard and My Week experiences must:

- show personal focus items
- show current and nearby weeks
- show assigned projects
- show plan, retro, and standup state
- deep-link users into the next required action

### 18. Search and command palette

The system must:

- provide a command palette
- support quick navigation to existing documents
- support creating common objects from the palette
- support mention search for people and documents
- support search for learning-oriented documents

### 19. Relationships, backlinks, and comments

The system must:

- support explicit document associations
- support reverse associations and contextual relationship views
- support backlinks between documents
- support inline or document-level comments

### 20. File uploads

The system must:

- support image uploads into the editor
- support generic file attachments
- support secure uploaded file access
- block dangerous executable file types

### 21. Public feedback

The system must:

- expose a public feedback form per program
- collect at least title and submitter email
- convert external submissions into issues with source `external`
- allow internal teams to review and accept or reject them

### 22. AI quality assistant

The system must:

- analyze weekly plans for clarity, falsifiability, and workload
- analyze retros for plan coverage and evidence quality
- be advisory rather than blocking
- show a quality meter and targeted suggestions
- rate-limit analysis requests

### 23. Context-aware execution assistant

The full clone must include a FleetGraph-style assistant that:

- understands the current page and page context
- runs in on-demand and proactive modes
- can reason over execution signals
- proposes bounded next actions
- pauses for human approval before consequential actions
- emits telemetry and traceable execution records

### 24. Admin and settings

Workspace settings must support:

- member management
- pending invite management
- API token management
- audit log viewing
- conversion history or related admin utilities

Super admin surfaces must support:

- workspace management
- user search
- impersonation
- global audit inspection

## Permissions

### Member permissions

- read and edit workspace-visible content
- create issues, documents, plans, retros, and standups
- interact with assigned work

### Workspace admin permissions

- all member capabilities
- manage workspace members and invites
- inspect workspace audit logs
- run admin workspace actions

### Super admin permissions

- all workspace admin capabilities
- manage workspaces globally
- manage users globally
- impersonate users

## Notifications

The system must support:

- realtime in-app events
- persistent banners for accountability
- proactive AI findings
- notification routing by role such as responsible owner, accountable, manager, issue assignee, or team member

## Analytics

The analytics area must support week-level dashboards for:

- report
- velocity
- forecast
- flow
- workload
- hygiene

## Acceptance Criteria Summary

The clone should be accepted when:

1. A user can sign into a workspace and navigate all major surfaces.
2. All core entities can be created and edited through the unified document model.
3. Multiple users can edit the same document concurrently with visible realtime collaboration.
4. Weekly plan, retro, standup, and review workflows operate end to end.
5. Projects can be scored, reviewed, and retrospectively validated.
6. Managers can inspect allocations, accountability, and review queues.
7. Search, comments, mentions, attachments, and command palette work across the document system.
8. The AI plan/retro assistant works as advisory guidance.
9. The contextual execution assistant works in at least on-demand mode, with proactive mode included for full parity.

## Suggested Delivery Phases

### Phase 1

- Auth
- Workspaces
- Unified documents
- Collaborative editor

### Phase 2

- Programs
- Projects
- Issues
- Weeks

### Phase 3

- My Week
- Standups
- Weekly plan and retro
- Reviews and accountability

### Phase 4

- Team allocation
- Directory
- Analytics
- Public feedback

### Phase 5

- AI quality assistant
- Context-aware execution assistant
- Advanced telemetry and proactive notifications
