# Category 7: Accessibility Compliance

## Result

- Improvement target met: `Yes`
- Strategy used: `Eliminate automated contrast failures on the audited pages, preserve keyboard behavior, and clean up the docs sidebar tree overflow semantics`
- Primary passing metrics:
  - total critical/serious axe violations `3 -> 0`
  - total color contrast failures `22 -> 0`
  - `/my-week` Lighthouse accessibility score `96 -> 100`
- Keyboard completeness: `Partial -> Partial`
- Screen-reader verification: `Partial -> Partial`

## Demo Talking Point

Category 7 was about turning accessibility from “mostly good scores” into verifiable compliance on the pages people actually use. We reran the same local audit before and after the fixes, targeted the repeated low-contrast badge and label patterns on `/my-week`, `/projects`, and `/team/allocation`, and removed the invalid overflow links from the docs sidebar tree. The measurable result was `3 -> 0` critical/serious violations, `22 -> 0` color contrast failures, and a `/my-week` Lighthouse improvement from `96` to `100`, while the existing keyboard checks stayed green.

## Simple Overview

Before this change, the major accessibility problems were concentrated in a few repeated UI patterns rather than one broken page. Accent-colored pills, count badges, and faded future-row text were dropping below WCAG contrast thresholds on the most important authenticated screens.

After this change, those repeated patterns use accessible foreground colors, future standup rows no longer reduce text contrast through container opacity, and the docs sidebar no longer mixes overflow links into the tree structure.

| Metric | Before | After | What it means |
| --- | ---: | ---: | --- |
| Total critical/serious violations | `3` | `0` | the audited major pages no longer have automated serious accessibility failures |
| Total color contrast failures | `22` | `0` | the repeated low-contrast badge, label, and future-row patterns were removed |
| `/my-week` Lighthouse accessibility | `96` | `100` | the default authenticated landing page now clears the top score |
| Keyboard completeness | `Partial` | `Partial` | sampled keyboard flows still pass, but this remains partial because the whole app was not exhaustively tab-audited |

## Reproducible Proof

### Measurement commands

See [benchmark-commands.txt](../stage-2/category-7-accessibility-compliance/benchmark-commands.txt).

### Saved artifacts

- [before-accessibility-baseline.json](../stage-2/category-7-accessibility-compliance/before-accessibility-baseline.json)
- [after-accessibility-baseline.json](../stage-2/category-7-accessibility-compliance/after-accessibility-baseline.json)
- [before-axe-my-week.json](../stage-2/category-7-accessibility-compliance/before-axe-my-week.json)
- [after-axe-my-week.json](../stage-2/category-7-accessibility-compliance/after-axe-my-week.json)
- [before-axe-projects.json](../stage-2/category-7-accessibility-compliance/before-axe-projects.json)
- [after-axe-projects.json](../stage-2/category-7-accessibility-compliance/after-axe-projects.json)
- [before-axe-team-allocation.json](../stage-2/category-7-accessibility-compliance/before-axe-team-allocation.json)
- [after-axe-team-allocation.json](../stage-2/category-7-accessibility-compliance/after-axe-team-allocation.json)
- [web-vitest-after.json](../stage-2/category-7-accessibility-compliance/web-vitest-after.json)
- [summary.json](../stage-2/category-7-accessibility-compliance/summary.json)

## Before / After

The primary comparison below uses the same:

- local MacBook
- local seeded PostgreSQL database
- API server on `localhost:3000`
- Vite preview server on `127.0.0.1:4173`
- Playwright + axe-core scan and Lighthouse accessibility audits
- seven audited major routes

| Page / Metric | Before | After | Improvement |
| --- | ---: | ---: | --- |
| Total critical/serious violations | `3` | `0` | eliminated all serious automated violations |
| Total color contrast failures | `22` | `0` | eliminated all automated contrast failures |
| `/my-week` serious violations | `1` | `0` | cleared all page-level serious findings |
| `/my-week` contrast failures | `9` | `0` | fixed badge, numbering, and future-row contrast |
| `/projects` serious violations | `1` | `0` | cleared all page-level serious findings |
| `/projects` contrast failures | `12` | `0` | fixed filter count badge and ICE score pill contrast |
| `/team/allocation` serious violations | `1` | `0` | cleared all page-level serious findings |
| `/team/allocation` contrast failures | `1` | `0` | fixed current-week label contrast |
| `/my-week` Lighthouse accessibility | `96` | `100` | improved page-level accessibility score |

