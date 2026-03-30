# ShipShape Clone Product Vision

## Purpose

This document describes the product vision for a full-featured clone of ShipShape. It is written so an application-building factory can recreate the product without access to the original repository.

The product is not a generic project tracker. It is a planning, execution, learning, and accountability system built around a single idea:

- work, plans, reviews, and knowledge should live in one connected workspace

## Product Thesis

ShipShape helps teams learn faster by combining documentation, issue tracking, weekly planning, weekly retrospection, project validation, and manager accountability into one system.

Most tools split this across several disconnected products:

- a wiki for context
- a task tracker for work
- spreadsheets for allocation
- docs or meetings for planning
- separate review systems for accountability

ShipShape collapses those boundaries. The clone should preserve that unification.

## Vision Statement

Build the operating system for execution-minded teams: a collaborative workspace where teams define intent, do the work, prove what happened, and improve every week.

## Core Beliefs

### 1. Everything is a document

The system should treat wiki pages, issues, programs, projects, weeks, plans, retros, standups, and person profiles as variations of one underlying document model.

This gives the product three important properties:

- one editor experience across all entities
- one relationship model across all entities
- one routing model centered on canonical document pages

### 2. Plans are the unit of intent

Issues show what happened. Plans show what was intended.

The product should make weekly plans and retros first-class artifacts, not optional notes.

### 3. Projects are hypotheses

Projects are not just containers for tasks. They are bets about business value that must be validated or invalidated.

The clone should preserve:

- explicit project scoring
- expected outcomes
- approval of project hypotheses
- retrospective validation of whether the bet paid off

### 4. Weeks are accountability windows

The team works on a shared weekly cadence. Weeks create a rhythm for planning, standups, review, and learning.

The clone should make week ownership, weekly review, and weekly retro visible and socially important.

### 5. Learning matters more than compliance

The product should not be a bureaucratic gatekeeper. Missing work products should be visible, escalated, and discussable, but not turned into rigid blockers by default.

### 6. People own outcomes

Programs, projects, and weeks may organize work, but people are the ones accountable for outcomes. Ownership and review workflows must always resolve to named humans.

## Product Promise

If a team uses ShipShape well, they should be able to answer these questions from one system:

- What are we trying to accomplish this week?
- What work is actually in motion?
- What slipped, why, and who needs to respond?
- Which projects are worth the most?
- Did this project validate the original hypothesis?
- Who is overloaded, blocked, or overdue on accountability work?
- What did we learn that should change how we plan next week?

## Target Users

### Individual contributors

Need a place to:

- see assigned work
- write weekly plans and retros
- post standups
- collaborate on documents
- understand what is expected of them

### Project and product owners

Need a place to:

- define project hypotheses
- prioritize projects
- group issues under projects
- connect work to outcomes
- review weekly progress

### Engineering managers and team leads

Need a place to:

- review plans and retros
- rate delivery quality
- manage allocations
- inspect accountability gaps
- understand team health across weeks

### Program or portfolio owners

Need a place to:

- organize long-lived initiatives
- see all projects and weeks inside a program
- gather internal and external feedback
- understand where investment is going

### Workspace administrators

Need a place to:

- manage members and invites
- manage API tokens
- inspect audit logs
- manage workspace settings

## Differentiators

The clone should feel meaningfully different from Jira, Linear, Asana, or Notion alone.

### Unified document + work model

A project page, a week page, and a wiki page all use the same editing and routing model.

### Explicit weekly learning loop

Weekly plans, standups, reviews, and retros are part of the product core, not side features.

### Accountability that is visible, not hidden

Managers get dedicated views for review queues, accountability grids, and performance signals.

### Scientific-method projects

Projects begin with a hypothesis and end with a retrospective that validates or invalidates the bet.

### Page-aware AI assistance

The clone should support contextual AI that understands the current page, current workflow stage, and execution risk.

## Product Pillars

### Pillar 1: Shared knowledge

Teams need rich collaborative documents, links between documents, attachments, comments, mentions, embeds, and a clean document tree.

### Pillar 2: Structured execution

Teams need issues, projects, programs, weeks, assignments, filters, kanban/list views, and progress surfaces.

### Pillar 3: Accountability and review

Teams need manager approvals, changes-requested flows, overdue signals, action items, and accountability reporting.

### Pillar 4: Continuous learning

Teams need weekly retros, project retros, learning capture, validation of assumptions, and history over time.

### Pillar 5: Context-aware assistance

Teams need AI assistance that improves planning quality, surfaces risks, and proposes next actions without becoming an unbounded chatbot.

## Core Product Experience

The cloned product should revolve around five habitual behaviors:

1. Open the workspace and immediately see urgent accountability or execution items.
2. Navigate into a program, project, or week through a unified document system.
3. Edit content collaboratively in place with rich text and live presence.
4. Review weekly and project commitments against actual delivery.
5. Use AI assistance as a contextual execution helper, not a separate destination.

## Scope Definition

### Required for full product parity

- Multi-workspace support
- User accounts, sessions, roles, invites, and workspace switching
- Unified document model
- Collaborative editor with realtime presence
- Programs, projects, weeks, issues, people, plans, retros, standups, and reviews
- Team allocation views and manager review surfaces
- Comments, mentions, backlinks, associations, file attachments, and command palette
- Project scoring and business-value signals
- Public feedback intake into issues
- API tokens and audit logging
- AI plan/retro quality assistance
- FleetGraph-style contextual execution assistant

### Allowed as deployment-specific adapters

- Government-specific authentication, such as PIV or CAIA
- AWS-specific infrastructure choices
- Claude-specific or MCP-specific integrations

These are valid extensions but should not be treated as the product essence.

## Non-Goals

The clone should not optimize for:

- per-document ACL complexity
- heavyweight enterprise portfolio accounting
- arbitrary workflow builders
- deep offline-first mutation queues
- generic AI chat detached from the product context

## Success Metrics

### Adoption metrics

- Weekly active users
- Percentage of users writing plans or retros
- Percentage of active weeks with standups

### Execution metrics

- Percentage of weeks with approved plans before execution
- Percentage of completed weeks with reviews and retros
- Percentage of issues linked to projects and weeks

### Quality metrics

- Share of weekly plans rated high quality
- Share of retros that address all planned commitments
- Time to review for manager approval flows

### Learning metrics

- Project validation rate
- Frequency of learning document creation or retro completion
- Reduction in overdue accountability items

### AI metrics

- Usage rate of plan and retro analysis
- Usage rate of contextual assistant
- Click-through rate on suggested follow-up actions

## Experience Principles For The Factory

When building the clone, optimize for:

- one coherent workspace, not many mini-apps
- directness over ceremony
- clarity of ownership over clever abstraction
- rich context over shallow dashboards
- visible learning loops over hidden process
- safe, bounded AI over magical but risky automation

## Release Philosophy

If the factory needs phased delivery, use this order:

1. Core platform and auth
2. Unified documents and collaborative editor
3. Programs, projects, issues, and weeks
4. Weekly planning, retros, standups, and review workflows
5. Team views, allocation, and accountability surfaces
6. File attachments, comments, mentions, search, and command palette
7. AI quality assistant
8. Context-aware execution assistant

## Final Direction

The best ShipShape clone should feel like:

- Notion plus issue tracking plus weekly operating cadence plus manager review

It should not feel like:

- a wiki bolted onto a task board
- a project tracker with a few note fields
- a dashboard-heavy system with weak execution depth

The product wins when teams can move from intent to work to evidence to learning without leaving the workspace.
