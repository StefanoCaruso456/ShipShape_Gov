# Category 7: Accessibility Compliance

## Methodology

I measured this baseline with a dedicated probe script at [benchmarks/accessibility-audit.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/accessibility-audit.mjs).

Tools and approach:
- `Playwright` + `@axe-core/playwright` for automated WCAG 2.1 A/AA scans.
- `Lighthouse` accessibility audits on the live local app for major routes.
- Keyboard-only sampling on the login flow and authenticated docs shell.
- Chrome accessibility tree snapshots as a proxy for landmark and control exposure.

Command used:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm exec node benchmarks/accessibility-audit.mjs
```

Rerun note:
- I reran the same probe on March 10, 2026; the Lighthouse page scores were unchanged from the earlier baseline.

Major pages audited:
- `/login`
- `/my-week`
- `/docs`
- `/issues`
- `/projects`
- `/programs`
- `/team/allocation`

Important limitation:
- Native VoiceOver/NVDA was **not** run in this environment. The script used accessibility-tree inspection instead, so screen reader verification is partial rather than complete.

## Audit Deliverable

| Metric | Your Baseline |
| --- | --- |
| Lighthouse accessibility score (per page) | `/login` `98`, `/my-week` `96`, `/docs` `91`, `/issues` `100`, `/projects` `100`, `/programs` `100`, `/team/allocation` `100` |
| Total Critical/Serious violations | `5` |
| Keyboard navigation completeness | `Partial` |
| Color contrast failures | `28` |
| Missing ARIA labels or roles | [web/src/pages/App.tsx:665](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:665), [web/src/pages/App.tsx:679](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:679) |

Evidence files:
- [accessibility-baseline.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/accessibility-baseline.json)
- [lighthouse-login.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-login.json)
- [lighthouse-my-week.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-my-week.json)
- [lighthouse-docs.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-docs.json)
- [lighthouse-issues.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-issues.json)
- [lighthouse-projects.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-projects.json)
- [lighthouse-programs.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-programs.json)
- [lighthouse-team-allocation.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/lighthouse-team-allocation.json)

## Findings

### High

1. **Docs sidebar tree markup is invalid for assistive tech.**
   - Axe found one `critical` `aria-required-children` violation and one `serious` `listitem` violation on `/docs`.
   - The tree container at [web/src/pages/App.tsx:665](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:665) mixes `role="tree"` content with plain `<li>` rows like the overflow link at [web/src/pages/App.tsx:679](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:679).
   - Impact: screen readers can misinterpret the document navigation tree structure.

2. **Color contrast is failing on important working pages.**
   - `/my-week`: `15` contrast failures.
   - `/projects`: `12` contrast failures.
   - `/team/allocation`: `1` contrast failure.
   - Concrete examples:
     - current-week badge at [web/src/pages/MyWeekPage.tsx:122](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/MyWeekPage.tsx:122)
     - numbered plan/retro list markers at [web/src/pages/MyWeekPage.tsx:228](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/MyWeekPage.tsx:228) and [web/src/pages/MyWeekPage.tsx:290](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/MyWeekPage.tsx:290)
     - inactive filter count badge at [web/src/components/FilterTabs.tsx:45](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/FilterTabs.tsx:45)
     - ICE score badge at [web/src/pages/Projects.tsx:525](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/Projects.tsx:525)
     - team "Viewing as Week" pill at [web/src/pages/TeamMode.tsx:595](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/TeamMode.tsx:595)
   - Impact: this conflicts directly with the stated WCAG 2.1 AA / Section 508 target.

### Medium

1. **Keyboard support samples are good, but not yet enough to call the app fully keyboard-complete.**
   - Sampled flows passed:
     - login field order and submit button focus
     - authenticated route focus lands on the main landmark
     - tabbing reaches docs toolbar controls
   - Code paths supporting this:
     - skip link in [web/src/pages/App.tsx:278](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:278)
     - main landmark in [web/src/pages/App.tsx:569](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:569)
     - focus-on-navigation hook in [web/src/hooks/useFocusOnNavigate.ts:8](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFocusOnNavigate.ts:8)
   - Baseline classification stays `Partial` because this audit sampled critical routes rather than every interactive control and complex widget.

2. **Screen reader support looks intentional in code, but the verification is still partial.**
   - Good signals exist:
     - login error alerts in [web/src/pages/Login.tsx:199](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/Login.tsx:199)
     - realtime/editor live regions in [web/src/components/Editor.tsx:880](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx:880)
     - session timeout alert dialog in [web/src/components/SessionTimeoutModal.tsx:130](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/SessionTimeoutModal.tsx:130)
   - The probe confirmed landmarks and named controls in the accessibility tree, but no native VoiceOver/NVDA run happened here.

## Why the current accessibility structure likely exists

The codebase is clearly trying to centralize accessibility patterns instead of treating them as one-off fixes:
- app-shell focus management via [web/src/hooks/useFocusOnNavigate.ts:8](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useFocusOnNavigate.ts:8)
- reusable keyboard/ARIA patterns in [web/src/components/FilterTabs.tsx:21](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/FilterTabs.tsx:21), [web/src/components/SelectableList.tsx:119](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/SelectableList.tsx:119), and [web/src/components/KanbanBoard.tsx:141](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/KanbanBoard.tsx:141)
- app-level landmarks and skip navigation in [web/src/pages/App.tsx:278](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:278) and [web/src/pages/App.tsx:327](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:327)

That architectural direction is good. The current gaps are mostly consistency problems in individual views and badges, not a total absence of accessibility work.

## Improvement focus

If this moves into remediation, the highest-value order is:
1. fix the `/docs` tree semantics in [web/src/pages/App.tsx:665](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx:665)
2. fix the contrast failures on `/my-week`, `/projects`, and `/team/allocation`
3. run a native screen reader pass to validate the accessibility-tree assumptions
