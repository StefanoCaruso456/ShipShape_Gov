# Phase 10: Intent-Specific Conversational Reasoning

## Objective

Make FleetGraph answer issue-surface questions like a PM/agile execution partner instead of reusing one generic issue-tab response across every question.

Phase 10 gives issue-tab questions their own deterministic answer contracts for:

- what needs attention first
- which active issues are actually stalled
- what can be cut to protect delivery
- where delivery risk is hitting the most valuable work
- what is blocked and needs follow-up

## Why

By the end of Phase 9, FleetGraph can see much richer issue-surface evidence:

- explicit blockers
- stale work
- business value
- top attention issues
- cut candidates

But the user experience still felt flat because different questions often got nearly the same answer.

That creates a product gap for both PMs and engineers:

1. PMs need a decision, not just a page summary
2. engineers need to know whether the next move is unblock, inspect, or trim scope
3. scrum conversations break down if the assistant treats blockers, cuts, and high-value risk as the same question

## What

Phase 10 adds a question-intent layer for issue-surface reasoning.

This phase adds:

- deterministic issue-surface intent classification
- explicit stalled-active-work signals in page context
- explicit cut-candidate signals in page context
- intent-specific summaries, grounding evidence, and next-step guidance
- route-ranking improvements so the featured route matches the question
- targeted tests for stalled-work and cut-scope conversations

## How

Phase 10 is implemented in this order:

1. enrich issue-surface page context with:
   - stalled active issues
   - cut candidates
   - richer highest-impact issue detail
2. classify issue-surface questions into intents like:
   - attention
   - stalled
   - cut
   - value risk
   - blockers
3. generate direct summaries and next steps from the matching intent contract
4. tune route selection so the featured Ship action matches the question
5. validate the slice with focused tests on page-context, reasoning, and drawer behavior

## Purpose

The purpose of Phase 10 is to make FleetGraph feel useful in the actual execution conversation.

For PMs, that means answers like:

- cut this lower-value backlog work first
- the highest-value issue is not the problem; untouched scope around it is
- start with this blocked issue, then this stalled one

For engineers, that means answers like:

- this in-progress issue looks stalled because it has not moved in 4 days
- this blocker has a named owner and a logged unblocker
- this is safe to move out without hurting the most important work

## Outcome

When Phase 10 is working well:

- different issue-tab questions get different answers
- the answer leads with a direct decision, not a generic restatement
- the recommended route matches the real question
- the assistant feels more like a PM/agile execution conversation and less like a dashboard narrator

## Scope

Included in Phase 10:

- issue-surface intent classification
- stalled active issue context
- cut candidate context
- intent-specific issue-tab reasoning
- route-ranking updates for cut and stalled questions
- targeted tests and roadmap docs

Not included in Phase 10:

- free-form model-generated conversational style across all surfaces
- broader PM/engineer persona customization outside issue surfaces
- proactive notifications for cut or stalled-work decisions
- full ownership/capacity diagnostics across every team view

## Exit Criteria

Phase 10 is complete when:

- issue-surface questions about stalled work, cuts, blockers, and impact receive distinct deterministic answers
- issue-surface context includes enough evidence to support those answers
- the primary route in the drawer changes with the question intent
- targeted tests pass for context, reasoning, and drawer route behavior
- the work is committed, pushed, and in a pull request

## Status

As of 2026-03-20:

- implementation status: complete
- verification status: passed
- merge-to-main status: pending
- production status: not live yet

## Key Touchpoints

- [useFleetGraphPageContext.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.ts)
- [reason-about-current-view.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/nodes/reason-about-current-view.ts)
- [FleetGraphOnDemandPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.tsx)
- [useFleetGraphPageContext.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFleetGraphPageContext.test.ts)
- [context-resolution.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/test/context-resolution.test.ts)
- [FleetGraphOnDemandPanel.test.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/fleetgraph/FleetGraphOnDemandPanel.test.tsx)

## Next Phase Unlocked

Phase 10 unlocks a stronger next phase around ownership and escalation quality.

Once FleetGraph can answer the right issue-surface question clearly, the next improvement is making those answers more accountable:

- who exactly needs the follow-up
- whether the issue needs local follow-up or escalation
- whether the problem is scope, dependency, or owner ambiguity

## Delivery Status

This Phase 10 slice leaves behind a usable intent-specific reasoning foundation for issue surfaces.

That means:

- issue-tab answers are now question-specific
- route recommendations are more aligned to the real decision being made
- FleetGraph is closer to a practical PM/agile assistant than a generic execution summary panel
