# Automatic Production Deploy

## What it does

Production now has one release path:

- merging to `main` triggers GitHub Actions
- the workflow validates from a clean checkout before it deploys
- the workflow deploys the API to Elastic Beanstalk
- the workflow deploys the frontend to S3
- the workflow invalidates CloudFront
- the workflow waits for health checks before reporting success

## Files

- workflow: `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/.github/workflows/deploy-production.yml`
- deploy script: `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/deploy-production.sh`

## AWS auth

The workflow uses GitHub OIDC, not long-lived AWS keys.

- OIDC provider: `arn:aws:iam::958126465649:oidc-provider/token.actions.githubusercontent.com`
- deploy role: `arn:aws:iam::958126465649:role/ship-github-actions-prod-deployer`

The role trust is limited to:

- repo: `StefanoCaruso456/ShipShape_Gov`
- branch: `main`

The current role policy source of truth lives in:

- `/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/deployment/github-actions-prod-role-policy.json`

That policy includes the Elastic Beanstalk read actions and S3 bucket policy read access that EB needs during version activation.

## Manual fallback

If you need to run the exact same release path from terminal:

```bash
pnpm deploy:prod
```

## How to validate

GitHub:

- open `Actions`
- run `Deploy Production` manually with `workflow_dispatch`, or merge to `main`
- confirm the workflow finishes green

AWS:

- Elastic Beanstalk environment `ship-api-prod` shows the new `Running version`
- CloudFront invalidation completes for distribution `E37YBR10E6ZD0N`
- the live app root returns `200`
- `/health` returns `200`

## Clean-checkout note

The CI validation command is:

```bash
pnpm verify:ci
```

That builds the shared FleetGraph workspace artifacts first and then runs the monorepo type-check. This avoids false failures in GitHub Actions when the runner starts from an empty `dist/` state.

## Fail-fast note

The deploy script now watches Elastic Beanstalk events during rollout and exits as soon as EB reports a deployment error. It also confirms that the requested version label becomes the active environment version before the workflow reports success.
