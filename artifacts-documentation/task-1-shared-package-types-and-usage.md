# Task 1: `shared/` Package Types and Cross-Package Usage

## Scope

This review covers the `shared/` workspace package and how its exports are consumed by the backend (`api/`) and frontend (`web/`).

At a high level, `shared/` is the monorepo package that exposes:

- shared TypeScript types
- a few shared constants
- one small shared utility (`computeICEScore`)

It is depended on by both `@ship/api` and `@ship/web` as a workspace package.

## Package Structure

`shared/src/index.ts` re-exports:

- `shared/src/types/index.ts`
- `shared/src/constants.ts`

`shared/src/types/index.ts` re-exports:

- `user.ts`
- `api.ts`
- `auth.ts`
- `workspace.ts`
- `document.ts`

In practice, almost all meaningful shared domain modeling lives in `shared/src/types/document.ts`.

## Types and Constants Defined in `shared/`

### 1. Shared constants

Defined in `shared/src/constants.ts`:

- `HTTP_STATUS`
- `ERROR_CODES`
- `SESSION_TIMEOUT_MS`
- `ABSOLUTE_SESSION_TIMEOUT_MS`

These are not types, but they are part of the same shared contract and are heavily used.

### 2. API response types

Defined in `shared/src/types/api.ts`:

- `ApiResponse<T>`
- `ApiError`

These describe the app's generic success/error response envelope.

### 3. User types

Defined in `shared/src/types/user.ts`:

- `User`

This models a user record with `id`, `email`, `name`, `isSuperAdmin`, `lastWorkspaceId`, and timestamps.

### 4. Workspace types

Defined in `shared/src/types/workspace.ts`:

- `Workspace`
- `WorkspaceMembership`
- `WorkspaceInvite`
- `AuditLog`
- `WorkspaceWithRole`
- `MemberWithUser`

These represent workspace records, membership/invite data, audit log rows, and a few response-oriented composites.

### 5. Auth types

Defined in `shared/src/types/auth.ts`:

- no active exported auth interfaces

The file explicitly says auth-specific types were removed and that auth types now live locally in `api/` and `web/`.

### 6. Document system types

Defined in `shared/src/types/document.ts`.

This is the largest and most important part of the package.

#### Relationship and visibility types

- `DocumentVisibility`
- `BelongsToType`
- `BelongsTo`
- `IncompleteChild`
- `CascadeWarning`

These describe document visibility, generic associations, and the structured warning returned when closing a parent issue with incomplete children.

#### Document taxonomy and workflow enums

- `DocumentType`
- `IssueState`
- `IssuePriority`
- `IssueSource`
- `AccountabilityType`
- `WeekStatus`
- `ICEScore`
- `PlanHistoryEntry`
- `ApprovalState`
- `ApprovalTracking`

These define the major domain enums and approval metadata used across the app.

#### Per-document property shapes

- `IssueProperties`
- `ProgramProperties`
- `ProjectProperties`
- `WeekProperties`
- `PersonProperties`
- `WikiProperties`
- `WeeklyPlanProperties`
- `WeeklyRetroProperties`
- `StandupProperties`
- `WeeklyReviewProperties`

These are the typed shapes for the JSON `properties` blob stored on each document type.

#### Base document and typed document variants

- `DocumentProperties`
- `Document`
- `WikiDocument`
- `IssueDocument`
- `ProgramDocument`
- `ProjectDocument`
- `WeekDocument`
- `PersonDocument`
- `WeeklyPlanDocument`
- `WeeklyRetroDocument`
- `StandupDocument`
- `WeeklyReviewDocument`

These try to provide a common base document model plus document-type-specific variants.

#### Shared helpers and defaults

- `DEFAULT_PROJECT_PROPERTIES`
- `computeICEScore(impact, confidence, ease)`

These are the only non-type domain exports in the document module.

## How the Backend Uses `shared/`

The backend uses `@ship/shared`, but selectively.

### 1. Auth/session/error constants are genuinely shared

Backend imports the constants heavily in authentication and route handling:

- `api/src/middleware/auth.ts`
- `api/src/routes/auth.ts`
- `api/src/routes/invites.ts`
- `api/src/routes/admin.ts`
- `api/src/routes/setup.ts`
- `api/src/routes/workspaces.ts`
- `api/src/routes/api-tokens.ts`
- `api/src/routes/caia-auth.ts`
- `api/src/collaboration/index.ts`
- `api/src/__tests__/auth.test.ts`

Typical usage:

- return consistent HTTP status codes
- return consistent error codes
- enforce the 15-minute inactivity timeout
- enforce the 12-hour absolute timeout

### 2. Project scoring logic is shared

Backend imports:

- `DEFAULT_PROJECT_PROPERTIES`
- `computeICEScore`

from:

- `api/src/routes/projects.ts`
- `api/src/routes/dashboard.ts`

Typical usage:

- fill in fallback project values such as default color
- compute derived ICE scores from project property values before returning API responses

