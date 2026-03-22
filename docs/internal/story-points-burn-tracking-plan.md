# Story Points and Burn Tracking Plan

Concrete product and implementation plan for Jira-like sprint estimation,
burn-up, burn-down, and capacity tracking in Ship.

## Goal

Add a planning foundation that lets Ship and FleetGraph answer:

- are we burning down the committed scope on pace?
- did the sprint slip because of scope creep or because delivery slowed?
- is the team under-committed, over-committed, or staffed correctly?
- do we need less scope, more capacity, or a dependency decision?

## Current implementation status

Implemented in code now:

- issue-level `story_points`
- issue-level `estimate_hours`
- seeded/demo issue `issue_type` diversification across `story`, `bug`, `task`, `spike`, and `chore`
- default structured issue briefs for new issues:
  - `User Story`
  - `Context`
  - `Acceptance Criteria`
- sprint commitment baseline snapshots on weeks
- daily `sprint_analytics_snapshots`
- `GET /api/weeks/:id/analytics`
- burn-up / burn-down week charts in Ship

Still to deepen later:

- richer sprint history and history APIs
- release-confidence rollups
- roadmap-level planning views
- deeper capacity and staffing forecasting

## Product Decision

Use **story points** as the primary sprint planning unit.

Keep **hours** as an optional secondary unit for capacity planning.

That gives us the clean Jira-like split:

- **story points**
  - planning
  - velocity
  - burn-up
  - burn-down
  - commitment vs delivered scope
- **hours**
  - staffing
  - allocation
  - available capacity
  - team load

We should not rely on a single numeric field for both jobs.

## Why This Is Better

Story points are better for:

- relative sizing
- sprint commitment
- comparing delivered work across sprints
- burn charts that reflect delivery flow instead of raw calendar time

Hours are better for:

- allocation planning
- partial availability
- PTO impact
- staffing pressure

Using both gives us the same planning advantage teams get from Jira:

- points explain delivery pace
- hours explain available capacity

## Data Model Changes

### 1. Add first-class story points on issues

Each issue should have:

- `story_points: number | null`
- `estimate_hours: number | null`
- `issue_type: 'story' | 'bug' | 'task' | 'spike' | 'chore'`

Best practice:

- `story_points` is required before assigning an issue to a sprint
- `estimate_hours` is optional unless a team is using capacity planning
- keep `document_type = 'issue'`; issue flavor belongs in `issue_type`, not a new document subtype
- every issue should carry a lightweight structured brief in the body

### 1a. Keep issue briefs structured across all issue types

Every issue should open with a short structured brief, even when it is not a literal product story.

Recommended body sections:

- `User Story`
- `Context`
- `Acceptance Criteria`

Guidance by type:

- `story`
  - use classic `As a / I want / so that`
- `bug`
  - still state the user or workflow impact, then define fix and verification criteria
- `task`
  - state the desired operational outcome and what "done" means
- `spike`
  - state the investigation goal, decision needed, and exit criteria
- `chore`
  - state the maintenance outcome, cleanup scope, and verification steps

Acceptance criteria should not be limited to stories. They are the completion contract for all issue types. The wording changes by type, but the section should exist everywhere.

### 2. Add sprint commitment snapshot

When a sprint starts, store a baseline snapshot:

- committed issue ids
- committed story point total
- committed estimate hour total
- snapshot timestamp

This is the source of truth for:

- original committed scope
- added after start
- removed after start
- burn-up and burn-down baselines

### 3. Add daily sprint analytics snapshots

Store a time series per sprint day with:

- date
- committed story points
- current story points
- completed story points
- remaining story points
- committed issue count
- current issue count
- completed issue count
- added story points after start
- removed story points after start
- estimate hours completed
- estimate hours remaining

### 4. Track historical estimate changes

For real burn accuracy, record when:

- story points change
- estimate hours change
- issue enters sprint
- issue leaves sprint
- issue changes done state

Without this, charts drift and scope-change math becomes approximate.

## API Enhancements

### 1. Sprint analytics endpoint

Add a dedicated endpoint like:

- `GET /api/weeks/:id/analytics`

It should return:

- summary metrics
- burn-up series
- burn-down series
- scope-change series
- commitment baseline
- current scope
- projected completion

### 2. Sprint event history endpoint

Add a normalized history endpoint like:

- `GET /api/weeks/:id/history`

It should expose:

- issue added to sprint
- issue removed from sprint
- story points changed
- estimate hours changed
- issue completed
- issue reopened

### 3. Team capacity endpoint

