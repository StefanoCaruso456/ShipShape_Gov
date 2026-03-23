# Phase 5: Business Value and Impact Scoring

## Objective

Teach FleetGraph to rank work by business importance as well as execution risk.

Phase 5 adds a business-value layer so FleetGraph can answer questions like:

- what issue is highest impact
- which risky work matters most to the business
- where should we intervene first if we cannot do everything

## Why

By the end of Phase 4, FleetGraph can understand execution surfaces and guide users into a better conversation.

But it still mostly knows:

- what is stale
- what is blocked
- what has not started
- what needs attention

It does not yet know enough about:

- ROI
- retention impact
- acquisition impact
- growth leverage

That means FleetGraph can still sound operationally aware but commercially blind.

## What

Phase 5 adds business value as a first-class signal for project-backed work.

This phase introduces:

- project business inputs:
  - ROI
  - retention
  - acquisition
  - growth
- a transparent weighted `businessValueScore`
- issue-surface ranking that combines:
  - execution attention
  - inherited project business value
- current-view answers that can name the highest-impact visible issue instead of only describing the issue list

## How

Phase 5 is built in this order:

1. extend shared project properties with business-value inputs and a shared score helper
2. expose the new fields through the project API and web project types
3. add editing/display support in the project sidebar so the values are visible and maintainable in-product
4. let issue surfaces inherit business value from their owning project
5. rank visible issues using both:
   - execution attention
   - business value
6. teach current-view reasoning to answer impact/value questions directly from those ranked signals
7. cover the new ranking path with targeted tests

## Purpose

The purpose of Phase 5 is prioritization quality.

FleetGraph should not only tell the user what is risky. It should also help distinguish:

- risky but low-value work
- risky and high-value work
- work that deserves escalation now because the business cost of delay is high

## Outcome

When Phase 5 is working well, FleetGraph should be able to say things like:

- `#14 is the highest-impact visible issue on this tab`
- `this issue inherits the strongest business value from the Performance project`
- `the business case here is strongest on ROI and growth`
- `this issue is not the stalest one, but it matters most commercially`

## Scope

Included in Phase 5:

- shared business-value score helper
- project property support for ROI, retention, acquisition, and growth
- project API/web type support for those fields
- project sidebar editing/display support
- issue-surface business-value inheritance
- current-view answers for impact/value questions
- targeted tests and roadmap docs

Not included in Phase 5:

- direct external KPI integrations
- live revenue analytics ingestion
- new mutation actions
- portfolio-level business rollups across every surface

## Exit Criteria

Phase 5 is complete when:

- projects can store ROI, retention, acquisition, and growth values
- Ship computes a shared business-value score from those values
- FleetGraph can identify the highest-impact visible issue on an issue surface
- impact/value questions return specific issue guidance instead of generic list narration
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this phase doc

## Key Touchpoints

- [document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts)
- [projects.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/projects.ts)
- [useProjectsQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useProjectsQuery.ts)
- [ProjectSidebar.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/sidebars/ProjectSidebar.tsx)
- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [reason-about-current-view.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts)

## Next Phase Unlocked

Phase 5 unlocks Phase 6:

- [phase-6-action-quality-and-in-app-routing.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-6-action-quality-and-in-app-routing.md)

Specifically:

- tighter actions and in-app routing grounded in both business importance and execution risk

That order is intentional. FleetGraph should know what matters most before it decides who to follow up with, what to cut, or what route button to push to the top.

## Delivery Status

Phase 5 is merged to `main`.

That means:

- the code is complete
- verification passed
- merge is complete
- deploy verification is the remaining status step in this doc
