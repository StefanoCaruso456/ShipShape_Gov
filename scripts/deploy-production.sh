#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

AWS_REGION="${AWS_REGION:-us-east-1}"
EB_APP_NAME="${EB_APP_NAME:-ship-api}"
EB_ENV_NAME="${EB_ENV_NAME:-ship-api-prod}"
EB_ARTIFACT_BUCKET="${EB_ARTIFACT_BUCKET:-elasticbeanstalk-us-east-1-958126465649}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:-ship-frontend-dev-958126465649}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E37YBR10E6ZD0N}"
VERSION_LABEL="${VERSION_LABEL:-v$(date +%Y%m%d%H%M%S)}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-30}"
MAX_API_POLL_ATTEMPTS="${MAX_API_POLL_ATTEMPTS:-30}"

log_step() {
  printf "\n==> %s\n" "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: $1"
    exit 1
  fi
}

latest_deploy_errors() {
  local deploy_started_at="$1"

  aws elasticbeanstalk describe-events \
    --region "$AWS_REGION" \
    --environment-name "$EB_ENV_NAME" \
    --severity ERROR \
    --max-items 10 \
    --query 'Events[].[EventDate,Message]' \
    --output text 2>/dev/null | awk -v start="$deploy_started_at" '$1 >= start { print }' | grep -v '^None$' || true
}

wait_for_api_health() {
  local target_version="$1"
  local deploy_started_at="$2"
  local attempt=1

  while [ "$attempt" -le "$MAX_API_POLL_ATTEMPTS" ]; do
    local state
    local version_label
    local health
    local health_status
    local status
    local error_events

    state="$(aws elasticbeanstalk describe-environments \
      --region "$AWS_REGION" \
      --environment-names "$EB_ENV_NAME" \
      --query 'Environments[0].[VersionLabel,Health,HealthStatus,Status]' \
      --output text)"

    version_label="$(printf '%s' "$state" | awk '{print $1}')"
    health="$(printf '%s' "$state" | awk '{print $2}')"
    health_status="$(printf '%s' "$state" | awk '{print $3}')"
    status="$(printf '%s' "$state" | awk '{print $4}')"

    printf '   poll %s/%s -> version=%s health=%s health_status=%s status=%s\n' \
      "$attempt" "$MAX_API_POLL_ATTEMPTS" "$version_label" "$health" "$health_status" "$status"

    if [ "$version_label" = "$target_version" ] && [ "$health" = "Green" ] && [ "$health_status" = "Ok" ] && [ "$status" = "Ready" ]; then
      return 0
    fi

    error_events="$(latest_deploy_errors "$deploy_started_at")"
    if [ -n "$error_events" ]; then
      echo "ERROR: Elastic Beanstalk reported deployment errors:"
      printf '%s\n' "$error_events"
      return 1
    fi

    sleep "$POLL_INTERVAL_SECONDS"
    attempt=$((attempt + 1))
  done

  echo "ERROR: Elastic Beanstalk environment did not become Green/Ok/Ready in time"
  return 1
}

docker_smoke_test() {
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "   Docker not available, skipping local container smoke test"
    return 0
  fi

  log_step "Running Docker smoke test"

  docker build -t ship-api:pre-deploy-test . >/dev/null

  local import_test
  import_test="$(docker run --rm \
    -e SESSION_SECRET=test-secret-for-import-check \
    -e DATABASE_URL=postgres://test:test@localhost/test \
    ship-api:pre-deploy-test node -e "
      import('./dist/app.js')
        .then(() => { console.log('OK'); process.exit(0); })
        .catch((error) => { console.error('FAIL:', error.message); process.exit(1); })
    " 2>&1)"

  if [ "$import_test" != "OK" ]; then
    echo "ERROR: Container import smoke test failed"
    echo "$import_test"
    exit 1
  fi
}

require_command aws
require_command pnpm
require_command zip
require_command curl

cd "$PROJECT_ROOT"

log_step "Building API artifacts"
rm -rf shared/dist shared/tsconfig.tsbuildinfo fleetgraph/dist fleetgraph/tsconfig.tsbuildinfo api/dist api/tsconfig.tsbuildinfo web/dist web/tsconfig.tsbuildinfo
pnpm build:api

if [ ! -f "api/dist/db/schema.sql" ]; then
  echo "ERROR: schema.sql not found in api/dist/db/"
  exit 1
