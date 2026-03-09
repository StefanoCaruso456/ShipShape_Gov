# Task 13: Build and Deploy

## Dockerfile

The root [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L1) builds a **production API image**, not a full monolith image with the frontend inside it.

What it does:

- starts from `node:20-slim` hosted in public ECR [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L2)
- installs `pnpm` [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L10)
- installs **production dependencies only** [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L18)
- copies in **prebuilt** `shared/dist` and `api/dist` instead of compiling in the image [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L21)
- sets `PORT=80` and runs migrations before starting the API [Dockerfile](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/Dockerfile#L28)

So the build output is:

- one runtime container for the Express API
- containing built backend JS plus built `shared/` artifacts
- with migrations executed on container startup

It does **not** build or serve the React frontend. The frontend is deployed separately to S3/CloudFront.

## docker-compose.yml

The root [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L1) starts exactly **one service**:

- `postgres` using `postgres:16` [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L17)

Details:

- database name: `ship_dev` [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L20)
- user: `ship` [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L21)
- port mapping: `5432:5432` [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L24)
- persistent volume: `postgres_data` [docker-compose.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.yml#L26)

Important caveat: this is **not** the full local app stack. It is only a local PostgreSQL helper. The fuller dev stack is in `docker-compose.local.yml`, not this file.

## Terraform

The Terraform config expects an AWS deployment with these main parts:

- a dedicated VPC with 2 public subnets, 2 private subnets, Internet Gateway, NAT Gateway, and VPC Flow Logs [terraform/vpc.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/vpc.tf#L5)
- an Elastic Beanstalk application/environment for the API, behind an ALB, with EC2 instances in private subnets [terraform/elastic-beanstalk.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/elastic-beanstalk.tf#L2)
- an Aurora PostgreSQL Serverless v2 cluster in private subnets [terraform/database.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/database.tf#L34)
- an S3 bucket for the frontend plus a CloudFront distribution in front of it [terraform/s3-cloudfront.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/s3-cloudfront.tf#L45)
- CloudFront routing for:
  - static SPA assets from S3
  - `/api/*` to Elastic Beanstalk
  - `/collaboration/*` and `/events` for WebSockets
  - `/.well-known/*` for auth/JWKS endpoints
  - [terraform/s3-cloudfront.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/s3-cloudfront.tf#L144)
- WAF protection on CloudFront with rate limits and AWS managed rules [terraform/waf.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/waf.tf#L35)
- SSM Parameter Store for runtime configuration like `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `APP_BASE_URL` [terraform/ssm.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/ssm.tf#L1)
- IAM roles granting EB instances access to SSM, Bedrock, and Secrets Manager [terraform/ssm.tf](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/ssm.tf#L122)

The architecture summary in [terraform/README.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/terraform/README.md#L136) matches that: VPC, security groups, Aurora, Elastic Beanstalk, S3, CloudFront, and outputs for deployment scripts.

## CI/CD

I did **not** find a checked-in CI pipeline definition such as:

- `.github/workflows/*`
- `.gitlab-ci.yml`
- `buildspec.yml`
- `Jenkinsfile`

What the repo actually has is **manual/script-driven deployment**, not repo-configured CI/CD.

Evidence:

- the architecture doc explicitly says: `CI/CD: Manual deploys initially (scripts, not pipeline)` [docs/application-architecture.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docs/application-architecture.md#L839)
- infrastructure deploy is handled by [scripts/deploy-infrastructure.sh](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/deploy-infrastructure.sh#L18), which syncs config from SSM and runs `terraform init/plan/apply`
- API deploy is handled by [scripts/deploy.sh](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/deploy.sh#L4), which:
  - rebuilds `shared/` and `api/`
  - verifies SQL/migrations were copied
  - test-builds the Docker image locally
  - zips the deployment bundle
  - uploads it to S3
  - creates an Elastic Beanstalk application version
  - updates the EB environment
  - [scripts/deploy.sh](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/deploy.sh#L101)
- frontend deploy is handled by [scripts/deploy-web.sh](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/scripts/deploy-web.sh#L60), which builds `web/`, syncs `web/dist` to S3, then invalidates CloudFront

So the practical pipeline is:

1. `deploy-infrastructure.sh` for infra changes
2. `deploy.sh <env>` for API releases to Elastic Beanstalk
3. `deploy-web.sh <env>` for frontend releases to S3 + CloudFront

## Bottom line

- The root `Dockerfile` produces a deployable **API runtime image** from prebuilt artifacts.
- The root `docker-compose.yml` starts **only PostgreSQL**.
- The target cloud is **AWS**: VPC, ALB/Elastic Beanstalk, Aurora Serverless v2, S3, CloudFront, WAF, SSM, IAM, and Secrets Manager access.
- There is no checked-in CI pipeline. Deployment is currently **manual but scripted**.
