# Category 7: Accessibility Compliance

## Result

- Improvement target met: `Yes`
- Target strategy: `Eliminate automated serious accessibility violations on the seeded major pages while preserving existing keyboard behavior`
- Passing metrics:
  - total critical/serious violations `3 -> 0`
  - total color contrast failures `22 -> 0`
  - `/my-week` Lighthouse accessibility score `96 -> 100`
- Keyboard completeness: `Partial -> Partial`

## Simple Overview

Before this change, the measurable accessibility failures were concentrated in a few repeated contrast patterns on `/my-week`, `/projects`, and `/team/allocation`.

After this change, those repeated badge and label patterns use accessible foreground colors, future standup rows no longer dim all descendant text, and the docs sidebar overflow links sit outside the tree structure.

| Metric | Before | After | What changed |
| --- | ---: | ---: | --- |
| Total critical/serious violations | `3` | `0` | all serious automated issues on the audited major pages were cleared |
| Total color contrast failures | `22` | `0` | the repeated badge, label, and faded-row patterns were made contrast-safe |
| `/my-week` Lighthouse accessibility | `96` | `100` | the default authenticated page improved to a perfect score |
| Keyboard completeness | `Partial` | `Partial` | sampled keyboard flows still pass, but the audit remains partial rather than exhaustive |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](./benchmark-commands.txt).

### Saved artifacts

- [before-accessibility-baseline.json](./before-accessibility-baseline.json)
- [after-accessibility-baseline.json](./after-accessibility-baseline.json)
- [before-axe-my-week.json](./before-axe-my-week.json)
- [after-axe-my-week.json](./after-axe-my-week.json)
- [before-axe-projects.json](./before-axe-projects.json)
- [after-axe-projects.json](./after-axe-projects.json)
- [before-axe-team-allocation.json](./before-axe-team-allocation.json)
- [after-axe-team-allocation.json](./after-axe-team-allocation.json)
- [web-vitest-after.json](./web-vitest-after.json)
- [summary.json](./summary.json)

## Before / After

### Primary comparison baseline

The before and after runs used:

- the same laptop
- the same local seeded database
- the same API and preview server ports
- the same seven audited routes
- the same Playwright + axe-core + Lighthouse probe

| Page / Metric | Before | After | Improvement |
| --- | ---: | ---: | --- |
| Total critical/serious violations | `3` | `0` | eliminated all serious automated violations |
| Total color contrast failures | `22` | `0` | eliminated all automated contrast failures |
| `/my-week` serious violations | `1` | `0` | cleared page-level serious findings |
| `/my-week` contrast failures | `9` | `0` | fixed badge, numbering, and future-row contrast |
| `/projects` serious violations | `1` | `0` | cleared page-level serious findings |
| `/projects` contrast failures | `12` | `0` | fixed filter count badge and ICE score pill contrast |
| `/team/allocation` serious violations | `1` | `0` | cleared page-level serious findings |
| `/team/allocation` contrast failures | `1` | `0` | fixed current-week label contrast |
| `/my-week` Lighthouse accessibility | `96` | `100` | improved page-level accessibility score |

## What Changed

### 1. Contrast-safe badge and label treatment on the failing pages

Files:

- [MyWeekPage.tsx](../../web/src/pages/MyWeekPage.tsx)
- [Projects.tsx](../../web/src/pages/Projects.tsx)
- [TeamMode.tsx](../../web/src/pages/TeamMode.tsx)
- [FilterTabs.tsx](../../web/src/components/FilterTabs.tsx)

What changed:

- Updated accent-tinted badges to use readable foreground text.
- Updated inactive count badges to use a higher-contrast surface.
- Stopped relying on accent-blue text for current sprint/week labels.

Why the original code was suboptimal:

- The same low-contrast pattern appeared across multiple high-traffic pages, so one visual choice created most of the automated audit failures.

Why this is better:

- Serious automated violations dropped to `0`.
- Color contrast failures dropped to `0`.

Tradeoffs:

- The updated badges are slightly more prominent than before.
- That is acceptable because accessible text contrast is the higher priority.

### 2. Future standup rows no longer reduce all descendant text opacity

Files:

- [MyWeekPage.tsx](../../web/src/pages/MyWeekPage.tsx)

What changed:

- Removed row-level opacity from future standup rows and kept de-emphasis through non-opacity styling.

Why the original code was suboptimal:

- Opacity reduced the contrast of every child label inside the row.

Why this is better:

- The same row can still look secondary without failing contrast checks.

Tradeoffs:

- Future rows are less faded than before.

### 3. Docs sidebar overflow links moved outside the tree

Files:

- [App.tsx](../../web/src/pages/App.tsx)

What changed:

- The workspace/private overflow links and empty-state copy now sit outside the tree semantics.

Why the original code was suboptimal:

- Overflow links do not belong as children of a `role="tree"` container.

Why this is better:

- The tree remains semantically valid when the item limit is exceeded.

Tradeoffs:

- The overflow link is visually adjacent to the tree rather than inside it.

### 4. Accessibility probe can now produce clean before/after artifact sets

Files:

- [accessibility-audit.mjs](../../benchmarks/accessibility-audit.mjs)

What changed:

- Added setup-flow login handling.
- Added configurable output location/prefix.
- Reused Playwright Chromium for Lighthouse.

Why the original code was suboptimal:

- It was too brittle for this new laptop and overwrote a single baseline file.

Why this is better:

- Category evidence can now be reproduced cleanly on the same machine.

Tradeoffs:

- Slightly more benchmark-script configuration.

## Verification

### Web build

Result: passed

### Web test suite

Result: passed

- Test files: `20/20`
- Tests: `158/158`

## Notes

- Native VoiceOver/NVDA was not run directly, so screen-reader verification remains partial.
- The docs tree fix is still worth landing even though the current seeded rerun did not exceed the sidebar item limit.
