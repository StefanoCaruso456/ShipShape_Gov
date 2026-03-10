# Category 6: Runtime Error and Edge Case Handling

## Scope

This audit measures how Ship behaves when runtime conditions degrade or user inputs become adversarial.
It focuses on:

- browser console/runtime errors during normal usage
- collaborative editing disconnect/reconnect behavior
- malformed input handling
- concurrent edit behavior
- slow-network loading/error states
- server-side unhandled runtime failures during the same test window

No fixes were made as part of this category. This is baseline diagnosis only.

## Methodology

The baseline was measured with an automated Playwright probe in [benchmarks/runtime-error-probe.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-probe.mjs), using the local Docker stack from [docker-compose.local.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.local.yml).

The probe performed these scenarios:

1. Normal usage:
   - login
   - open `/my-week`
   - create a wiki document
   - navigate to `/issues`
   - navigate to `/programs`
2. Network disconnect recovery:
   - open the same collaborative document in two browser contexts
   - type while online
   - disconnect one client
   - edit while offline
   - reconnect
   - refresh both clients
3. Malformed input:
   - use an HTML/script-like payload in the title
   - insert a very long body string
4. Concurrent edge case:
   - have two clients edit the same document title at nearly the same time
5. Slow 3G:
   - throttle network conditions with CDP
   - load `/programs`
   - observe loading indicators and pending API activity

Server-side evidence was captured from the same run window into [benchmarks/runtime-api-log-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-api-log-baseline.txt). Browser-side evidence is in [benchmarks/runtime-error-probe.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-probe.json).

## Audit Deliverable

| Metric | Your Baseline |
| --- | --- |
| Console errors during normal usage | `10` |
| Unhandled promise rejections (server) | `0` observed in captured API log window |
| Network disconnect recovery | `Partial` |
| Missing error boundaries | See list below |
| Silent failures identified | See list below |

## Baseline Notes

### Console errors during normal usage

Normal authenticated usage produced `10` console errors and `10` failed requests in the baseline run.

The dominant error was repeated `500` responses from:

- `GET http://localhost:5173/api/auth/session`

That endpoint is polled by [web/src/hooks/useSessionTimeout.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useSessionTimeout.ts), which uses a relative fetch path:

```ts
const response = await fetch('/api/auth/session', {
  credentials: 'include',
});
```

In the Docker local stack, the frontend is served from `5173` and also has `VITE_API_URL=http://localhost:3000` set in [docker-compose.local.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.local.yml). Most app API traffic uses the absolute API base in [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts), but `useSessionTimeout` does not, so session polling hits the frontend origin instead of the API origin in this setup.

The hook catches the failure and suppresses user-facing feedback, so this appears as console noise and broken timeout tracking rather than a visible error state.

### Unhandled promise rejections (server)

`0` unhandled promise rejections were observed in [benchmarks/runtime-api-log-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-api-log-baseline.txt).

The captured API log window showed connection lifecycle logs and collaboration startup messages, but no `UnhandledPromiseRejection`, `unhandledRejection`, or similar server crash signatures.

### Network disconnect recovery

The collaborative-edit disconnect scenario graded as `Partial`:

- live sync after reconnect: `true`
- offline delta survived browser refresh on both clients: `false`

That means the UI recovered enough to resume collaboration, but the offline-authored text did not survive a full reload consistently. For a collaborative editor, that is a real user-facing reliability gap.

### Malformed input handling

The baseline malformed-input scenario had mixed results, but the tested security case was acceptable:

- script-like title payload triggered dialogs: `0`
- title payload round-tripped as plain text: `true`
- long text remained present in the editor: `true`

This suggests the tested HTML/script payload was treated as text rather than executed, and long-form input was accepted. The main problems in this category were not XSS execution, but silent failure and synchronization behavior.

### Concurrent edit behavior

Two clients editing the same document title simultaneously produced a last-write-wins outcome:

- `finalTitle1` = second writer’s title
- `finalTitle2` = second writer’s title
- `bothValuesPreserved` = `false`
- `conflictUiVisible` = `false`

This is important because the rich-text body uses Yjs/WebSocket synchronization, but the title does not get equivalent conflict handling. One user’s value was overwritten with no warning.

### Slow 3G behavior

