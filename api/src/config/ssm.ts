/**
 * SSM Parameter Store - Application Configuration
 *
 * This file loads application configuration from AWS SSM Parameter Store.
 *
 * Secrets Storage:
 * ─────────────────
 * SSM Parameter Store (/ship/{env}/):
 *   - DATABASE_URL, SESSION_SECRET, CORS_ORIGIN
 *   - Application config that changes per environment
 *   - CAIA OAuth credentials (CAIA_ISSUER_URL, CAIA_CLIENT_ID, etc.)
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Lazy-initialized client to avoid keeping Node.js alive during import tests
let _client: SSMClient | null = null;

function getClient(): SSMClient {
  if (!_client) {
    _client = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return _client;
}

export async function getSSMSecret(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });

  const response = await getClient().send(command);
  if (!response.Parameter?.Value) {
    throw new Error(`SSM parameter ${name} not found`);
  }
  return response.Parameter.Value;
}

function isParameterMissing(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'ParameterNotFound' ||
    error.name === 'ParameterNotFoundException' ||
    error.message.includes('not found')
  );
}

async function getOptionalSSMSecret(name: string): Promise<string | undefined> {
  try {
    return await getSSMSecret(name);
  } catch (error) {
    if (isParameterMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

function setIfDefined(name: string, value: string | undefined): boolean {
  if (!value) return false;
  process.env[name] = value;
  return true;
}

export async function loadProductionSecrets(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    return; // Use .env files for local dev
  }

  const environment = process.env.ENVIRONMENT || 'prod';
  const basePath = `/ship/${environment}`;

  console.log(`Loading secrets from SSM path: ${basePath}`);

  const [databaseUrl, sessionSecret, corsOrigin, cdnDomain, appBaseUrl] = await Promise.all([
    getSSMSecret(`${basePath}/DATABASE_URL`),
    getSSMSecret(`${basePath}/SESSION_SECRET`),
    getSSMSecret(`${basePath}/CORS_ORIGIN`),
    getSSMSecret(`${basePath}/CDN_DOMAIN`),
    getSSMSecret(`${basePath}/APP_BASE_URL`),
  ]);

  const [
    braintrustApiKey,
    braintrustProject,
    braintrustOrgName,
    braintrustAppUrl,
    braintrustLogPrompts,
    bedrockInputCost,
    bedrockOutputCost,
  ] = await Promise.all([
    getOptionalSSMSecret(`${basePath}/BRAINTRUST_API_KEY`),
    getOptionalSSMSecret(`${basePath}/BRAINTRUST_PROJECT`),
    getOptionalSSMSecret(`${basePath}/BRAINTRUST_ORG_NAME`),
    getOptionalSSMSecret(`${basePath}/BRAINTRUST_APP_URL`),
    getOptionalSSMSecret(`${basePath}/BRAINTRUST_LOG_PROMPTS`),
    getOptionalSSMSecret(`${basePath}/BEDROCK_INPUT_COST_PER_MILLION_USD`),
    getOptionalSSMSecret(`${basePath}/BEDROCK_OUTPUT_COST_PER_MILLION_USD`),
  ]);

  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = sessionSecret;
  process.env.CORS_ORIGIN = corsOrigin;
  process.env.CDN_DOMAIN = cdnDomain;
  process.env.APP_BASE_URL = appBaseUrl;

  const optionalAiValuesLoaded = [
    setIfDefined('BRAINTRUST_API_KEY', braintrustApiKey),
    setIfDefined('BRAINTRUST_PROJECT', braintrustProject),
    setIfDefined('BRAINTRUST_ORG_NAME', braintrustOrgName),
    setIfDefined('BRAINTRUST_APP_URL', braintrustAppUrl),
    setIfDefined('BRAINTRUST_LOG_PROMPTS', braintrustLogPrompts),
    setIfDefined('BEDROCK_INPUT_COST_PER_MILLION_USD', bedrockInputCost),
    setIfDefined('BEDROCK_OUTPUT_COST_PER_MILLION_USD', bedrockOutputCost),
  ].filter(Boolean).length;

  console.log('Secrets loaded from SSM Parameter Store');
  console.log(`CORS_ORIGIN: ${corsOrigin}`);
  console.log(`CDN_DOMAIN: ${cdnDomain}`);
  console.log(`APP_BASE_URL: ${appBaseUrl}`);
  if (optionalAiValuesLoaded > 0) {
    console.log(`Loaded ${optionalAiValuesLoaded} optional AI telemetry settings from SSM Parameter Store`);
  }
}
