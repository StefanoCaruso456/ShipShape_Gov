---
name: architecture-diagram
description: Generate repo-grounded architecture, package relationship, request-flow, data-model, and realtime Mermaid diagrams from a codebase. Use when a user asks for system maps, onboarding diagrams, request flows, component relationships, or monorepo architecture documentation.
---

# Architecture Diagram

## Purpose
Create accurate, repository-grounded diagrams that help engineers understand how a system is organized and how data moves through it.

## Use when
- The user asks for architecture diagrams, Mermaid diagrams, system maps, request flows, package relationships, or onboarding docs.
- The user is trying to understand a new repository or monorepo.
- The user needs diagrams for a design doc, audit, review, or architecture write-up.

## Do not do
- Do not invent components, services, tables, or flows that cannot be grounded in the repository.
- Do not claim exact behavior when the repo only suggests a likely pattern.
- Do not overwrite existing docs unless explicitly asked.

## Grounding rules
1. Inspect the actual repository first.
2. Identify top-level packages, entry points, core frameworks, and infra/config files.
3. Trace only edges you can support from code, config, imports, routes, DB access, or docs.
4. If an element is likely but unconfirmed, mark it as `unknown` or `assumed`.
5. Prefer file-path evidence over generic explanations.

## Workflow
1. **Inventory the repo**
   - Top-level folders
   - App entry points
   - Frontend packages
   - Backend packages
   - Shared libraries
   - Tests
   - Infrastructure

2. **Classify the diagram type needed**
   - System architecture
   - Package/dependency map
   - Request flow
   - Data model
   - Realtime/collaboration flow

3. **Trace the edges**
   - Import relationships
   - HTTP request paths
   - Service-layer calls
   - DB query layer
   - WebSocket/realtime flows
   - Shared type usage

4. **Draft Mermaid output**
   - Keep diagrams readable
   - Favor a few important nodes over noisy completeness
   - Group related nodes with subgraphs when helpful

5. **Explain the diagram**
   - What it shows
   - Evidence used
   - Unknowns / assumptions
   - Risks or bottlenecks noticed

## Output requirements
When producing a diagram:
- Include a short title
- Include Mermaid code
- Include a short explanation below it
- Include supporting repo paths if available
- Call out unknowns explicitly

## Standard output formats

### 1. System architecture
Use for high-level system maps.

Expected sections:
- Title
- Mermaid diagram
- Key components
- Evidence / file paths
- Notes / unknowns

### 2. Package relationship diagram
Use for monorepo structure.

Expected sections:
- Title
- Mermaid diagram
- Package responsibilities
- Shared dependencies / interfaces
- Evidence / file paths

### 3. Request flow
Use for one concrete user action.

Expected sections:
- User action chosen
- Mermaid flowchart
- Step-by-step trace
- Files involved
- Open questions

### 4. Data model diagram
Use when the repo has schemas, migrations, models, or shared domain types.

Expected sections:
- Key entities
- Mermaid ER / flow diagram
- Discriminators / relationships
- Evidence / file paths
- Likely risks

### 5. Realtime flow
Use when the repo includes sockets, presence, collaboration, subscriptions, or CRDTs.

Expected sections:
- Mermaid flowchart
- Client/server responsibilities
- Persistence behavior
- Reconnect / conflict notes
- Evidence / file paths

## Diagram quality rules
- Prefer `flowchart TD` or `flowchart LR` for architecture and request flows.
- Prefer `erDiagram` only when relationships are actually modeled and sufficiently clear.
- Use labels that match repository language.
- Keep lines short.
- Avoid huge all-in-one diagrams; split into multiple focused diagrams when needed.

## Example prompt patterns this skill should handle
- "Create a system architecture diagram for this repo."
- "Map web, api, shared, and e2e as Mermaid."
- "Trace create issue from UI to DB."
- "Document the realtime collaboration flow."
- "Generate onboarding diagrams for this monorepo."

## Success criteria
A good answer is:
- grounded in code
- visually clear
- honest about unknowns
- useful to a new engineer within minutes
