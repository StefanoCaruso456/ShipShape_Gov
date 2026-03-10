# Task 8: API Middleware Chain

## Short answer

There are two layers to the middleware chain:

1. **Global app-level middleware** in `createApp()` runs before route matching for essentially all `/api/*` requests.
2. **Route-level middleware** then depends on which router/endpoint matched, usually adding CSRF, authentication, and sometimes authorization.

So the strict answer to "what runs before every API request?" is the **app-level chain**. For most protected endpoints, that chain is then followed by `conditionalCsrf`, `authMiddleware`, and sometimes `superAdminMiddleware` or `workspaceAdminMiddleware`.

## Global chain in `api/src/app.ts`

Defined in [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L90).

For a normal `/api/*` request, the middleware order is:

1. **Production-only proxy normalization**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L93)
   In production, the app trusts the proxy and rewrites `x-forwarded-proto` to `https` for CloudFront traffic.

2. **`helmet(...)`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L110)
   Adds security headers, CSP, HSTS, and related browser protections.

3. **`apiLimiter` on `/api/`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L136)
   Applies a general rate limit to all API routes under `/api/`.

4. **`cors(...)`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L138)
   Enables cross-origin requests from the configured frontend origin with credentials.

5. **`express.json(...)`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L142)
   Parses JSON request bodies up to 10 MB.

6. **`express.urlencoded(...)`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L143)
   Parses URL-encoded form bodies.

7. **`cookieParser(sessionSecret)`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L144)
   Parses cookies so session and CSRF-related values are available downstream.

8. **`express-session`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L146)
   Initializes the session layer used for CSRF token storage and cookie-backed auth flows.

After that, Express matches the route and applies any router-specific middleware.

## What usually runs next on protected routes

For most application endpoints, the next chain is:

1. **`conditionalCsrf`**
   Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L51)
   This enforces CSRF for session-based browser requests, but explicitly skips Bearer-token requests.

2. **`authMiddleware`**
   Source: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L65)
   This authenticates the caller in one of two ways:
   - Bearer token: validates against `api_tokens`, updates `last_used_at`, and populates `req.userId`, `req.workspaceId`, and `req.isSuperAdmin`.
   - Session cookie: loads `sessions`, enforces inactivity and absolute timeouts, verifies workspace membership, refreshes the cookie when needed, and populates the same request fields.

3. **Optional authorization middleware**
   Examples:
   - `superAdminMiddleware`: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L243)
   - `workspaceAdminMiddleware`: [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L263)

4. **Route handler**
   Example protected router pattern:
   - admin router applies `router.use(authMiddleware, superAdminMiddleware)` to every handler inside it: [api/src/routes/admin.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/admin.ts#L10)

## Common endpoint patterns

### Most stateful app routes

These are mounted with `conditionalCsrf` at the app level and then typically apply `authMiddleware` inside the router:

- `/api/documents`
- `/api/issues`
- `/api/programs`
- `/api/projects`
- `/api/weeks`
- `/api/standups`
- `/api/team`
- `/api/workspaces`
- `/api/admin`
- `/api/invites`
- `/api/api-tokens`
- `/api/ai`
- `/api/weekly-plans`
- `/api/weekly-retros`
- `/api/files`
- `/api/comments`

Evidence: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L181)

Typical full chain:

`helmet -> apiLimiter -> cors -> body parsers -> cookieParser -> session -> conditionalCsrf -> authMiddleware -> optional admin guard -> handler`

### Read-only routers

Some routers are intentionally mounted **without app-level CSRF**, because they are read-only, but they still usually enforce authentication inside the router:

- `/api/claude`
- `/api/search`
- `/api/activity`
- `/api/dashboard`
- `/api/accountability`

Evidence:
- app-level mounting: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L199)
- example authenticated read-only handler: [api/src/routes/search.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/search.ts#L17)

Typical full chain:

`helmet -> apiLimiter -> cors -> body parsers -> cookieParser -> session -> authMiddleware -> handler`

### Special public or semi-public endpoints

Some endpoints intentionally skip parts of the normal protected chain:

- `/api/csrf-token`
  Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L159)
  No auth middleware here; it just returns a generated CSRF token.

- `/health`
  Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L164)
  Health check, no auth or CSRF.

- `/api/docs`, `/api/openapi.json`, `/api/openapi.yaml`
  Source: [api/src/swagger.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/swagger.ts#L22)
  Public API documentation.

- `/api/feedback` public router
  Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L175)
  The public feedback router is mounted before protected routes and requires neither auth nor CSRF.

- `/api/auth/caia` and `/api/auth/piv`
  Source: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L223)
  OAuth/PIV callback flow, intentionally not behind CSRF.

### Login endpoint

`/api/auth/login` gets an extra rate-limiter before the auth router:

- `loginLimiter`: [api/src/app.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/app.ts#L178)

So the login chain is:

`helmet -> apiLimiter -> cors -> body parsers -> cookieParser -> session -> loginLimiter -> conditionalCsrf -> login handler`

## Conclusion

If the question is literally "what runs before every API request?", the answer is:

- `helmet`
- `apiLimiter` for `/api/*`
- `cors`
- `express.json`
- `express.urlencoded`
- `cookieParser`
- `express-session`

Plus, in production only:

- proxy trust / CloudFront `x-forwarded-proto` normalization

If the question means "what usually runs before a normal protected business endpoint?", then the practical chain is:

- global app middleware
- `conditionalCsrf`
- `authMiddleware`
- optional admin/workspace guard
- handler