### 3. One backend service uses a shared domain type

`api/src/services/accountability.ts` imports:

- `AccountabilityType`

This helps ensure that accountability items and generated accountability issues use the same allowed type strings everywhere.

### 4. What the backend does not broadly do

Even though `shared/` defines rich interfaces like `Document`, `ProjectDocument`, `Workspace`, and `ApiResponse<T>`, the backend does not use them as its universal server-side source of truth.

Instead, backend route code still commonly relies on:

- SQL row objects
- local TypeScript inference
- Zod schemas
- ad hoc response object shapes

So the backend uses `shared/` more for:

- enums
- constants
- utility helpers
- a few narrow domain types

than for end-to-end typing of database rows and API payloads.

## How the Frontend Uses `shared/`

The frontend also uses `@ship/shared`, again selectively.

### 1. Session timeout behavior is shared with backend policy

`web/src/hooks/useSessionTimeout.ts` imports:

- `SESSION_TIMEOUT_MS`
- `ABSOLUTE_SESSION_TIMEOUT_MS`

This keeps the warning and logout timers aligned with the backend's session rules.

### 2. Issue/document UI behavior uses shared enums and relationship shapes

Frontend imports document-related types in places such as:

- `web/src/lib/contextMenuActions.ts`
- `web/src/hooks/useIssuesQuery.ts`
- `web/src/components/IssuesList.tsx`
- `web/src/components/UnifiedEditor.tsx`
- `web/src/components/sidebars/IssueSidebar.tsx`
- `web/src/components/sidebars/PropertiesPanel.tsx`
- `web/src/components/ui/MultiAssociationChips.tsx`

Typical usage:

- `DocumentType` drives which context menu actions exist for each document kind
- `IssueState` and `IssuePriority` drive typed status/priority menu options
- `DocumentVisibility` drives visibility controls
- `BelongsTo` and `BelongsToType` type the shared association model used by issues and document UI
- `CascadeWarning` and `IncompleteChild` type the special 409 warning flow when an issue cannot be closed cleanly

### 3. Approval state is shared in the UI

Frontend imports `ApprovalTracking` in:

- `web/src/components/ApprovalButton.tsx`
- `web/src/components/sidebars/ProjectSidebar.tsx`
- `web/src/components/sidebars/WeekSidebar.tsx`
- `web/src/components/sidebars/PropertiesPanel.tsx`

This keeps approval widgets aligned with the backend document-property schema.

### 4. Project ICE scoring is shared in the UI

Frontend imports `computeICEScore` in:

- `web/src/hooks/useProjectsQuery.ts`
- `web/src/components/document-tabs/ProjectDetailsTab.tsx`
- `web/src/components/sidebars/ProjectSidebar.tsx`

That avoids duplicating the ICE scoring formula in multiple frontend components.

## Important Architectural Observation

`shared/` is not the complete canonical type layer for the app today.

It is better described as a partial shared contract.

### What is actually shared well

The package is clearly the intended source of truth for:

- document enums and workflow states
- association shapes like `BelongsTo`
- approval metadata
- session/auth constants
- error/status constants
- ICE scoring logic

### What is still duplicated locally

Several richer interfaces defined in `shared/` are duplicated or replaced locally instead of being imported directly.

Examples on the frontend:

- `web/src/lib/api.ts` defines its own `ApiResponse<T>`
- `web/src/lib/api.ts` defines its own `Workspace`, `WorkspaceMembership`, `WorkspaceInvite`, and `AuditLog`
- `web/src/contexts/WorkspaceContext.tsx` defines its own `WorkspaceWithRole`
- issue and document-facing hooks/components often define local response/document shapes around the shared association types

This means the frontend currently uses `shared/` more as:

- a common enum/contract layer
- a common helper layer

than as a complete generated SDK or complete domain-model package.

### Backend mirrors the same pattern

The backend also does not fully lean on the shared `Document` or `Workspace` interfaces. Most server code still works directly with database rows and locally assembled response objects.

## Bottom Line

The `shared/` package defines three main things:

1. common constants for status, errors, and sessions
2. a rich document-type model centered on document properties, workflow enums, associations, and approvals
3. a small amount of reusable business logic such as ICE scoring

Across the frontend and backend, the most important shared exports in real use are:

- `SESSION_TIMEOUT_MS`
- `ABSOLUTE_SESSION_TIMEOUT_MS`
- `HTTP_STATUS`
- `ERROR_CODES`
- `BelongsTo`
- `BelongsToType`
- `DocumentType`
- `IssueState`
- `IssuePriority`
- `DocumentVisibility`
- `CascadeWarning`
- `ApprovalTracking`
- `AccountabilityType`
- `DEFAULT_PROJECT_PROPERTIES`
- `computeICEScore`

The richer record interfaces like `User`, `Workspace`, `Document`, and `ApiResponse<T>` exist in `shared/`, but they are not yet consistently used as the single source of truth across both application layers.
