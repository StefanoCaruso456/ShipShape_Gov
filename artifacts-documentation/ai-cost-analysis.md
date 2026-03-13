# AI Cost Analysis

## Purpose

This document tracks how AI usage should be measured for the Shipshape codebase comprehension and audit work.

The requirement in the project brief is to capture:

- LLM API costs
- total tokens consumed
- number of API calls made
- coding agent costs
- a short reflection on where AI helped or hurt understanding

## Short Answer

We **can estimate cost from downstream Braintrust data**, but only if the traces contain token usage.

That means:

- if Braintrust receives `prompt_tokens` and `completion_tokens`, we can estimate LLM cost by multiplying those counts by the provider's published token pricing
- if Braintrust also receives an `estimated_cost` field, then the cost can be read directly from the trace data
- if Braintrust receives only a trace name with no token usage, then it is **not enough** to estimate cost accurately

So the honest answer is **not just "yes"**. It is:

- `Yes` for token-based downstream estimation
- `No` for exact cost estimation from Braintrust alone unless token or cost fields are logged

## Current Shipshape Instrumentation

Shipshape's weekly plan and retro quality analysis currently runs through AWS Bedrock using the model:

- `global.anthropic.claude-opus-4-5-20251101-v1:0`

The API now includes Braintrust telemetry around that Bedrock call.

What the telemetry is designed to log:

- operation name
- model
- region
- request ID
- stop reason
- prompt token count
- completion token count
- total token count
- estimated cost, if pricing env vars are configured

Important limitation:

- Braintrust will not magically know AWS Bedrock pricing on its own in this repo
- estimated cost is only logged if the app is configured with:
  - `BEDROCK_INPUT_COST_PER_MILLION_USD`
  - `BEDROCK_OUTPUT_COST_PER_MILLION_USD`

Without those two pricing values, Braintrust traces can still support a cost analysis, but the cost must be calculated from tokens after the fact.

## Pricing Assumption For This Repo

Current working pricing assumption for Shipshape's Bedrock model:

- input: `$5.00` per 1 million tokens
- output: `$25.00` per 1 million tokens

Source:

- AWS announcement for Claude Opus 4.5 on Bedrock published on November 24, 2025

Best-practice note:

- use this as a documented engineering assumption
- re-check the live Bedrock pricing before submitting a final cost report
- if pricing changes, update environment values instead of changing code

## What We Can Measure Reliably

### 1. LLM API Costs

We can estimate LLM API cost for Shipshape's AI analysis feature using:

`estimated cost = (input tokens / 1,000,000 * input price) + (output tokens / 1,000,000 * output price)`

This is reliable if:

- Braintrust logs token counts
- we use the correct Bedrock pricing for the exact model/version used in production

This is **an estimate**, not a billing-authoritative number.

Why:

- AWS billing is the source of truth
- traces are still the best per-request engineering view

### 2. Total Tokens Consumed

This is a good downstream Braintrust metric if the traces contain:

- `prompt_tokens`
- `completion_tokens`
- optionally cached-token fields

This requirement is reasonable to satisfy from trace data.

### 3. Number of API Calls Made

This is easy to count from traces.

For this feature, one successful plan or retro analysis should correspond to one Bedrock call.

### 4. Coding Agent Costs

This is **not automatically covered** by Shipshape's Braintrust instrumentation.

Examples:

- Codex desktop usage
- Cursor usage
- Claude Code usage
- GitHub Copilot usage

Those costs usually need to be tracked separately from:

- provider invoices
- tool dashboards
- plan/subscription cost allocation
- manual session logs

So this requirement should be documented as **manual or external tracking**, not inferred from app telemetry.

## Best-Practice Checklist

To make this analysis genuinely useful, not just technically possible, the project should have:

- token metrics in every LLM trace
- a documented pricing assumption for the exact model and provider
- per-feature trace names so costs can be grouped by workflow
- separation between application LLM costs and coding-agent costs
- a repeatable export or summary process
- a final reconciliation step against AWS billing
- privacy controls so prompts are not logged raw unless explicitly approved

