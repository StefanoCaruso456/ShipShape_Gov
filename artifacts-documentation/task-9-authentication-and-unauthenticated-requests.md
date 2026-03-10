# Task 9: Authentication and Unauthenticated Requests

## Short answer

Ship supports **three practical authentication modes**:

1. **Email/password login** that creates a custom database-backed session and sets a `session_id` cookie.
2. **CAIA/PIV login** that also ends by creating the same kind of `session_id` cookie.
3. **API token auth** via `Authorization: Bearer ...`, validated against the `api_tokens` table.

Protected routes are enforced by `authMiddleware`, which checks for a Bearer token first and falls back to the `session_id` cookie.

For an unauthenticated request:

- most protected read routes return **`401 UNAUTHORIZED`**
- expired sessions return **`401`** with a `SESSION_EXPIRED` error code
- some write routes return **`403` first** because CSRF protection runs before auth
- the frontend then redirects the user to `/login` or leaves them unauthenticated and lets `ProtectedRoute` send them there

## Important architectural detail

There are **two separate session mechanisms** in the API:

1. **Custom auth sessions** in the `sessions` table, keyed by the `session_id` cookie.
2. **`express-session` middleware**, which is present mainly to support CSRF token storage.

That distinction matters because the user’s login state is **not** coming from `req.session`; it comes from the custom `sessions` table.

Evidence:

- `sessions` table: [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L75)
- `express-session` setup: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L146)
- auth reads `req.cookies.session_id`: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L110)

## How authentication works

### 1. Email/password login

The login endpoint is `POST /api/auth/login`.

Source: [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L17)

Flow:

1. Validate that `email` and `password` exist.
2. Look up the user by case-insensitive email in `users`.
3. Reject if the user does not exist.
4. Reject if `password_hash` is null, which means the account is PIV-only.
5. Compare the password with `bcrypt`.
6. Load the user’s workspace memberships from `workspace_memberships`.
7. Pick the current workspace:
   - prefer `users.last_workspace_id` if still valid
   - otherwise use the first available workspace
   - allow super-admins to log in without a workspace
8. Delete any existing `session_id` from the incoming request to prevent session fixation.
9. Generate a new cryptographically random session ID.
10. Insert a row into `sessions` with `user_id`, `workspace_id`, `expires_at`, `last_activity`, `user_agent`, and `ip_address`.
11. Update `users.last_workspace_id`.
12. Set the `session_id` cookie with `httpOnly`, `sameSite: 'strict'`, and a 15-minute max age.
13. Return the authenticated user and workspace payload.

Key references:

- credential lookup and password verification: [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L32)
- workspace selection: [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L94)
- session creation: [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L141)
- cookie set: [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L184)

### 2. CAIA/PIV login

CAIA auth starts at `GET /api/auth/caia/login` and finishes at `GET /api/auth/caia/callback`.

