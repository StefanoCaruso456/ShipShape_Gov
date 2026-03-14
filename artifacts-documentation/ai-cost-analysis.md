# AI Cost Analysis

## Executive Summary

Yes, we now have enough telemetry to produce a correct **application-side AI cost analysis** for the currently deployed path.

What is now validated:

- Braintrust is receiving successful traces
- traces include prompt tokens, completion tokens, total tokens, and estimated cost
- the live app is currently using **OpenAI direct** for AI analysis
- the validated successful model is **`gpt-4.1-mini`**

What is **not** covered by this telemetry alone:

- coding-agent costs such as Codex, Cursor, Claude Code, or Copilot
- authoritative AWS billing totals
- AWS Bedrock Claude Opus 4.5 production-equivalent cost, because Bedrock quota approval was still blocking successful Opus runs

So the honest conclusion is:

- **Yes** for Shipshape application AI cost analysis on the deployed OpenAI path
- **No** for coding-agent cost tracking without separate manual or billing data
- **No** for claiming this is the final Bedrock Opus production cost

## Validated Telemetry State

As of **March 13, 2026** in the deployed environment:

- operation: `shipshape.ai.analyze-plan`
- provider: `openai`
- model: `gpt-4.1-mini`
- Braintrust metadata includes:
  - `provider`
  - `model`
  - `request_id`
  - `finish_reason`
  - `pricing_source`
- Braintrust metrics includes:
  - `prompt_tokens`
  - `completion_tokens`
  - `tokens`
  - `estimated_cost`
  - `latency_ms`

This is the first successful end-to-end proof that the telemetry implementation is working for real billable AI calls.

## Confirmed Successful Trace

Confirmed Braintrust trace:

- trace name: `shipshape.ai.analyze-plan`
- provider: `openai`
- model: `gpt-4.1-mini`
- prompt tokens: `834`
- completion tokens: `1,175`
- total tokens: `2,009`
- estimated cost shown in Braintrust: `$0.002`
- latency: `17,991 ms`
- pricing source: `env`

Braintrust rounds the displayed dollar amount. The more exact cost from the logged token counts is:

`(834 / 1,000,000 * 0.4) + (1175 / 1,000,000 * 1.6) = 0.0022136 USD`

Rounded working value:

- **per successful analyze-plan call: `$0.0022`**

## Pricing Basis

The deployed OpenAI pricing values used by the app are:

- input: `$0.40` per 1 million tokens
- output: `$1.60` per 1 million tokens

These were loaded into the environment and recorded in Braintrust as `pricing_source=env`.

## Development Cost Summary

### LLM API costs

For the currently validated deployment path, we can now calculate Shipshape AI request cost directly from Braintrust traces.

Formula:

`estimated cost = (prompt tokens / 1,000,000 * input price) + (completion tokens / 1,000,000 * output price)`

Validated example:

- prompt cost: `834 / 1,000,000 * 0.4 = $0.0003336`
- completion cost: `1175 / 1,000,000 * 1.6 = $0.00188`
- total: `$0.0022136`

### Total tokens consumed

Validated and available from Braintrust:

- prompt tokens
- completion tokens
- total tokens

### Number of API calls made

Validated and available from Braintrust by counting successful traces such as:

- `shipshape.ai.analyze-plan`
- `shipshape.ai.analyze-retro`

### Coding agent costs

Not covered by this telemetry.

These still require separate tracking from:

- Codex usage
- Cursor usage
- Claude Code usage
- Copilot usage
- subscription or invoice data

## Monthly User Cost Analysis Table

### Monthly Assumption

The table below assumes:

- cost per successful `analyze-plan` call = **`$0.0022136`**
- each active user triggers **4 analyses per month**

That corresponds to a lightweight monthly usage assumption, such as:

- roughly 1 analysis per week per active user

Monthly formula:

`monthly cost = active users * 4 * 0.0022136`

If your real usage is different, substitute the monthly analyses-per-user number in that formula.

### Monthly Cost by User Count

| Active users | Monthly calls assumed | Estimated monthly cost |
| --- | ---: | ---: |
| 100 | 400 | $0.8854 |
| 1,000 | 4,000 | $8.8544 |
| 10,000 | 40,000 | $88.5440 |
| 100,000 | 400,000 | $885.4400 |

## Practical Interpretation

This means the current validated OpenAI path is inexpensive at low and mid-scale for this specific analysis feature under a light monthly usage assumption.

However, real spend can rise due to:

- repeated re-analysis while users edit
- both plan and retro analysis running in the same week
- retries, failures, or duplicate submissions
- switching to a larger model
- longer prompts or longer outputs

## Recommended Final Reporting Framing

For the project deliverable, the safest framing is:

1. **Validated current application AI cost**
   - based on successful Braintrust traces from the deployed OpenAI path
2. **Scaling estimate**
   - based on the observed per-call token profile and the user-count table above
3. **Known limitation**
   - this is not yet the final AWS Bedrock Claude Opus 4.5 production cost
4. **Separate manual section**
   - coding-agent costs must be tracked outside Braintrust

## Reflection Questions

### Which parts of the audit were AI tools most helpful for? Least helpful?

Most helpful:

- finding code paths quickly
- understanding cross-package relationships
- accelerating repeated inspection and implementation work

Least helpful:

- interpreting partially complete cloud deployment state
- anything where the UI implied success before the underlying infrastructure was actually ready
- cost claims before real successful traces existed

### Did AI tools help understand the codebase, or shortcut understanding?

They helped when used as navigation and implementation acceleration tools.

They risked shortcutting understanding when summaries were accepted before checking the real runtime behavior, deployment status, and telemetry output.

### Where did AI suggestions need to be overridden or corrected? Why?

Corrections were needed when:

- the Braintrust project existed but had no real traces yet
- Bedrock access errors looked like application bugs
- billing, quotas, and model authorization were easy to confuse
- a successful-looking UI state did not match actual downstream metrics

The common issue was that downstream evidence mattered more than plausible interpretation.

### What percentage of final code changes were AI-generated vs. hand-written?

Reasonable final framing:

- first-pass discovery and implementation were heavily AI-assisted
- final telemetry validation, cloud debugging, secret management, and deployment corrections required human review and selective correction

If a numeric estimate is required, use a conservative range instead of false precision.

## Bottom Line

Shipshape now has enough telemetry to support a real **application AI cost analysis**.

The currently validated benchmark is:

- **`$0.0022136` per successful `shipshape.ai.analyze-plan` call on `gpt-4.1-mini`**

That is enough to support:

- LLM API cost reporting
- token reporting
- API call count reporting
- user-scale sensitivity analysis

It is **not** enough by itself to report:

- coding-agent cost
- final AWS billing truth
- final Bedrock Claude Opus 4.5 production cost
