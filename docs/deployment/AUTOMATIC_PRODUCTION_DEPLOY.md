# Automatic Production Deploy

## What it does

Production now has one release path:

- merging to `main` triggers GitHub Actions
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