Current status in Shipshape:

- Braintrust tracing around the Bedrock call: `implemented`
- token logging: `implemented`
- estimated cost logging when pricing env vars are present: `implemented`
- production-safe loading of telemetry config from SSM: `implemented`
- SSM sync script for Braintrust and pricing config: `implemented`
- automated aggregate report from live trace data: `not yet implemented`
- coding-agent cost ledger: `manual`

## Recommended Tracking Method For This Project

Use a split approach.

### App-side AI cost tracking

Use Braintrust traces for:

- request count
- token count
- per-request metadata
- estimated per-request cost

This covers the LLM calls made by the Shipshape application itself.

### Human coding-agent cost tracking

Track separately:

- which coding assistant was used
- approximate number of sessions
- subscription or usage-based cost
- whether the tool was used for exploration, implementation, debugging, or writing

This covers the AI tools used by the engineer during the audit.

## Recommended Final Deliverable

The strongest final AI cost analysis for this project should include four tables:

### 1. Application LLM usage summary

- feature name
- model
- API call count
- input tokens
- output tokens
- estimated cost

### 2. By-environment breakdown

- dev
- staging
- production

### 3. Failure and waste summary

- failed AI calls
- repeated calls caused by retries or repeated edits
- avoidable spend

### 4. Developer AI tooling summary

- tool name
- how it was used
- approximate session count
- subscription or usage cost

## Cost Analysis Template

### Development Costs

#### LLM API costs

- Source: Braintrust traces for Shipshape AI analysis requests
- Status: `Partially automatable`
- Needed for full automation:
  - token metrics in traces
  - Bedrock token pricing configured in environment or applied in post-processing

#### Total tokens consumed

- Source: Braintrust trace metrics
- Status: `Automatable`
- Breakdown needed:
  - input tokens
  - output tokens
  - total tokens

#### Number of API calls made

- Source: Braintrust trace count
- Status: `Automatable`

#### Coding agent costs

- Source: external tool billing or manual log
- Status: `Manual`

## Reflection Questions

### Which parts of the audit were AI tools most helpful for? Least helpful?

Most helpful:

- quickly locating relevant files and cross-package flows
- summarizing architecture patterns across `web/`, `api/`, and `shared/`
- accelerating repetitive codebase inspection

Least helpful:

- anything requiring precise infrastructure state or live deployment timing
- cost analysis when pricing assumptions are not explicitly configured
- cases where the tool can sound confident before the downstream evidence exists

### Did AI tools help understand the codebase, or shortcut understanding?

They helped understanding when used as a discovery and navigation aid, especially for finding entry points and relationships between systems.

They risk shortcutting understanding when summaries are accepted without checking the actual code paths, runtime environment, or deployment state.

### Where did AI suggestions need to be overridden or corrected? Why?

AI suggestions needed correction when:

- a UI screen implied success but the underlying telemetry had not ingested data yet
- deployment status looked complete before AWS had actually finished rolling updates
- cost telemetry sounded "done" before pricing inputs were configured

The common reason was that downstream proof mattered more than plausible interpretation.

### What percentage of final code changes were AI-generated vs. hand-written?

Suggested framing for this project:

- architecture discovery and first-pass implementation: heavily AI-assisted
- final corrections, environment fixes, deployment sequencing, and judgment calls: human-reviewed and selectively adjusted

If a numeric estimate is required, fill in after the project ends with a conservative range rather than a false-precision percentage.

## Bottom Line

For this repo, Braintrust can support an AI cost analysis **if the trace data includes token metrics**.

That gives us:

- total calls
- total tokens
- token breakdown
- estimated per-call and aggregate LLM cost

But it does **not** by itself solve:

- coding agent cost tracking
- authoritative AWS billing totals
- exact cost estimation when pricing inputs are missing

The right conclusion is:

- use Braintrust for application-level LLM usage and estimated cost
- use external/manual tracking for coding-agent costs
- use AWS billing as the final source of truth for spend
