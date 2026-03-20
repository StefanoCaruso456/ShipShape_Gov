# FleetGraph Skills and Tools

This note defines the FleetGraph best-practice pattern for skills, tools, and action schemas.

## Core decision

FleetGraph should use:

1. graph state and rules
2. a bounded action catalog
3. runtime-owned executors

The model should never see a raw backend toolbox.

For the next FleetGraph architecture phase, that also means:

- evidence tools should be explicit and bounded
- every evidence tool should use a shared scrum context envelope
- every evidence tool should emit downstream telemetry

## Why

This keeps FleetGraph:

- safer
- easier to evaluate
- easier to trace
- easier to harden
- cleaner for HITL

## Three layers

### 1. Graph state and rules

The graph decides:

- current mode
- current context
- whether action is allowed
- whether the run stays quiet, surfaces a finding, waits on a human, or fails

### 2. Action catalog

The model sees a small explicit catalog, not every possible backend operation.

Current FleetGraph catalog:

- `draft_follow_up_comment`
- `draft_escalation_comment`

Each action definition should include:

- purpose
- description
- target entity types
- risk level
- whether HITL is required
- strict input schema
- executor type

Current catalog file:

- [catalog.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/fleetgraph/src/actions/catalog.ts)

### 3. Runtime executors

The backend owns actual execution:

- post comment
- create issue
- notify person
- future mutations

The model proposes. The runtime validates and executes.

## Skills vs tools

### Skills

Skills help the model think.

Examples:

- sprint-risk interpretation
- escalation-writing guidance
- review-gap analysis

### Tools

Tools let the system act.

Examples:

- fetch sprint context
- fetch activity
- fetch issue stats
- post a sprint comment

For FleetGraph, tools should now be split into two classes:

- read-only evidence tools
- mutation actions from the bounded action catalog

See the tooling registry:

- [tooling-registry.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/artifacts-documentation/fleetgraph-execution-assistant/tooling-registry.md)

## Skill format in this repo

FleetGraph skills follow the same local pattern used by Codex skills in this environment:

- required: `SKILL.md`
- recommended: `agents/openai.yaml`

### `SKILL.md`

`SKILL.md` is the real source file for the skill.

It should contain:

1. YAML frontmatter
2. Markdown body

Frontmatter should stay minimal:

- `name`
- `description`

The frontmatter decides when the skill triggers.

The body should stay concise and contain:

- what the skill is for
- when to use it
- the short workflow
- the key files to read or update
- any critical guardrails

### `agents/openai.yaml`

`agents/openai.yaml` is UI metadata, not the real skill logic.

Use it for:

- display name
- short description
- default prompt
- optional implicit invocation policy

It should stay aligned with `SKILL.md` and never become the only place that explains the skill.

## Current FleetGraph skills

- [.agents/skills/fleetgraph-reasoning/SKILL.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/.agents/skills/fleetgraph-reasoning/SKILL.md)
- [.agents/skills/fleetgraph-action-catalog/SKILL.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/.agents/skills/fleetgraph-action-catalog/SKILL.md)

## Research alignment

This pattern matches the current vendor guidance closely:

- OpenAI: use structured outputs and strict schemas for reliable machine-readable results, and keep Codex skills in a `SKILL.md`-first format with optional `openai.yaml`
- Anthropic: use explicit tool definitions with `input_schema` and keep agent skills/task guidance separate from raw tool freedom
- Vercel: use typed tools, explicit tool availability, and explicit step budgets instead of open-ended loops

Official references:

- [OpenAI structured outputs](https://platform.openai.com/docs/guides/function-calling/function-calling-with-structured-outputs)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills)
- [Anthropic tool use overview](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
- [Anthropic agent skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Vercel AI SDK tools and tool calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)

## FleetGraph rule of thumb

If a capability changes project state or notifies people, it belongs in:

- the action catalog
- the runtime executor layer
- the HITL policy

If it changes how FleetGraph interprets evidence, it belongs in:

- reasoning skills
- deterministic signals
- grounded prompts

If it fetches normalized scrum evidence, it belongs in:

- the evidence-tool registry
- strict TypeScript and Zod schemas
- downstream tool-call telemetry
