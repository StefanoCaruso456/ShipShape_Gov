# Ship Agent Rules

## Mainline Sync Rule

- Do not leave completed or deployed work only in a local branch, local worktree, or local session.
- Before closing a coding task with accepted or deployed changes, commit the work, push a branch, open a pull request, and merge it to `main`.
- If the current branch is stale, rebase or cherry-pick the finished work onto the latest `origin/main` before pushing.
- If push, PR, or merge cannot be completed, stop and report the blocker explicitly. Do not describe the work as finished while it exists only locally.
- Production deploys must map to a commit that is reachable from `main`.
