# Category 2: Bundle Size

## Result

- Improvement target met: `Yes`
- Target strategy: `Reduce the initial page-load bundle by more than 20% through code splitting`
- Passing metric: authenticated `/my-week` startup bundle `2,078.55 kB -> 485.14 kB` (`76.7%`)
- Entry chunk reduction: `2,078.55 kB -> 293.60 kB` (`85.9%`)

## Simple Overview

Before this change, users were effectively downloading almost the entire frontend on first load.

After this change, users load the core app first and only download heavier route and editor code when they actually navigate to those parts of the product.

| Metric | Before | After | What it means |
| --- | ---: | ---: | --- |
| Entry chunk | `2,078.55 kB` | `293.60 kB` | the startup bundle is much smaller |
| `/my-week` startup path | `2,078.55 kB` | `485.14 kB` | the default logged-in page loads far less code up front |
| `/login` startup path | `2,078.55 kB` | `345.62 kB` | public login avoids pulling the full app immediately |
| Total production JS | `2,255.29 kB` | `2,181.68 kB` | total shipped code changed a little, but startup got dramatically lighter |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](./benchmark-commands.txt).

### Saved artifacts

- [before-build-output.txt](./before-build-output.txt)
- [after-build-output.txt](./after-build-output.txt)
- [before-analysis.md](./before-analysis.md)
- [before-treemap.html](./before-treemap.html)
- [after-treemap.html](./after-treemap.html)
- [after-stats.json](./after-stats.json)
- [summary.json](./summary.json)

## Before / After

### Production bundle metrics

| Metric | Before | After | Delta | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Total production bundle size | `2,255.29 kB` | `2,181.68 kB` | `-73.61 kB` | `3.3%` |
| Largest chunk | `index-BMkImw2f.js` (`2,078.55 kB`) | `useAutoSave-Cjbr-DYA.js` (`737.17 kB`) | `-1,341.38 kB` | `64.5%` |
| Number of chunks | `261` | `306` | `+45` | `17.2%` |

### Initial page-load bundle metrics

| Startup path | Before | After | Delta | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Authenticated default route (`/my-week`) | `2,078.55 kB` | `485.14 kB` | `-1,593.41 kB` | `76.7%` |
| Public login route (`/login`) | `2,078.55 kB` | `345.62 kB` | `-1,732.93 kB` | `83.4%` |
| Entry chunk only | `2,078.55 kB` | `293.60 kB` | `-1,784.95 kB` | `85.9%` |

### Initial bundle dependency mix

| Scope | Top 3 largest dependencies |
| --- | --- |
| Before initial bundle | `emoji-picker-react` (`266.69 kB`), `highlight.js` (`170.57 kB`), `react-dom` (`132.16 kB`) |
| After authenticated startup path | `react-dom` (`134.79 kB`), `react-router` (`81.45 kB`), `@tanstack/query-core` (`79.22 kB`) |

## What Changed

### 1. Route-level lazy loading

Files:

- [main.tsx](../../web/src/main.tsx)

What changed:

- Converted the web entrypoint from eager route imports to `React.lazy(...)` imports for almost every page-level route and for the main protected layout.
- Added shared suspense fallbacks so route transitions still show a stable loading state.

Why the original code was suboptimal:

- The previous entrypoint pulled in almost every route module at startup.
- That made the first page load carry document editing code, admin code, and other route-only logic whether the user needed it or not.

Why this is better:

- The default authenticated startup path is now `76.7%` smaller.
- The public login startup path is now `83.4%` smaller.

Tradeoffs:

- First navigation to an unopened route now waits on a lazy chunk request.
- That tradeoff is acceptable because the startup path was the real user-facing performance problem identified in the audit.

### 2. Devtools are now development-only

Files:

- [main.tsx](../../web/src/main.tsx)

What changed:

- Changed React Query Devtools from a static production import to a lazy development-only import.

Why the original code was suboptimal:

- Debug-only UI was part of the production startup graph.

Why this is better:

- Real users no longer pay production bytes for debugging tools.

Tradeoffs:

- Developers incur one extra lazy-load for devtools in local development.

### 3. Curated lowlight grammar registration

Files:

- [Editor.tsx](../../web/src/components/Editor.tsx)
- [package.json](../../web/package.json)

What changed:

- Replaced `lowlight/common` with a curated set of language grammars and aliases.
- Added `highlight.js` explicitly so those grammar imports are stable and intentional.

Why the original code was suboptimal:

- The previous editor configuration bundled a broad common grammar set by default.

Why this is better:

- Heavy highlighting code is no longer a top-three dependency in the initial startup path.
- The editor still supports the common languages Ship is likely to need.

Tradeoffs:

- Rare languages outside the curated list will no longer highlight until explicitly added.

## Verification

### Production frontend build

Result: passed

### Web Vitest suite

Result: passed

- Test files: `20/20`
- Tests: `158/158`

## Notes

- The before build was captured from a detached worktree at `origin/main`.
- The total bundle stayed roughly the same because the editor and document experience still exist in the shipped output; the main improvement was moving those bytes out of the startup path.
- `@tanstack/query-sync-storage-persister` remains unused by source imports and should still be considered a cleanup candidate.