## What Changed

### 1. Contrast-safe accent badges and counters on the audited pages

Files:

- [MyWeekPage.tsx](../web/src/pages/MyWeekPage.tsx)
- [Projects.tsx](../web/src/pages/Projects.tsx)
- [TeamMode.tsx](../web/src/pages/TeamMode.tsx)
- [FilterTabs.tsx](../web/src/components/FilterTabs.tsx)

What changed:

- Replaced low-contrast accent text on accent-tinted badges with foreground text.
- Replaced the muted-on-muted inactive filter count badge with a border-backed foreground badge.
- Stopped using accent-blue text alone to communicate the current sprint/week labels.

Why the original code was suboptimal:

- Several high-traffic screens reused the same visual pattern: dark tinted badge backgrounds with accent-blue or muted text on top.
- That looked consistent, but it dropped below WCAG AA contrast thresholds and produced all three serious automated violations in the current seeded audit.

Why this is better:

- Automated serious violations dropped from `3` to `0`.
- Automated color contrast failures dropped from `22` to `0`.
- `/my-week` improved from `96` to `100` in Lighthouse.

Tradeoffs:

- Some badges are visually less subtle than before because accessible foreground text needs more separation from the background tint.
- That is a good tradeoff for the government-compliance target the product claims.

### 2. Future standup rows no longer lower text contrast with container opacity

Files:

- [MyWeekPage.tsx](../web/src/pages/MyWeekPage.tsx)

What changed:

- Removed the row-wide `opacity-40` treatment from future standup rows.
- Kept the rows visually lower priority through border/hover treatment instead of fading all descendant text.

Why the original code was suboptimal:

- Applying opacity to the whole container also dimmed already-muted text.
- That is why a single future standup row produced three separate contrast failures in the audit.

Why this is better:

- The future-row labels still read as non-active content, but they remain legible enough for WCAG AA automated checks.

Tradeoffs:

- The future rows are less visually “faded” than before.
- That is acceptable because readability matters more than aggressive de-emphasis.

### 3. Docs sidebar overflow links no longer live inside the tree

Files:

- [App.tsx](../web/src/pages/App.tsx)

What changed:

- Labeled the workspace/private tree regions via their headings.
- Moved the “view more” overflow links outside the `role="tree"` containers.
- Kept empty-state text outside the tree as regular content rather than pretending it is a tree item.

Why the original code was suboptimal:

- The earlier accessibility audit correctly called out that overflow links were being mixed into the tree structure.
- That creates invalid semantics once the sidebar exceeds the item limit.

Why this is better:

- The sidebar tree remains a tree, and the overflow navigation stays normal navigation.
- In the current seeded rerun the docs page did not exceed the item limit, so this fix is proactive rather than one of the measured failing nodes.

Tradeoffs:

- The overflow link now sits visually adjacent to the tree instead of appearing as one more tree row.
- That is the correct semantic tradeoff.

### 4. Hardened the accessibility probe for reproducible before/after runs

Files:

- [accessibility-audit.mjs](../benchmarks/accessibility-audit.mjs)

What changed:

- Added support for first-run setup flow as well as normal sign-in.
- Added configurable output directory/prefix so before and after artifacts can coexist.
- Wired Lighthouse to the Playwright-installed Chromium so the audit can run on this new laptop without a separate Chrome install.

Why the original code was suboptimal:

- The old probe assumed a pre-existing account and overwrote a single baseline file.
- That made it brittle on a fresh machine and awkward for clean before/after evidence.

Why this is better:

- The proof can now be rerun on the same machine and saved directly into the Stage 2 evidence folder.

Tradeoffs:

- The benchmark script is slightly more configurable than before.
- That added complexity is worth it because the category requires reproducible measurement.

## Verification

### Web build

```bash
pnpm build:web
```

Result: passed

### Web test suite

```bash
pnpm --filter @ship/web test
```

Result: passed

- Test files: `20/20`
- Tests: `158/158`

## Notes

- Native VoiceOver/NVDA was not run directly in this environment, so screen-reader verification remains partial.
- Keyboard completeness remains `Partial` because the audit sampled critical flows rather than exhaustively tabbing every control in the app.
- The measurable win in this category came from eliminating automated serious/contrast violations on the seeded major pages, not from claiming full manual assistive-technology certification.
