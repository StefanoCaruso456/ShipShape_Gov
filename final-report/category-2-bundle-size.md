# Category 2: Bundle Size

## Result

- Improvement target met: `Yes`
- Strategy used: `Reduce the initial authenticated bundle with route-level lazy loading, dev-only query devtools, and a smaller editor highlighting payload`
- Primary passing metric: authenticated `/my-week` startup bundle dropped from `2,078.55 kB` to `485.14 kB`
- Initial-load improvement: `76.7%`
- Entry chunk reduction: `2,078.55 kB -> 293.60 kB` (`85.9%`)
- Total production bundle reduction: `2,255.29 kB -> 2,181.68 kB` (`3.3%`)

## Demo Talking Point

Category 2 was not about deleting features. It was about stopping the app from shipping almost the entire frontend on first load. Before this change, the default app boot came through one `2.08 MB` entry bundle that included route code, editor code, emoji picker code, and code-highlighting logic even when the user just landed on `My Week`. After the change, the authenticated startup path is about `485 kB` because routes are lazy-loaded, React Query Devtools only load in development, and the editor only registers a smaller set of highlighting languages. The app still has the same features, but it downloads the heavy parts when the user actually navigates to them.

## Simple Overview

Before this change, users downloaded almost the whole frontend immediately, even for lightweight routes like `Login` or `My Week`.

After this change, users download the core app first and the heavier route and editor code later when they actually navigate to those screens.

| Metric | Before | After | What it means |
| --- | ---: | ---: | --- |
| Entry chunk | `2,078.55 kB` | `293.60 kB` | the first JS file the app boots with is much smaller |
| `/my-week` startup path | `2,078.55 kB` | `485.14 kB` | the default logged-in page loads far less code up front |
| `/login` startup path | `2,078.55 kB` | `345.62 kB` | the login page no longer pulls the full app immediately |
| Total production JS | `2,255.29 kB` | `2,181.68 kB` | the full app still exists, but much less of it blocks first load |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](../stage-2/category-2-bundle-size/benchmark-commands.txt).

### Saved artifacts

- [before-build-output.txt](../stage-2/category-2-bundle-size/before-build-output.txt)
- [after-build-output.txt](../stage-2/category-2-bundle-size/after-build-output.txt)
- [before-analysis.md](../stage-2/category-2-bundle-size/before-analysis.md)
- [before-treemap.html](../stage-2/category-2-bundle-size/before-treemap.html)
- [after-treemap.html](../stage-2/category-2-bundle-size/after-treemap.html)
- [after-stats.json](../stage-2/category-2-bundle-size/after-stats.json)
- [summary.json](../stage-2/category-2-bundle-size/summary.json)

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

### Unused dependencies identified

| Stage | List |
| --- | --- |
| Before baseline audit | `@tanstack/query-sync-storage-persister`, `@uswds/uswds` |
| After source verification | `@tanstack/query-sync-storage-persister` |

## What Changed

### 1. Lazy-loaded route pages and the main app shell

Files:

- [main.tsx](../web/src/main.tsx)

What changed:

- Replaced eager page imports in the web entrypoint with `React.lazy(...)` imports for public pages, admin pages, list pages, and the unified document route.
- Added `Suspense` boundaries so routes still render a predictable loading state while their chunks load.
- Lazy-loaded the app shell itself so the protected layout no longer inflates the entry chunk on every first visit.

Why the original code was suboptimal:

- `web/src/main.tsx` imported nearly every route module up front.
- That forced the entry bundle to carry editor-heavy and document-heavy code even when the user only needed a lightweight route like `/login` or `/my-week`.

Why this is better:

- The default authenticated startup path now loads `485.14 kB` instead of `2,078.55 kB`.
- The new entry chunk is `293.60 kB`, which means most route-specific code is no longer part of the first download.

Tradeoffs:

- The first visit to a route now performs an extra chunk request.
- That is an intentional tradeoff because it moves infrequently used route code out of the startup path instead of forcing every user to pay for it on first load.

### 2. Removed React Query Devtools from production startup

Files:

- [main.tsx](../web/src/main.tsx)

What changed:

- Replaced the static `ReactQueryDevtools` import with a lazy import that only renders when `import.meta.env.DEV` is true.

Why the original code was suboptimal:

- The production build was paying for devtools code even though the feature is only useful in development.

Why this is better:

- The production startup path no longer includes React Query Devtools bytes.
- That keeps development ergonomics intact without making real users download debug tooling.

Tradeoffs:

- Developers incur one extra lazy-load when they open the app in development.
- That is acceptable because the production bundle is the metric that matters for this category.

### 3. Replaced `lowlight/common` with a curated language set

Files:

- [Editor.tsx](../web/src/components/Editor.tsx)
- [package.json](../web/package.json)

What changed:

- Replaced `createLowlight(common)` with a curated list of commonly used grammars.
- Added explicit aliases for the language names users are most likely to type such as `js`, `ts`, `tsx`, `html`, `shell`, and `yml`.
- Added `highlight.js` as an explicit web dependency so those targeted grammar imports are stable and not dependent on transitive package resolution.

Why the original code was suboptimal:

- `lowlight/common` brings in a broad set of grammars by default, which made the editor stack heavier than it needed to be.
- That highlighting payload was part of the old monolithic startup bundle because the document route was eagerly imported.

Why this is better:

- `highlight.js` disappeared from the top three dependencies of the initial startup path.
- The editor still supports the most likely languages for Ship content, but the startup path no longer ships the full common grammar bundle.

Tradeoffs:

- Rare code block languages that were previously highlighted by the broader default set may now render as plain code until they are explicitly added.
- That is a conscious tradeoff in exchange for a meaningfully smaller startup bundle and a clearer allowlist of supported languages.

## Verification

### Production frontend build

```bash
# from repo root
cd web
pnpm build
```

Result: passed

### Web Vitest suite

```bash
# from repo root
pnpm --filter @ship/web test
```

Result: passed

- Test files: `20/20`
- Tests: `158/158`

## Notes

- The before build was captured from a temporary worktree at `origin/main` using the same laptop, the same local pnpm store, and the same Node toolchain.
- The committed baseline treemap and bundle analysis were copied into the Category 2 artifact folder so the report stays self-contained.
- The `15%` total-bundle-size target was not met, because most of the editor and document code still exists in the output. The passing threshold was met through the alternate code-splitting path with a `76.7%` reduction on the default authenticated startup route.
- `@uswds/uswds` was removed from the “unused” list after source verification because Ship uses its SVG icon assets in both icon generation and runtime icon loading.
