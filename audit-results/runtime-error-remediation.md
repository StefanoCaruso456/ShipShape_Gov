# Category 6 Remediation: Runtime Error and Edge Case Handling

## Scope

This document records the post-audit remediation work for Category 6. It covers the runtime gaps I changed in code, the verification steps I ran afterward, and the evidence files captured from the rebuilt local stack.

Baseline reference:
- [runtime-error-and-edge-case-handling.md](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/runtime-error-and-edge-case-handling.md)

Verification artifacts:
- [runtime-error-remediation.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-remediation.json)
- [runtime-error-remediation-probe.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-remediation-probe.mjs)
- [runtime-fix-realtime-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-realtime-banner.png)
- [runtime-fix-collaboration-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-collaboration-banner.png)

## Fixed Gaps

### 1. Session timeout polling no longer targets the wrong origin

Severity before fix: High

Files:
- [useSessionTimeout.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useSessionTimeout.ts)
- [api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts)

Before:
- the session info fetch used a relative `/api/auth/session` path
- in the Docker local stack that hit `http://localhost:5173/api/auth/session`
- baseline runtime audit observed repeated frontend-origin failures and console noise

After:
- the hook now uses the shared `API_URL` base, matching the rest of the frontend API layer
- post-fix probe results in [runtime-error-remediation.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-remediation.json):
  - `frontendOriginPolls: 0`
  - `apiOriginPolls: 4`
  - `consoleErrors: []`

Reproduction:
1. Start the local Docker stack with `docker compose -f docker-compose.local.yml up --build -d`
2. Log in at `http://localhost:5173`
3. Open `/my-week`
4. Inspect the probe summary instead of DevTools manual counting

Before/after behavior:
- before: session polling hit the frontend origin and failed silently
- after: session polling hits the API origin and the runtime probe no longer sees frontend-origin session poll failures

### 2. Realtime event degradation now has an app-shell banner

Severity before fix: Medium

Files:
- [useRealtimeEvents.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useRealtimeEvents.tsx)
- [App.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx)

Before:
- `/events` disconnects and offline transitions mostly surfaced as console noise
- the app shell did not show a clear degraded-realtime state

After:
- the realtime events context now tracks `connectionState` and `statusMessage`
- the app shell renders a visible banner when live notifications are degraded or the browser is offline

Reproduction:
1. Log in
2. Open `/my-week`
3. Simulate offline mode
4. Observe the top banner

Before/after behavior:
- before: no prominent user-facing status
- after: the shell shows `Realtime degraded. You are offline. Live notifications will resume when the network connection returns.`

Evidence:

![Realtime banner](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-realtime-banner.png)

### 3. Collaborative editor disconnects now warn users not to refresh

Severity before fix: Critical user-confusion risk

Files:
- [Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx)

Before:
- the editor had only a small sync-status indicator
- the audit found that offline collaborative edits could partially recover but were risky across refresh
- users were not clearly told to avoid refresh while disconnected

After:
- the editor renders a visible red banner when collaboration is disconnected
- the message is explicit: keep the tab open and avoid refreshing until the status returns to `Saved`

Reproduction:
1. Open any document editor
2. Simulate offline mode
3. Observe the in-editor disconnect banner

Before/after behavior:
- before: subtle status dot only
- after: prominent warning banner with concrete guidance

Evidence:

![Collaboration banner](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-collaboration-banner.png)

## Supplemental Hardening

I also added two extra code paths that are not counted as completed audited fixes yet:

- [useAutoSave.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useAutoSave.ts)
  - removed the unconditional duplicate trailing save after an immediate save, which reduces failure-loop churn
- [UnifiedEditor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/UnifiedEditor.tsx)
  - added a title-save failure banner path with retry UI
- [Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx)
  - added title-conflict recovery UI for remote/local title divergence

Important caveat:
- my deterministic Playwright probe did not manage to force the title-save banner into a visible terminal state against this stack, so I am not counting that path as a completed verified fix yet
- debug output for that attempt is in [runtime-error-remediation.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-remediation.json) and [runtime-fix-title-save-banner-debug.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-title-save-banner-debug.png)

## Summary

Counted completed fixes:
1. session timeout polling now uses the correct API origin
2. realtime event degradation now has a shell-level banner
3. collaboration disconnects now show a high-visibility editor warning

Verified post-fix evidence:
- [runtime-error-remediation.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-remediation.json)
- [runtime-fix-realtime-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-realtime-banner.png)
- [runtime-fix-collaboration-banner.png](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-fix-collaboration-banner.png)
