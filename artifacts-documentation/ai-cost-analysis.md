# AI Cost Analysis

## Summary

This document provides a validated cost analysis for Shipshape's application-side AI feature based on successful Braintrust telemetry from the deployed environment.

The current analysis is based on the live provider path that successfully completed requests:

- provider: `OpenAI`
- model: `gpt-4.1-mini`
- operation: `shipshape.ai.analyze-plan`

The telemetry is sufficient to support:

- LLM API cost estimation
- total token reporting
- API call count reporting
- monthly user-scale cost projections

The telemetry is not sufficient to support:

- coding-agent cost tracking
- authoritative cloud billing totals
- final AWS Bedrock Claude Opus 4.5 production cost, because the Bedrock path was blocked by quota approval during validation

## Validated Telemetry

The deployed application now records the following Braintrust fields for successful AI analysis requests:

- prompt tokens
- completion tokens
- total tokens
- estimated cost
- latency
- request ID
- model
- provider
- finish reason

This confirms that the application has the minimum required telemetry to produce a defensible AI cost analysis for the currently deployed path.

## Confirmed Successful Request

Validated Braintrust trace:

- trace: `shipshape.ai.analyze-plan`
- provider: `openai`
- model: `gpt-4.1-mini`
- prompt tokens: `834`
- completion tokens: `1,175`
- total tokens: `2,009`
- estimated cost displayed by Braintrust: `$0.002`
- latency: `17,991 ms`

Braintrust rounds the displayed cost. The more precise request cost is:

`(834 / 1,000,000 * 0.4) + (1175 / 1,000,000 * 1.6) = 0.0022136 USD`

Validated per-request working value:

- **`$0.0022136` per successful `shipshape.ai.analyze-plan` call**

## Pricing Assumptions

The deployed environment uses the following pricing inputs for this analysis:

- input token price: `$0.40` per 1 million tokens
- output token price: `$1.60` per 1 million tokens

These values were supplied through environment configuration and recorded in Braintrust with `pricing_source=env`.

## Cost Methodology

### Formula

Application request cost is calculated as:

`estimated cost = (prompt tokens / 1,000,000 * input price) + (completion tokens / 1,000,000 * output price)`

### Validated Example

- prompt cost: `834 / 1,000,000 * 0.4 = $0.0003336`
- completion cost: `1175 / 1,000,000 * 1.6 = $0.00188`
- total cost: `$0.0022136`

## Development Cost Coverage

### LLM API costs

Covered by current telemetry.

The application now logs enough information to estimate per-request and aggregate LLM API cost for successful requests.

### Total tokens consumed

Covered by current telemetry.

Available fields:

- prompt tokens
- completion tokens
- total tokens

### Number of API calls made

Covered by current telemetry.

Successful calls can be counted directly from Braintrust traces by operation name.

### Coding agent costs

Not covered by current telemetry.

This category requires separate tracking from subscription data, invoices, or manual usage logs for tools such as:

- Codex
- Cursor
- Claude Code
- GitHub Copilot

## Monthly User Cost Analysis

### Monthly Assumption

This table uses the following assumption:

- each active user triggers **4 successful analyses per month**
- cost per analysis = **`$0.0022136`**

This represents a light monthly usage pattern of approximately one analysis per week per active user.

Monthly cost formula:

`monthly cost = active users * 4 * 0.0022136`

### Monthly Cost Table

| Active users | Monthly analyses | Estimated monthly cost |
| --- | ---: | ---: |
| 100 | 400 | $0.8854 |
| 1,000 | 4,000 | $8.8544 |
| 10,000 | 40,000 | $88.5440 |
| 100,000 | 400,000 | $885.4400 |

## Interpretation

Under the validated OpenAI path, the feature is inexpensive at low and medium scale under a light monthly usage assumption.

Costs will increase if:

- users trigger repeated re-analysis while editing
- both plan and retro analysis run regularly
- requests become longer
- outputs become longer
- the application is switched to a more expensive model

## Limitations

This analysis should be presented with the following constraints:

- it reflects the validated **OpenAI direct** deployment path
- it does not represent final **AWS Bedrock Claude Opus 4.5** production cost
- it is an engineering estimate, not a billing-authoritative total
- it excludes coding-agent cost

## Recommended Final Framing

For reporting purposes, the strongest and most defensible framing is:

1. Present the validated per-request application AI cost from Braintrust
2. Present the monthly user-scale projection table
3. State clearly that coding-agent cost is tracked separately
4. State clearly that cloud billing remains the final source of truth for invoice-level spend

## Reflection Notes

### Most helpful uses of AI during the audit

- locating relevant files and entry points quickly
- understanding cross-package relationships
- accelerating repeated implementation and debugging tasks

### Least helpful uses of AI during the audit

- interpreting partially complete infrastructure state
- inferring success before downstream telemetry or cloud state confirmed it
- making cost claims before a successful billable request existed

### Areas requiring correction or override

Corrections were required when:

- infrastructure UI state implied success before deployment completed
- Braintrust project setup existed without successful billable traces
- Bedrock billing, quota, and model-access issues appeared similar from the surface

## Conclusion

Shipshape now has sufficient telemetry to support a professional application-side AI cost analysis for the currently deployed OpenAI path.

The validated benchmark is:

- **`$0.0022136` per successful `shipshape.ai.analyze-plan` request on `gpt-4.1-mini`**

This is sufficient for:

- application LLM API cost analysis
- token consumption analysis
- request count analysis
- monthly user-scale projections

It is not sufficient, by itself, for:

- coding-agent cost analysis
- final provider invoice reconciliation
- final Bedrock Claude Opus 4.5 production cost reporting