Extend current allocation data so a sprint can return:

- allocated people
- available hours
- planned hours
- unallocated hours
- capacity utilization

## UI Enhancements

### 1. Issue UI

Add visible planning fields:

- story points
- estimate hours

Enhance the issue sidebar and editor with:

- fast point entry
- bulk point editing
- bulk estimate-hour editing
- sprint assignment warning if story points are missing

### 2. Sprint / Week analytics panel

Add a dedicated planning area to the sprint surface with:

- burn-down chart
- burn-up chart
- commitment summary
- scope-change summary
- velocity comparison
- staffing and capacity summary

### 3. Burn chart behavior

The sprint analytics UI should support:

- toggle between points and issue counts
- ideal line
- actual line
- total scope line
- scope added markers
- scope removed markers
- completed points line
- tooltip by day
- projected end-state marker

### 4. Summary chips

Show compact sprint planning metrics:

- committed points
- current points
- completed points
- remaining points
- added-after-start points
- removed-after-start points
- burn rate
- projected finish
- available hours
- capacity utilization

## What Burn-Up and Burn-Down Should Tell Us

### Burn-down

Burn-down should answer:

- is remaining committed work dropping at the right rate?
- are we behind the ideal line?
- did remaining work go up because scope was added?

### Burn-up

Burn-up should answer:

- how much work has been completed?
- how much total scope exists now?
- is scope expanding faster than completion?

### Capacity interpretation

When combined with staffing and hours, the charts should tell us:

- **scope creep**
  - total scope line rises after sprint start
- **out-of-scope pressure**
  - added-after-start points keep climbing
- **under-capacity**
  - remaining work stays high while points per day stay flat
- **over-capacity or under-commitment**
  - burn-down happens much faster than expected
  - sprint finishes early with low utilization

## FleetGraph Intelligence This Unlocks

Once this data exists, FleetGraph can reason much more accurately about:

- whether risk is caused by scope growth or execution slowdown
- whether the team needs more engineers or just less scope
- whether a sprint is under-committed
- whether a team is consistently over capacity
- whether the roadmap is unrealistic given actual burn rate

FleetGraph could then answer:

- "Are we missing because of scope creep or low throughput?"
- "Did we under-plan this sprint?"
- "Should we add capacity or reduce scope?"
- "Which projects consistently burn above available capacity?"

## Recommended Build Order

### Slice 1: Story points foundation

What:

- add `story_points`
- add `estimate_hours`
- update issue UI and validation

Why:

- burn tracking is unreliable without a stable estimation model

How:

- extend issue schema, API validation, and issue sidebar/editor

Purpose:

- standardize the planning unit before building charts

Outcome:

- issues can be sized like Jira stories

### Slice 2: Sprint baseline and history

What:

- committed-at-start snapshot
- sprint event history
- estimate-change history

Why:

- burn charts need a historical baseline, not just current scope

How:

- persist sprint baseline and normalized event records

Purpose:

- create trustworthy burn-up and burn-down inputs

Outcome:

- Ship knows original scope versus changed scope

### Slice 3: Sprint analytics APIs

What:

- analytics endpoint
- burn series
- scope-change series
- projection data

Why:

- UI and FleetGraph both need one shared source of truth

How:

- aggregate sprint baseline plus event history into daily analytics

Purpose:

- expose planning telemetry cleanly

Outcome:

- charts and agents both consume the same planning facts

### Slice 4: Sprint planning UI

What:

- burn-up chart
- burn-down chart
- planning summary chips
- capacity summary

Why:

- teams need to see planning drift directly inside Ship

How:

- add a sprint analytics section to the week surface

Purpose:

- make planning health visible without leaving the workflow

Outcome:

- Ship gains Jira-like sprint analytics

### Slice 5: FleetGraph reasoning over burn data

What:

- burn-rate signals
- scope-trajectory signals
- under-commitment and over-commitment signals
- staffing recommendation signals

Why:

- charts are useful; agent interpretation is more useful

How:

- extend FleetGraph planning evidence and deterministic signals

Purpose:

- let FleetGraph explain the charts and recommend action

Outcome:

- FleetGraph can reason from true sprint telemetry instead of approximations

## Final Outcome

The end state should feel Jira-like in the places that matter most:

- stories are sized with points
- sprint commitment is baselined
- burn-up and burn-down are trustworthy
- scope creep is visible
- capacity pressure is visible
- FleetGraph can explain whether the team needs:
  - less scope
  - more people
  - a dependency decision
  - a roadmap adjustment
