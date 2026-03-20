# FleetGraph Delivery Rule

## Rule

When a FleetGraph phase or meaningful sub-phase is complete enough to report as done, it must immediately move through the full delivery path:

1. commit the verified work
2. push the branch
3. open or update the pull request
4. report the exact state of the work

Completed work must not sit only in a local worktree.

## Why

Leaving finished work uncommitted or unpushed creates avoidable merge conflicts, stale branches, and ambiguity about what is actually done.

The rule exists to keep:

- branch state current
- review state visible
- merge risk lower
- deployment path clear

## Required Status Language

Whenever status is reported, use these exact distinctions:

- `implemented locally`
- `committed`
- `pushed`
- `PR open`
- `merged to main`
- `live on production`

Do not say a phase is fully done unless the state is explicit.

## Practical Standard

For FleetGraph roadmap work, the minimum acceptable completion path is:

1. code and docs updated
2. targeted verification passed
3. commit created
4. branch pushed
5. PR open or updated

After that, the remaining states are:

- merged to `main`
- auto-deployed to production

## Current Interpretation

For this roadmap:

- a phase can be `implementation complete` when code, docs, tests, commit, push, and PR are all done
- a phase is not `product complete` until it is merged and live