Source: [api/src/routes/caia-auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/caia-auth.ts#L61)

Flow:

1. Generate OAuth state, nonce, and PKCE verifier.
2. Store that OAuth state in the database so the flow survives restarts.
3. Redirect the user through CAIA.
4. On callback, validate and consume the stored OAuth state.
5. Exchange the code for identity claims.
6. Match the user primarily by email.
7. If no user exists, require a valid pending invite and create the user from it.
8. Update `users.last_auth_provider = 'caia'`.
9. Delete any prior session cookie-backed session.
10. Create a new row in `sessions`.
11. Set the same `session_id` cookie used by password auth.
12. Redirect back into the app.

Key references:

- state creation/storage: [api/src/routes/caia-auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/caia-auth.ts#L72)
- callback validation: [api/src/routes/caia-auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/caia-auth.ts#L91)
- invite / user resolution: [api/src/routes/caia-auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/caia-auth.ts#L167)
- session creation and cookie: [api/src/routes/caia-auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/caia-auth.ts#L268)

### 3. API token auth

API tokens are created by an already-authenticated user and then used as Bearer tokens.

Schema:
- `api_tokens` table: [api/src/db/schema.sql](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/db/schema.sql#L253)

Creation route:
- [api/src/routes/api-tokens.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/api-tokens.ts#L31)

Flow:

1. An authenticated user creates a token.
2. The server generates a random token with a `ship_` prefix.
3. The server stores only the SHA-256 hash in `api_tokens`, not the raw token.
4. Later requests send `Authorization: Bearer ship_...`.
5. `authMiddleware` hashes the incoming token and looks it up in `api_tokens`.
6. If valid, it attaches `req.userId`, `req.workspaceId`, `req.isSuperAdmin`, and `req.isApiToken`.
7. It also updates `last_used_at`.

Key references:

- token generation/storage: [api/src/routes/api-tokens.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/api-tokens.ts#L68)
- Bearer validation in middleware: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L70)

## How protected requests are enforced

The core enforcement is in `authMiddleware`.

Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L65)

It works in this order:

1. Check `Authorization` header.
2. If it starts with `Bearer `, validate against `api_tokens`.
3. If no Bearer token is present, read `req.cookies.session_id`.
4. Look up the session row in `sessions`.
5. Reject if missing.
6. Reject if the session exceeds the 12-hour absolute timeout.
7. Reject if the session exceeds the 15-minute inactivity timeout.
8. Reject if the user no longer belongs to the selected workspace, unless they are super-admin.
9. Update `sessions.last_activity`.
10. Optionally refresh the cookie.
11. Attach identity and workspace context to the request object.

The request then continues to the route handler or to further authorization middleware like:

- `superAdminMiddleware`: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L243)
- `workspaceAdminMiddleware`: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L263)

## What happens to an unauthenticated request

### Case 1: No Bearer token and no `session_id` cookie

`authMiddleware` returns:

- HTTP `401`
- JSON error code: `UNAUTHORIZED`
- message: `No session found`

Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L110)

### Case 2: `session_id` cookie exists, but no matching DB row

`authMiddleware` returns:

- HTTP `401`
- JSON error code: `UNAUTHORIZED`
- message: `Invalid session`

Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L124)

### Case 3: Session exists but is expired

For both inactivity timeout and absolute timeout, the middleware:

1. deletes the row from `sessions`
2. returns HTTP `401`
3. uses error code `SESSION_EXPIRED`

Source:

- absolute timeout: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L154)
- inactivity timeout: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L168)

### Case 4: Bearer token is invalid, revoked, or expired

`authMiddleware` returns:

- HTTP `401`
- JSON error code: `UNAUTHORIZED`
- message: `Invalid or expired API token`

Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L75)

### Case 5: User is authenticated but no longer allowed into the workspace

This is not unauthenticated, but it is an auth failure path worth separating.

If the session’s `workspace_id` no longer matches a current `workspace_memberships` row, the middleware deletes the session and returns:

- HTTP `403`
- JSON error code: `FORBIDDEN`

Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L182)

### Case 6: State-changing route hits CSRF first

This is the main nuance.

Many write routes are mounted with `conditionalCsrf` before the router runs. That means an unauthenticated browser request to a POST/PATCH/DELETE endpoint may fail with **`403` from CSRF** before `authMiddleware` has a chance to return `401`.

Evidence:

- CSRF mounted ahead of routers: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L181)
- documented in tests:
  - [api/src/routes/documents.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/documents.test.ts#L524)
  - [api/src/routes/files.test.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/files.test.ts#L86)

So the accurate answer is:

- unauthenticated **read** requests usually get `401`
- unauthenticated **write** requests can get `403` first because CSRF runs before auth

## What the frontend does with unauthenticated responses

### App bootstrap

On startup, the frontend calls `api.auth.me()` to check whether a session exists.

Sources:

- auth bootstrap: [web/src/hooks/useAuth.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useAuth.tsx#L81)
- `me()` client call: [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L346)

If that call does not return a logged-in user:

1. `user` remains `null`
2. `loading` finishes
3. `ProtectedRoute` redirects the browser to `/login`

Source: [web/src/components/ProtectedRoute.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/ProtectedRoute.tsx#L20)

### Expired session vs no session

The frontend intentionally distinguishes:

- **expired session**: redirect to `/login?expired=true&returnTo=...`
- **no session / fresh unauthenticated visitor**: allow normal auth state resolution, then `ProtectedRoute` sends them to `/login` without the “expired session” messaging

Source: [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L23)

That distinction is handled in the generic request wrapper:

- if the backend returns `401` with `SESSION_EXPIRED`, the frontend forces the expired-session redirect
- if the backend returns `401` with plain `UNAUTHORIZED`, the client returns the error and lets route protection handle the redirect cleanly

Source: [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L194)

## Conclusion

Authentication in Ship is mostly **cookie-session auth backed by the `sessions` table**, with **API tokens as a secondary machine/client path** and **CAIA/PIV as an alternate way to create the same session cookie**.

The most important implementation detail is that:

- login state is enforced by a custom `session_id` cookie plus DB lookup
- not by `express-session`

And the most important nuance for failure behavior is that:

- unauthenticated read requests usually become `401`
- unauthenticated write requests may become `403` at the CSRF layer before auth runs
