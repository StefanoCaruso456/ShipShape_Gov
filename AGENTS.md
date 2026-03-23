# Repo Delivery Rule

Finished work must not remain stranded on a feature branch, temporary worktree, or a single agent session.

When work is accepted, deployed, or otherwise considered done, the required finish line is:

1. Commit the changes.
2. Move the committed changes onto local `main` if they were developed elsewhere.
3. Push the resulting commit to `origin/main`.
4. If production should reflect the work, redeploy production from that exact `main` commit.

Pull requests are optional review tooling, not a requirement for Ship's delivery workflow.

Do not report a coding task as complete if the changes are only local or only deployed. A completed task must be reachable from `origin/main`, and production deployments must come from that committed `main` state.

If pushing to `main` or redeploying is blocked, explicitly report the blocker instead of implying the work is fully finished.
