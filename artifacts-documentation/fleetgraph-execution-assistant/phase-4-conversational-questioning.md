# Phase 4: Conversational Questioning

## Objective

Make FleetGraph feel more like a real execution conversation once it already has the right surface context and evidence.

Phase 4 improves the question layer that surrounds the answer:

- starter prompts before the first question
- follow-up prompts after an answer
- PM and engineering phrasing that matches the current work surface

## Why

By the end of Phase 3, FleetGraph can answer from stronger execution evidence on `My Week` and issue-list surfaces.

But the experience still stalls if the surrounding prompts stay generic.

That creates three product problems:

1. good reasoning is hidden behind weak starter questions
2. follow-up prompts do not always build naturally on the last answer
3. FleetGraph can still feel like a utility panel instead of an in-context execution partner

## What

Phase 4 makes prompt chips more conversational and more useful.

That means:

- `My Week` starter prompts should sound like weekly execution questions
- issue-surface starter prompts should sound like worklist triage and delivery questions
- follow-up prompts should adapt to both:
  - the current surface
  - the answer theme, such as risk, blockers, scope, status, or coordination

## How

Phase 4 is implemented in the drawer prompt layer.

The work is ordered like this:

1. sharpen starter prompts for the highest-value surfaces first:
   - `my_week`
   - `project_issues`
2. derive starter prompt variants from existing page-context metrics so chips can react to the work actually on screen
3. make follow-up prompts depend on both:
   - inferred answer theme
   - resolved prompt surface
4. keep prompt generation deterministic and deduplicated so the UI stays stable and testable
5. add targeted drawer tests for the new starter and follow-up prompt behavior

## Purpose

The purpose of Phase 4 is to make FleetGraph easier to talk to in the moments that matter.

Users should not have to translate their intent into generic assistant language.

Instead, FleetGraph should meet them with prompts that already sound like:

- what a PM would ask when scanning execution risk
- what an engineer would ask when triaging movement, blockers, or scope

## Outcome

When Phase 4 is working well, FleetGraph should feel less like a search box with static chips and more like a guided execution conversation.

That should look like:

- `My Week` suggesting questions about attention, follow-up, and what can be deferred
- issue-list surfaces suggesting questions about stale work, risk clusters, and owner follow-up
- follow-up prompts that build on the prior answer instead of resetting to generic options

## Scope

Included in Phase 4:

- surface-aware starter prompt improvements
- theme-aware follow-up prompt improvements
- prompt deduplication and ordering improvements
- targeted tests for conversational prompt behavior
- roadmap/status documentation for the conversational layer

Not included in Phase 4:

- chat memory across long sessions
- new backend action types or writebacks
- model-only conversation generation
- new measurement instrumentation

## Exit Criteria

Phase 4 is complete when:

- `My Week` starter prompts reflect weekly execution intent
- issue-surface starter prompts reflect visible worklist risk and triage intent
- follow-up prompts adapt to the answer theme and current surface
- prompt generation stays deterministic and test-covered
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: complete
- production status: pending deploy verification in this phase doc

## Key Touchpoints

- [FleetGraphOnDemandPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx)
- [FleetGraphOnDemandPanel.test.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.test.tsx)
- [fleetgraph-pm-engineering-question-research.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-pm-engineering-question-research.md)
- [fleetgraph-conversational-questioning-capability.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-conversational-questioning-capability.md)

## Next Phase Unlocked

Phase 4 unlocks Phase 5:

- [phase-5-business-value-scoring.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/phase-5-business-value-scoring.md)

That order is intentional. Better conversational prompts help users ask the right question first, but FleetGraph still needs a clearer notion of business value before it can decide which risky work matters most.

## Delivery Status

Phase 4 is implemented on a stacked branch after Phase 3.

That means:

- the code is complete
- verification passed
- merge order still depends on Phase 2 and Phase 3 landing first
