# Category 6: Runtime Error and Edge Case Handling

## Result

- Improvement target met: `Yes`
- Strategy used: `Fix 3 user-facing runtime recovery gaps and verify them with before/after probes`
- Counted fixes:
  1. global realtime degradation banner
  2. collaboration disconnect warning banner
  3. title-save failure recovery with explicit retry
- Additional measurable improvement: normal-usage console errors dropped from `10` to `0`

## Reproducible Proof

### Measurement commands

```bash
# Local stack used for both before/after measurements

docker compose -f docker-compose.local.yml up -d --build api web

# Full baseline / after snapshot
COREPACK_HOME=/tmp/corepack corepack pnpm exec node benchmarks/runtime-error-probe.mjs

# Targeted remediation probe for user-facing recovery states
COREPACK_HOME=/tmp/corepack corepack pnpm exec node benchmarks/runtime-error-remediation-probe.mjs
```

### Saved artifacts

- `stage-2/category-6-runtime-error-and-edge-case-handling/before-runtime-probe.json`
- `stage-2/category-6-runtime-error-and-edge-case-handling/after-runtime-probe.json`
- `stage-2/category-6-runtime-error-and-edge-case-handling/after-remediation-probe.json`
- `stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-realtime-banner.png`
- `stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-collaboration-banner.png`
- `stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-title-save-banner.png`
- `stage-2/category-6-runtime-error-and-edge-case-handling/web-vitest-after.json`
- `stage-2/category-6-runtime-error-and-edge-case-handling/api-vitest-after.json`

## Before / After

### Full runtime snapshot

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Console errors during normal usage | `10` | `0` | `-10` |
| Request failures during normal usage | `10` | `0` | `-10` |
| Network disconnect recovery status | `Partial` | `Partial` | no status change |
| Network disconnect console errors | `12` | `0` | `-12` |
| Network disconnect request failures | `12` | `0` | `-12` |
| Slow 3G console errors | `8` | `0` | `-8` |
| Slow 3G request failures | `4` | `0` | `-4` |

### Counted fixes

| Runtime gap | Before | After | Evidence |
| --- | --- | --- | --- |
| Realtime degradation had weak or missing user-facing feedback during reconnect churn | Baseline audit documented no clear degraded-realtime banner during `429` / reconnect churn | Realtime banner is visible in the app shell | [runtime-fix-realtime-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-realtime-banner.png) |
| Offline collaboration left users without a strong “do not refresh” warning | Baseline disconnect flow stayed `Partial`, and offline deltas did not reliably survive refresh | Collaboration disconnect banner is visible inside the editor and tells users to keep the tab open until sync returns | [runtime-fix-collaboration-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-collaboration-banner.png) |
| Title-save failures had no working recovery path | `errorBannerVisible = false`, `retrySucceeded = false` | `errorBannerVisible = true`, `retrySucceeded = true` | [runtime-fix-title-save-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/stage-2/category-6-runtime-error-and-edge-case-handling/runtime-fix-title-save-banner.png) |

### Title-save recovery probe

| Metric | Before | After |
| --- | --- | --- |
| `titleSaveRecovery.errorBannerVisible` | `false` | `true` |
| `titleSaveRecovery.retrySucceeded` | `false` | `true` |

## What Changed

### 1. Fixed title-save recovery so failures surface immediately and can be retried

Files:

- `web/src/components/UnifiedEditor.tsx`
- `web/src/hooks/useAutoSave.ts`
- `web/src/pages/UnifiedDocumentPage.tsx`
- `web/src/hooks/useAutoSave.test.ts`

What changed:

- Title saves now fail fast into the document-level recovery UI instead of disappearing behind generic background retries.
- The autosave hook now prefers the latest pending value over stale in-flight values.
- The document update mutation no longer applies generic React Query retries for this editor path.
- Title-only updates no longer use optimistic cache writes that can falsely make a failed save look accepted.

Why the original code was suboptimal:

- There were two retry layers competing with each other: the autosave hook and React Query’s mutation retry.
- Title saves could start from stale intermediate values and keep retrying in the background while the user saw no explicit recovery action.
- Optimistic title writes made failed saves look closer to “already saved” than they really were.

