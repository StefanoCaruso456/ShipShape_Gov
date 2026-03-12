# Bundle Size Baseline

Date: 2026-03-09

Scope:

- frontend package: `web/`

This is a baseline audit only. No bundle-size reductions or build configuration changes were applied as part of this step.

## How It Was Measured

Tools and commands:

1. Built the production frontend with source maps:

```bash
cd web
COREPACK_HOME=/tmp/corepack corepack pnpm exec vite build --sourcemap
```

2. Generated a bundle treemap with a temporary analyzer, without modifying `package.json`:

```bash
cd web
COREPACK_HOME=/tmp/corepack corepack pnpm dlx vite-bundle-visualizer \
  --config vite.config.ts \
  --input index.html \
  --template treemap \
  --output ../benchmarks/bundle-treemap-baseline.html \
  --open false \
  --sourcemap
```

3. Measured output size and chunk counts from `web/dist`.
4. Aggregated source-map module sizes to estimate largest bundled dependencies.
5. Cross-referenced `web/package.json` dependencies against actual imports under `web/src`.
6. Checked the codebase for lazy loading and dynamic imports.

Artifacts:

- Treemap: `benchmarks/bundle-treemap-baseline.html`

Methodology notes:

- The main baseline number below uses browser-delivered JS/CSS assets, not source maps or static image files.
- Full `dist/` footprint is larger because it includes source maps and image/icon assets.
- Dependency sizes are source-map-based estimates, not post-tree-shake exact byte ownership.

## Baseline Numbers

