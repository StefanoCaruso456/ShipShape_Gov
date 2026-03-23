# FleetGraph Tooling Registry

## Objective

Define the bounded read-only evidence tools FleetGraph should use for scrum reasoning, along with the shared TypeScript schema and downstream telemetry contract.

## Core Rule

Each evidence tool call should carry a shared scrum context envelope.

The tool-specific input schema should extend that shared context instead of inventing its own request shape from scratch.

## Shared Scrum Tool Context

Recommended TypeScript contract:

```ts
export type ScrumSurface =
  | 'my_week'
  | 'sprint'
  | 'project_issues'
  | 'program_issues'
  | 'project'
  | 'program'
  | 'document';

export type ScrumQuestionTheme =
  | 'risk'
  | 'blockers'
  | 'scope'
  | 'status'
  | 'impact'
  | 'follow_up'
  | 'generic';

export interface ScrumToolContext {
  schemaVersion: 'v1';
  runId: string;
  threadId: string;
  turnId: string;
  workspaceId: string;
  actorId: string | null;
  actorRole: string | null;
  surface: ScrumSurface;
  route: string;
  tab: string | null;
  question: string | null;
  questionTheme: ScrumQuestionTheme;
  issueId: string | null;
  weekId: string | null;
  sprintId: string | null;
  projectId: string | null;
  programId: string | null;
  visibleIssueIds: string[];
  nowIso: string;
}
```

Best practice:

- define this in shared TypeScript
- validate it with Zod at the tool boundary
- include it in every downstream tool trace

## Tool Registry

### 1. `get_surface_context`

Purpose:

- Normalize the current Ship surface into a reliable scrum reasoning scope.

Use when:

- every run

Input:

- `ScrumToolContext`

Output should include:

- resolved surface kind
- narrowed entity scope
- current route and tab
- visible filters
- whether the surface is a launcher, context, or execution surface

Why it matters:

- this is the anchor tool that prevents later tools from reasoning over the wrong scope

### 2. `get_visible_issue_worklist`

Purpose:

- Fetch and normalize the visible issue rows for project, program, or sprint issue surfaces.

Use when:

- the user is on an issues tab or asking issue-specific questions

Input should extend:

- `ScrumToolContext`
- visible filter state

Output should include:

- issue id
- display id
- title
- state
- priority
- assignee
- sprint
- project
- program
- created and updated timestamps
- stale age
- blocked flag
- route

Why it matters:

- this is the evidence source for stale, stuck, owner, and risk-cluster reasoning

### 3. `get_sprint_snapshot`

Purpose:

- Return a normalized sprint/week execution snapshot.

Use when:

- the scope includes a sprint or can be resolved to one

Output should include:

- sprint id and title
- sprint goal
- issue counts
- completion counts
- in-progress counts
- cancelled counts
- recent activity
- current-week status
- start and end dates

Why it matters:

- this is the main deterministic execution evidence source for sprint risk

### 4. `get_scrum_artifact_status`

Purpose:

- Normalize the weekly plan, standup, retro, and review status for the scoped work.

Output should include:

- plan status
- retro status
- review status
- standup counts
- missing artifacts
- due or overdue flags
- routes for write/open/complete actions

Why it matters:

- scrum execution quality is not just issue movement; artifact hygiene is part of the operating signal

### 5. `get_scope_change_signals`

Purpose:

- Normalize what changed after sprint start.

Output should include:

- planned-at-start count
- added-mid-sprint count
- removed-mid-sprint count
- displaced work
- scope drift summary

Why it matters:

- this is the evidence source for “what changed,” “what was added,” and “what should move out”

### 6. `get_dependency_signals`

Purpose:

- Normalize blocked and dependent work that matters to scrum delivery.

Output should include:

- issue id
- blocker type
- blocker age
- owner
- route
- external vs internal dependency
- unresolved review or approval blockers

Why it matters:

- dependency and blocker reasoning should not depend on parsing free-form text in the last step

### 7. `get_team_ownership_and_capacity`

Purpose:

- Normalize accountability and workload signals.

Output should include:

- owner and assignee coverage
- unassigned work
- active work per owner
- overloaded owners
- missing-owner flags

Why it matters:

- scrum teams need to know not only what is risky, but who needs the follow-up

### 8. `get_business_value_context`

Purpose:

- Normalize project-level business value that issue surfaces inherit.

Output should include:

- ROI
- retention
- acquisition
- growth
- business value score
- highest-value project in scope

Why it matters:

- this is the business-value layer that helps FleetGraph rank risk against importance

## Downstream Telemetry Contract

Every tool call should emit a normalized trace.

Recommended TypeScript contract:

```ts
export interface FleetGraphToolCallTrace<TInput = unknown, TResult = unknown> {
  callId: string;
  toolName: string;
  toolVersion: string;
  context: ScrumToolContext;
  input: TInput;
  success: boolean;
  result: TResult | null;
  errorCode: string | null;
  errorMessage: string | null;
  cacheHit: boolean;
  resultCount: number | null;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
}
```

## What To Track Downstream

### Run-level

- `runId`
- `threadId`
- `workspaceId`
- `surface`
- `route`
- `questionTheme`
- `reasoningSource`
- `terminalOutcome`

### Model-level

- provider
- model
- prompt version
- token usage
- estimated cost
- model latency
- structured-output validity

### Tool-level

- tool name
- tool version
- tool latency
- cache hit
- success
- error code
- result count

### Orchestration-level

- transition count
- max transitions
- retry count
- max retries
- tool call count
- max tool calls
- deadline
- loop detected
- circuit breaker state

### Approval-level

- action type
- risk level
- requires approval
- approval outcome
- approval latency
- suppression reason
- execution latency

### UX-level

- question source
  - typed
  - starter prompt
  - follow-up prompt
- route action clicked
- primary route clicked
- follow-up prompt clicked

## Error Handling Best Practices

- each tool should return typed errors with stable error codes
- tool failure should not automatically fail the whole run if a deterministic fallback exists
- tool traces should still be recorded for failed calls
- user-facing answers should summarize the failure in execution language, not raw transport text

## Loop and Budget Best Practices

- keep explicit max transitions
- add max tool calls per run
- add max repeated tool calls per tool name
- record loop or circuit-breaker reasons in the trace
- surface budget failures in telemetry even if the UI answer falls back cleanly

## React-Side Best Practices

- keep React thin; it should send structured context, not orchestrate backend tools
- send route, tab, filters, visible ids, and question source
- do not ship full raw traces to the UI by default
- ship summarized route, reasoning, and safe telemetry
- keep debug-only detailed traces behind an internal mode

## Architecture Recommendation

This should be implemented inside the existing FleetGraph roadmap, not as a separate roadmap.

Why:

- it is a FleetGraph phase, not a separate product
- it directly unlocks safer evaluation and better reasoning
- it depends on the existing action and reasoning architecture

Recommended order:

1. add shared TypeScript and Zod schemas
2. add the tooling registry doc
3. implement read-only evidence tools
4. add per-tool traces to graph state
5. wire downstream telemetry
6. then move to evaluation