Why this is better:

- The editor now shows a deterministic error banner for failed title saves.
- The retry button retries the actual unsaved title the user last entered.
- The failure mode is explicit, actionable, and much less confusing.

Tradeoffs:

- This path now favors explicit recovery over silent background retries.
- Users may see the banner sooner on transient failures, but that is preferable here because title edits are high-visibility and easy to retry.

### 2. Preserved the global realtime degradation banner

Files:

- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`

What changed:

- The app shell exposes realtime connection degradation through `connectionState` and `statusMessage`.
- When the browser is offline or the events WebSocket is reconnecting/erroring, the layout renders a visible `Realtime degraded.` banner.

Why the original code was suboptimal:

- The audit baseline showed reconnect churn and `429` failures in the console without clear user-facing feedback.

Why this is better:

- Users now get an explicit degraded-state banner instead of silent console-only failures.

Tradeoffs:

- The banner communicates degraded state, but it does not fix backend rate limiting itself.

### 3. Preserved the editor collaboration disconnect warning

Files:

- `web/src/components/Editor.tsx`

What changed:

- The editor now renders a visible disconnect/cached-content banner based on browser online state and collaboration sync state.
- The disconnect message explicitly warns users not to refresh until sync returns.

Why the original code was suboptimal:

- The audit baseline found a real data-loss/confusion scenario: offline edits could resume syncing, but did not reliably survive a full refresh.
- Without a strong warning, users had no reason to know refresh was dangerous.

Why this is better:

- The editor now communicates the risky state directly at the point of editing.
- This reduces the chance that users destroy their own offline work by refreshing too early.

Tradeoffs:

- This is a mitigation, not a full persistence fix. The underlying offline-refresh limitation still exists.

### 4. Additional measured improvement: session polling no longer fails against the wrong origin

Files:

- `web/src/hooks/useSessionTimeout.ts`

What changed:

- Session polling uses `API_URL` for `/api/auth/session` instead of the frontend origin.

Why the original code was suboptimal:

- In the Docker local stack, polling the frontend origin generated repeated `500` noise and broken timeout tracking with no user-facing explanation.

Why this is better:

- Normal usage console errors dropped from `10` to `0` and request failures from `10` to `0` in the full after-probe.

Tradeoffs:

- This fixes the local-origin mismatch, but it does not add a dedicated user-facing session-health banner.

## Reproduction Steps

### Realtime degraded banner

1. Start the local stack from `docker-compose.local.yml`
2. Log in and open `/my-week`
3. Force the browser offline or trigger reconnect churn
4. Observe the app shell banner `Realtime degraded.`

### Collaboration disconnect banner

1. Open a collaborative document
2. Disconnect the browser from the network
3. Observe the editor banner `Collaboration connection lost.`
4. Observe the warning not to refresh until sync returns

### Title-save recovery

1. Open a document editor
2. Force `PATCH /api/documents/:id` to fail
3. Change the title
4. Observe the `Title save failed.` banner
5. Restore the PATCH route and click `Retry Title Save`
6. Refresh the page and confirm the title persists

## Verification

### Full web suite

Result: passed

- Test files: `66/66`
- Tests: `158/158`
- Artifact: [web-vitest-after.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/stage-2/category-6-runtime-error-and-edge-case-handling/web-vitest-after.json)

### Full API suite

Result: passed

- Test files: `204/204`
- Tests: `451/451`
- Artifact: [api-vitest-after.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/stage-2/category-6-runtime-error-and-edge-case-handling/api-vitest-after.json)

## Residual Risks

- Network disconnect recovery is still `Partial`: offline deltas still did not reliably survive refresh in the full after-probe.
- Concurrent title edits no longer overwrite one client’s value in the after-probe, but the automated probe still did not observe a visible conflict UI.
- Root-level and route-level error-boundary coverage are still incomplete compared with the original audit list.

## Notes

- The temporary debug probe used to verify the title-save path was not part of the final artifact set.
- The unrelated deleted file `final-report/final-audit.pdf` was not part of this Category 6 work and should stay out of the commit.
