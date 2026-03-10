# Network Request Tracing Guide

## Purpose

Use the Chrome DevTools **Network** tab to understand how the frontend talks to the backend and which file in the repo triggered each request.

## What the Network Columns Mean

### `Name`

The request path, resource name, or WebSocket channel name.

Examples:
- `issues`
- `action-items`
- `status`
- `convert`
- `issue:fbfe...` for a collaboration WebSocket room

### `Status`

The HTTP or socket result.

Common values:
- `200` = request succeeded
- `304` = response not modified, cache reused
- `204` = success with no response body
- `101` = WebSocket handshake succeeded
- `Finished` = socket connection ended

### `Type`

What kind of network activity it was.

Common values:
- `fetch` = JavaScript Fetch API request
- `websocket` = realtime connection
- `preflight` = browser CORS permission check before the real request
- `script` = JavaScript file load

Important:
- `fetch` is **not** the same thing as HTTP `GET`
- `fetch` only tells you the browser API that sent the request
- the actual HTTP method could still be `GET`, `POST`, `PATCH`, or `DELETE`

### `Initiator`

The frontend file and line that triggered the request.

Examples:
- `api.ts:119`
- `Editor.tsx:384`
- `document-tabs.tsx:53`

Meaning:
- yes, this points to the real file in the repo
- usually a `.ts` or `.tsx` file
- it tells you where in the frontend code the request started

### `Size`

How much data came back.

Common pattern:
- `0.0 kB` often means socket handshake, cached response, or empty body
- larger values usually mean JSON or other payload data was returned

### `Time`

How long the request took.

## What Common Rows Mean

### `issues` `200` `fetch`

The frontend requested issue data from the backend and got a successful JSON response.

### `fbfe065f-...` `200` `fetch`

The frontend fetched the current document by its ID.

### `issue:fbfe065f-...` `101` `websocket`

The editor opened a realtime collaboration WebSocket for that issue document.

### `action-items` `304` `fetch`

The frontend checked action items, and the server replied that nothing changed, so the cached response was reused.

### `convert` `204` `preflight`

The browser first ran a CORS preflight check before the real cross-origin request.

Important:
- preflight is a browser permission check for CORS
- it is **not** user authorization
- it is **not** RBAC validation

## Best Mental Model

Each row is one conversation between the frontend and backend.

- `fetch` rows = REST API conversations
- `websocket` rows = realtime conversations
- `Initiator` = which frontend file started it
- `Status` = whether it worked
- `Name` = which resource or channel it was about

## How to Use This for Tracing

To trace one user action:

1. Open DevTools
2. Go to **Network**
3. Filter to `Fetch/XHR`
4. Clear the table
5. Perform the action in the app
6. Click the new request
7. Check:
   - `Headers` for URL and method
   - `Payload` for what the frontend sent
   - `Response` for what the backend returned
   - `Initiator` for the frontend file that triggered it

## One-Sentence Summary

The Network tab shows each frontend-backend conversation, and the `Initiator` column tells you which repo file started that request.