fi

if [ ! -d "api/dist/db/migrations" ]; then
  echo "ERROR: migrations directory not found in api/dist/db/"
  exit 1
fi

SRC_COUNT="$(find api/src/db/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
DIST_COUNT="$(find api/dist/db/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

if [ "$SRC_COUNT" != "$DIST_COUNT" ]; then
  echo "ERROR: Migration count mismatch. src=$SRC_COUNT dist=$DIST_COUNT"
  exit 1
fi

docker_smoke_test

log_step "Building frontend artifacts"
VITE_APP_ENV=production pnpm build:web

log_step "Packaging Elastic Beanstalk bundle"
BUNDLE_PATH="/tmp/api-${VERSION_LABEL}.zip"
trap 'rm -f "$BUNDLE_PATH"' EXIT

zip -rq "$BUNDLE_PATH" \
  Dockerfile \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  api/dist \
  api/package.json \
  fleetgraph/dist \
  fleetgraph/package.json \
  shared/dist \
  shared/package.json \
  -x "*.git*"

if [ -d "api/.ebextensions" ]; then
  (cd api && zip -rq "$BUNDLE_PATH" .ebextensions)
fi

if [ -d "api/.platform" ]; then
  (cd api && zip -rq "$BUNDLE_PATH" .platform)
fi

ARTIFACT_KEY="deploy/api-${VERSION_LABEL}.zip"

log_step "Deploying API bundle ${VERSION_LABEL}"
aws s3 cp "$BUNDLE_PATH" "s3://${EB_ARTIFACT_BUCKET}/${ARTIFACT_KEY}" --region "$AWS_REGION"

aws elasticbeanstalk create-application-version \
  --region "$AWS_REGION" \
  --application-name "$EB_APP_NAME" \
  --version-label "$VERSION_LABEL" \
  --source-bundle "S3Bucket=${EB_ARTIFACT_BUCKET},S3Key=${ARTIFACT_KEY}" \
  --no-cli-pager >/dev/null

DEPLOY_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")"

aws elasticbeanstalk update-environment \
  --region "$AWS_REGION" \
  --environment-name "$EB_ENV_NAME" \
  --version-label "$VERSION_LABEL" \
  --no-cli-pager >/dev/null

wait_for_api_health "$VERSION_LABEL" "$DEPLOY_STARTED_AT"

log_step "Deploying frontend assets"
aws s3 sync web/dist/ "s3://${FRONTEND_BUCKET}" \
  --region "$AWS_REGION" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

aws s3 cp web/dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --region "$AWS_REGION" \
  --cache-control "public,max-age=300" \
  --content-type "text/html; charset=utf-8"

log_step "Invalidating CloudFront"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths '/*' \
  --query 'Invalidation.Id' \
  --output text)"

aws cloudfront wait invalidation-completed \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"

CLOUDFRONT_DOMAIN="$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DomainName' \
  --output text)"

log_step "Verifying live production"
curl -fsSI "https://${CLOUDFRONT_DOMAIN}" >/dev/null
curl -fsSI "https://${CLOUDFRONT_DOMAIN}/health" >/dev/null

LIVE_ASSET="$(curl -fsS "https://${CLOUDFRONT_DOMAIN}" | grep -o 'assets/index-[^"]*' | head -n 1)"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "api_version=${VERSION_LABEL}"
    echo "cloudfront_domain=${CLOUDFRONT_DOMAIN}"
    echo "cloudfront_invalidation_id=${INVALIDATION_ID}"
    echo "live_asset=${LIVE_ASSET}"
  } >>"$GITHUB_OUTPUT"
fi

SUMMARY=$(cat <<EOF
### Production deployment complete
- API version: \`${VERSION_LABEL}\`
- Elastic Beanstalk environment: \`${EB_ENV_NAME}\`
- Frontend bucket: \`${FRONTEND_BUCKET}\`
- CloudFront distribution: \`${CLOUDFRONT_DISTRIBUTION_ID}\`
- CloudFront invalidation: \`${INVALIDATION_ID}\`
- Live domain: \`https://${CLOUDFRONT_DOMAIN}\`
- Live asset: \`${LIVE_ASSET}\`
EOF
)

printf '\n%s\n' "$SUMMARY"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$SUMMARY" >>"$GITHUB_STEP_SUMMARY"
fi