| Metric | Baseline |
| --- | --- |
| Total production bundle size | `2,274.46 KB` |
| Largest chunk | `app-DOVWGuIu.js` (`2,025.14 KB`) |
| Number of chunks | `262` |
| Top 3 largest dependencies | `emoji-picker-react` (`398.43 KB`), `highlight.js` (`376.41 KB`), `react-router` (`346.71 KB`) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister`, `@uswds/uswds` |

Supporting numbers:

- Full `dist/` output footprint: `11,627.65 KB`
- Browser-delivered JS/CSS assets only: `2,274.46 KB`
- Main CSS chunk: `app-DJeYp5na.css` (`64.95 KB`)

## Largest Chunks

Top frontend chunks from `web/dist/assets`:

| Chunk | Size |
| --- | ---: |
| `app-DOVWGuIu.js` | `2,025.14 KB` |
| `app-DJeYp5na.css` | `64.95 KB` |
| `ProgramWeeksTab-CeeWkKHU.js` | `16.42 KB` |
| `WeekReviewTab-BIWF1bHJ.js` | `12.40 KB` |
| `StandupFeed-Dht2pi8w.js` | `9.47 KB` |

Interpretation:

- There is one extremely dominant application chunk.
- Everything else is comparatively small.
- The main size problem is not “too many medium chunks.” It is that the initial app chunk is huge.

## Code Splitting Status

Code splitting is in use, but only partially effective.

Evidence of active lazy loading:

- `web/src/lib/document-tabs.tsx:52`
- `web/src/lib/document-tabs.tsx:53`
- `web/src/lib/document-tabs.tsx:54`
- `web/src/lib/document-tabs.tsx:55`
- `web/src/lib/document-tabs.tsx:57`
- `web/src/lib/document-tabs.tsx:58`
- `web/src/lib/document-tabs.tsx:59`
- `web/src/lib/document-tabs.tsx:60`
- `web/src/lib/document-tabs.tsx:62`
- `web/src/lib/document-tabs.tsx:63`
- `web/src/lib/document-tabs.tsx:64`
- `web/src/lib/document-tabs.tsx:65`
- `web/src/lib/document-tabs.tsx:66`

Evidence of dynamic imports in editor flows:

- `web/src/components/editor/SlashCommands.tsx:377`
- `web/src/components/editor/SlashCommands.tsx:445`

But the build emitted warnings showing some dynamic imports are defeated by static imports:

- `web/src/services/upload.ts` is dynamically imported in `SlashCommands.tsx` but also statically imported elsewhere
- `web/src/components/editor/FileAttachment.tsx` is dynamically imported in `SlashCommands.tsx` but also statically imported in `Editor.tsx`

Interpretation:

- Route/tab-level splitting exists.
- The main bundle still absorbs too much shared editor/runtime code.
- Some attempted lazy loading currently does not reduce the initial chunk because those modules are also imported statically.

## Top Dependency Weight Estimates

Largest source-map-weighted packages:

| Dependency | Estimated Size |
| --- | ---: |
| `emoji-picker-react` | `398.43 KB` |
| `highlight.js` | `376.41 KB` |
| `react-router` | `346.71 KB` |
| `yjs` | `292.45 KB` |
| `prosemirror-view` | `236.77 KB` |
| `@tiptap/core` | `194.08 KB` |
| `lib0` | `168.54 KB` |

Interpretation:

- Rich-editor and collaboration dependencies are major contributors.
- The main chunk is likely carrying too much of the editor stack up front.
- `emoji-picker-react` and `highlight.js` are unusually large for functionality that is not needed immediately on every screen.

## Unused Dependency Check

Dependencies declared in `web/package.json` but not found in direct imports under `web/src`:

- `@tanstack/query-sync-storage-persister`
- `@uswds/uswds`

Notes:

- This is an import-based baseline, not a full transitive usage audit.
- These packages may still be indirectly used through generated assets, CSS, or future plans, but they did not appear in the current source import graph.

## Specific Weaknesses And Opportunities

### 1. The initial application chunk is oversized

Severity: High

Why:

- The main JS chunk alone is `2,025.14 KB`.
- It dwarfs every other chunk in the build.
- Vite emitted a large-chunk warning during production build.

Likely impact:

- slower initial load
- worse performance on slower networks or lower-powered devices
- too much application code downloaded before the user needs it

### 2. Code splitting exists, but the most expensive code is still landing in the main chunk

Severity: High

Why:

- There are many small lazy-loaded tab chunks.
- Despite that, the dominant `app` chunk remains extremely large.
- Build warnings show at least two editor-related dynamic imports are neutralized by static imports.

Likely impact:

- the app pays the cost of advanced editor/upload functionality before the user uses it
- current lazy-loading wins are smaller than they should be

### 3. Editor/collaboration dependencies are a major weight source

Severity: Medium

Why:

- `yjs`, `prosemirror-view`, `@tiptap/core`, and `lib0` all rank high in estimated bundle weight.
- `highlight.js` and `emoji-picker-react` are also large single-package contributors.

Likely impact:

- document editing and collaboration features are likely inflating load cost across the whole app
- isolating editor-only features could materially reduce initial payload

### 4. Some declared dependencies appear unused in the source import graph

Severity: Medium

Why:

- `@tanstack/query-sync-storage-persister`
- `@uswds/uswds`

Likely impact:

- unnecessary dependency surface
- potential dead weight in install/build complexity
- possible future cleanup opportunity if these truly are not used

### 5. Asset footprint and source-map footprint are significantly larger than runtime JS/CSS

Severity: Low

Why:

- Full `dist/` footprint is `11,627.65 KB`
- Browser-delivered JS/CSS is `2,274.46 KB`

Likely impact:

- not the primary runtime problem, but relevant for artifact storage, deploy size, and debugging builds
- useful distinction so future optimizations target the actual user-facing payload

## Audit Deliverable Summary

| Metric | Your Baseline |
| --- | --- |
| Total production bundle size | `2,274.46 KB` |
| Largest chunk | `app-DOVWGuIu.js` (`2,025.14 KB`) |
| Number of chunks | `262` |
| Top 3 largest dependencies | `emoji-picker-react` (`398.43 KB`), `highlight.js` (`376.41 KB`), `react-router` (`346.71 KB`) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister`, `@uswds/uswds` |

