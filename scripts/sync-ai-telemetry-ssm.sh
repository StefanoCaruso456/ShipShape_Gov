#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

TARGET_ENVIRONMENT="${1:-${ENVIRONMENT:-dev}}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENV_FILE="${AI_TELEMETRY_ENV_FILE:-$PROJECT_ROOT/api/.env.local}"
SSM_BASE_PATH="/ship/${TARGET_ENVIRONMENT}"

BRAINTRUST_PROJECT_DEFAULT="Shipshape"
BRAINTRUST_LOG_PROMPTS_DEFAULT="false"

# AWS announced Claude Opus 4.5 on Bedrock at $5 / 1M input tokens and
# $25 / 1M output tokens on 2025-11-24. Keep these configurable so they can
# be updated without code changes if AWS changes pricing later.
BEDROCK_INPUT_COST_DEFAULT="5"
BEDROCK_OUTPUT_COST_DEFAULT="25"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: ${command_name} is required but not installed."
    exit 1
  fi
}

put_string_parameter() {
  local name="$1"
  local value="$2"

  aws ssm put-parameter \
    --name "${SSM_BASE_PATH}/${name}" \
    --type String \
    --value "$value" \
    --overwrite \
    --region "$AWS_REGION" \
    >/dev/null

  echo "Synced ${SSM_BASE_PATH}/${name}"
}

put_secure_parameter() {
  local name="$1"
  local value="$2"

  aws ssm put-parameter \
    --name "${SSM_BASE_PATH}/${name}" \
    --type SecureString \
    --value "$value" \
    --overwrite \
    --region "$AWS_REGION" \
    >/dev/null

  echo "Synced ${SSM_BASE_PATH}/${name} (SecureString)"
}

require_command aws

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: env file not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${BRAINTRUST_API_KEY:-}" ]; then
  echo "Error: BRAINTRUST_API_KEY must be set in $ENV_FILE"
  exit 1
fi

put_secure_parameter "BRAINTRUST_API_KEY" "$BRAINTRUST_API_KEY"
put_string_parameter "BRAINTRUST_PROJECT" "${BRAINTRUST_PROJECT:-$BRAINTRUST_PROJECT_DEFAULT}"
put_string_parameter "BRAINTRUST_LOG_PROMPTS" "${BRAINTRUST_LOG_PROMPTS:-$BRAINTRUST_LOG_PROMPTS_DEFAULT}"
put_string_parameter "BEDROCK_INPUT_COST_PER_MILLION_USD" "${BEDROCK_INPUT_COST_PER_MILLION_USD:-$BEDROCK_INPUT_COST_DEFAULT}"
put_string_parameter "BEDROCK_OUTPUT_COST_PER_MILLION_USD" "${BEDROCK_OUTPUT_COST_PER_MILLION_USD:-$BEDROCK_OUTPUT_COST_DEFAULT}"

if [ -n "${BRAINTRUST_ORG_NAME:-}" ]; then
  put_string_parameter "BRAINTRUST_ORG_NAME" "$BRAINTRUST_ORG_NAME"
fi

if [ -n "${BRAINTRUST_APP_URL:-}" ]; then
  put_string_parameter "BRAINTRUST_APP_URL" "$BRAINTRUST_APP_URL"
fi

echo ""
echo "AI telemetry configuration synced to SSM for environment: ${TARGET_ENVIRONMENT}"
echo "AWS region: ${AWS_REGION}"
echo "SSM base path: ${SSM_BASE_PATH}"