The throttled `/programs` scenario did not show a spinner hang, but it did surface degraded realtime behavior:

- `headingVisible` = `false` at the measurement point
- loading indicators detected = none
- console errors = `8`

The most visible failures were WebSocket handshake `429` errors during reconnect churn, not a hard crash.

## Missing Error Boundaries

These are the clearest missing or incomplete runtime containment zones:

1. Root app/provider tree in [web/src/main.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/main.tsx)
   - `BrowserRouter`, `PersistQueryClientProvider`, `WorkspaceProvider`, `AuthProvider`, and the rest of the app shell are mounted without a top-level error boundary.
2. App shell outside `<Outlet />` in [web/src/pages/App.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx)
   - only `<Outlet />` is wrapped in `<ErrorBoundary>`
   - sidebars, command palette, modals, and shell-level UI are outside that boundary
3. Route-level render failures in [web/src/main.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/main.tsx)
   - routing uses `BrowserRouter` + `<Routes>` rather than a data router with `errorElement`
   - there is no route-specific fallback path for loader/render failures

Relevant implementation:

- boundary definition: [web/src/components/ui/ErrorBoundary.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/ui/ErrorBoundary.tsx)
- editor-local boundary usage: [web/src/components/Editor.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/Editor.tsx)
- app-layout outlet boundary usage: [web/src/pages/App.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/pages/App.tsx)

## Silent Failures Identified

### 1. Session timeout polling fails silently in Docker local dev

Severity: High

Reproduction:

1. Start the local Docker stack from [docker-compose.local.yml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/docker-compose.local.yml)
2. Log in
3. Open `/my-week`, `/issues`, or `/programs`
4. Observe repeated console errors for `GET /api/auth/session` on port `5173`

Why this is silent:

- [web/src/hooks/useSessionTimeout.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useSessionTimeout.ts) catches the fetch failure and ignores it
- the user sees no visible timeout-status degradation

### 2. Offline collaborative edits do not fully survive refresh

Severity: Critical

Reproduction:

1. Open the same document in two browser contexts
2. Type shared text while online
3. Take one client offline
4. Add more text offline
5. Reconnect and confirm live sync resumes
6. Refresh both clients

Observed result:

- reconnect sync resumed
- the offline delta did not survive refresh consistently

Why this matters:

- this creates a data-loss/confusion scenario in the collaboration flow

### 3. Concurrent title edits lose one user’s value with no conflict UI

Severity: High

Reproduction:

1. Open the same document in two clients
2. Edit the title in both clients at nearly the same time
3. Refresh both clients

Observed result:

- both clients converge to one final title
- one writer’s value is lost
- no warning or conflict UI appears

Why this matters:

- the body has CRDT-based collaboration, but the title does not provide equivalent conflict handling

### 4. Realtime WebSocket handshakes can fail with `429` and no user-facing banner

Severity: Medium

Reproduction:

1. Use multiple tabs or reconnect repeatedly during collaboration scenarios
2. Observe WebSocket errors in the browser console

Observed result:

- `ws://localhost:3000/events` handshake `429`
- `ws://localhost:3000/collaboration/...` handshake `429`
- frontend logs disconnect/reconnect events, but no clear user-facing degraded-realtime banner was surfaced in the baseline run

Relevant code:

- rate-limit close path in [api/src/collaboration/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/collaboration/index.ts)
- reconnect logic in [web/src/hooks/useRealtimeEvents.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useRealtimeEvents.tsx)

## Findings Ranked by Severity

1. Critical: offline collaborative edits only partially recover and do not reliably survive refresh.
2. High: session timeout polling fails silently in the Docker local environment, degrading auth/session UX without visible recovery.
3. High: concurrent title edits lose one user’s value with no conflict affordance.
4. Medium: realtime event/collaboration WebSockets can hit `429` connection-rate limits during reconnect churn with weak user-facing feedback.
5. Low: the tested XSS-like title payload behaved safely in this baseline; no immediate execution was observed.

## Evidence

- Browser/runtime probe: [benchmarks/runtime-error-probe.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-probe.json)
- API log window: [benchmarks/runtime-api-log-baseline.txt](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-api-log-baseline.txt)
- Probe implementation: [benchmarks/runtime-error-probe.mjs](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/benchmarks/runtime-error-probe.mjs)
