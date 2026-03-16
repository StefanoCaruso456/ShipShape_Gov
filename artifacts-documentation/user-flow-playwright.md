# User Flow | Playwright

## Overview

This document catalogs the Playwright end-to-end and integration flows in `e2e/`.

Playwright is the browser automation layer for the running application. It launches Chromium, opens the app, executes user actions, and verifies the combined behavior of the frontend, backend, database, auth, and realtime flows.

This catalog is grouped by product area so it is easier to understand than a raw file list.

## How to read this document

- `Spec file`: the Playwright file in `e2e/`
- `Overview`: the primary product area or flow family covered by the file
- `Summary`: the main behavior the spec validates
- `Tests`: rough size of that spec from the current suite inventory

## Suite summary

- Primary purpose: end-to-end browser coverage plus API-backed integration checks
- Browser used: Chromium via Playwright
- Current final proof artifact: `stage-2/category-5-test-coverage-and-quality/playwright-final-clean.json`
- Final suite stats captured in the repo: `859 expected`, `5 unexpected`, `5 flaky`, `0 skipped`

## Authentication, Authorization, and Session Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `auth.spec.ts` | Login and logout | Verifies login page behavior, validation, successful login, logout, protected-route redirect, and case-insensitive email handling. | 7 |
| `authorization.spec.ts` | Role and workspace access control | Verifies super-admin, workspace-admin, cross-workspace isolation, API protection, impersonation controls, and audit-log access boundaries. | 17 |
| `session-timeout.spec.ts` | Session timeout lifecycle | Verifies inactivity warning, absolute timeout, extend-session behavior, re-login flow, activity tracking, modal accessibility, and timeout edge cases. | 58 |
| `spike-isolated.spec.ts` | Test environment sanity | Proves isolated seeded environment startup, API health, proxying, and seeded login. | 4 |

## Workspace, Admin, and Invite Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `workspaces.spec.ts` | Workspace switching and admin surfaces | Verifies workspace switcher, admin dashboard, workspace settings, workspace isolation, and invite-accept entry states. | 21 |
| `admin-workspace-members.spec.ts` | Workspace member administration | Verifies members view, pending invites, invite form, role changes, invite revoke/copy, user search, add-existing-user flow, and super-admin-only access. | 14 |
| `existing-user-invite.spec.ts` | Existing user invite correctness | Verifies valid `user_id` handling for assignments and the invite/add-existing-user path. | 9 |
| `pending-invites-allocation.spec.ts` | Pending invite visibility in planning views | Verifies pending users appear correctly in team/allocation surfaces and still behave correctly in selector flows. | 10 |

## Documents, Wiki, and Navigation Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `documents.spec.ts` | Core document CRUD entry flow | Verifies document list rendering, document creation, title editing, and list updates. | 4 |
| `docs-mode.spec.ts` | Docs mode experience | Verifies navigation into Docs mode, empty/list state, wiki creation, sidebar visibility, and title editing. | 7 |
| `private-documents.spec.ts` | Private vs workspace docs | Verifies private/workspace sections, default visibility, lock indicators, and private document behavior. | 20 |
| `document-isolation.spec.ts` | Document data isolation | Verifies content from one document never leaks into another during navigation or editing. | 3 |
| `document-workflows.spec.ts` | Document-to-work workflows | Verifies issue creation, assignment to program and sprint, issue-to-project conversion, and sprint-board visibility. | 4 |
| `wiki-document-properties.spec.ts` | Wiki properties sidebar | Verifies maintainer defaults, maintainer changes, timestamps, and sidebar layout consistency. | 10 |
| `backlinks.spec.ts` | Backlink graph behavior | Verifies backlink panel visibility, creation/removal of backlinks from mentions, navigation, counts, and realtime updates. | 8 |
| `toc.spec.ts` | Table of contents block | Verifies TOC insertion, heading tracking, updates on heading changes, navigation, and persistence. | 9 |
| `content-caching.spec.ts` | Fast document switching | Verifies no blank flash when toggling documents, healthy WebSocket connection state, and no WebSocket console errors. | 4 |
| `debug-create.spec.ts` | Targeted debug flow | Minimal debug-oriented spec for document creation behavior. | 1 |

## Editor, Rich Text, and Content Blocks

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `mentions.spec.ts` | Mention insertion UX | Verifies mention popup, search, keyboard navigation, escape behavior, insertion, and rendering. | 16 |
| `real-integration.spec.ts` | Real mention and editor integration | Verifies mention APIs return real DB data, mention UI wiring works, and document editing behaves correctly in a real integration path. | 9 |
| `features-real.spec.ts` | Real editor feature stack | Verifies real mention, document mention, image upload, editor entry, and other key editor features against the real app stack. | 24 |
| `inline-code.spec.ts` | Inline code formatting | Verifies inline code creation, keyboard shortcut behavior, styling, persistence, and multiple inline code segments. | 8 |
| `syntax-highlighting.spec.ts` | Code blocks | Verifies code-block creation, language selection, syntax rendering, multiline editing, and persistence. | 9 |
| `tables.spec.ts` | Table editing | Verifies table creation, row/column operations, navigation, editing, resizing, deletion, and persistence. | 14 |
| `toggle.spec.ts` | Toggle / collapsible blocks | Verifies toggle creation, expand/collapse, title/content editing, nested content, keyboard behavior, and persistence. | 9 |
| `emoji.spec.ts` | Emoji picker flow | Verifies picker trigger, filtering, keyboard selection, click selection, rendering, and persistence. | 13 |
| `images.spec.ts` | Image insertion and upload | Verifies preview, upload, slash-command image insertion, persistence, and offline queue behavior. | 8 |
| `file-attachments.spec.ts` | File attachment flow | Verifies slash-command attachment insertion, upload progress, validation, persistence, and download behavior. | 14 |
| `file-upload-api.spec.ts` | Upload API integration | Verifies authenticated upload endpoint, presigned URL generation, and upload confirmation response shape. | 3 |
| `inline-comments.spec.ts` | Inline review comments | Verifies text selection comment flow, keyboard shortcut, comment card behavior, and inline comment lifecycle. | 9 |
| `drag-handle.spec.ts` | Block drag handle UX | Verifies drag-handle visibility, hover behavior, selection, and block-reordering affordances. | 19 |
| `tooltips.spec.ts` | UI tooltips | Verifies hover tooltips for rail icons, new document button, delete control, and command palette controls. | 4 |
| `icons.spec.ts` | Basic icon rendering | Verifies icon assets render successfully in the login surface. | 1 |

## Issues, Bulk Operations, and List/Kanban Workflows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `issues.spec.ts` | Issues mode basics | Verifies issue list rendering, new issue flow, display of ticket number, and issue filtering tabs. | 13 |
| `issue-display-id.spec.ts` | Ticket numbering | Verifies issue display IDs use the expected `#N` format and increment correctly. | 7 |
| `issue-estimates.spec.ts` | Estimate field behavior | Verifies free-text/decimal estimate entry, label hints, and estimate behavior in issue workflows. | 10 |
| `issues-bulk-operations.spec.ts` | Context-menu bulk issue actions | Verifies archive and change-status paths exposed from issue context menus. | 3 |
| `bulk-selection.spec.ts` | Selection model and batch actions | Verifies list and kanban multi-select, keyboard selection, Vim-style nav, action bar, archive/move/delete/status changes, accessibility, and performance. | 85 |
| `context-menus.spec.ts` | Context menu behavior | Verifies three-dot and right-click context menus across sidebar, program, issue, and team surfaces. | 8 |

## Programs, Weeks, Team Mode, and Planning Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `programs.spec.ts` | Programs mode basics | Verifies navigation to Programs mode, creation of new program, sidebar list updates, and tabbed program editor layout. | 16 |
| `weeks.spec.ts` | Week assignment and planning entry | Verifies weeks tab visibility, assigning an issue to a sprint, and start-week CTA visibility. | 3 |
| `project-weeks.spec.ts` | Project weeks grid | Verifies allocated team members appear in the grid, navigation from grid cells to weekly docs, and project link behavior. | 5 |
| `program-mode-week-ux.spec.ts` | Program-week data model and UX | Verifies sprint data shape, computed status logic, week/program UX, and many week-oriented program interactions. | 66 |
| `team-mode.spec.ts` | Team assignments mode | Verifies teams-mode navigation, grid structure, sprint columns, assignment changes, regrouping, collapse/expand, and project dropdown behavior. | 20 |
| `status-overview-heatmap.spec.ts` | Status heatmap | Verifies navigation to the status overview, legend rendering, program/person layout, split plan/retro cells, and week-column behavior. | 11 |
| `weekly-accountability.spec.ts` | Weekly plan/retro APIs and navigation | Verifies weekly plan and retro document creation, idempotency, query endpoints, history endpoints, and document navigation. | 19 |
| `my-week-stale-data.spec.ts` | My Week freshness | Verifies plan and retro edits remain visible after leaving and returning to `/my-week`. | 3 |

## Accountability, Reviews, and Change-Request Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `accountability-week.spec.ts` | Week accountability rules | Verifies missing plan, not-started sprint, empty sprint, and future sprint action-item logic. | 4 |
| `accountability-standup.spec.ts` | Standup accountability rules | Verifies standup action-item generation and removal based on business-day rules and assigned-issue state. | 3 |
| `accountability-owner-change.spec.ts` | Accountability recalculation on owner change | Verifies changing sprint owner updates inferred action-item state correctly. | 2 |
| `accountability-banner-urgency.spec.ts` | Accountability urgency banner | Verifies overdue/due-today flags, banner color severity, and banner-to-modal navigation. | 4 |
| `manager-reviews.spec.ts` | Review APIs and review page | Verifies review page rendering plus plan/retro review approval APIs and rating requirements. | 6 |
| `manager-reviews-visual.spec.ts` | Review workflow visual validation | Verifies request-changes and approve-with-note review flows from the reviewer’s perspective. | 2 |
| `request-changes-api.spec.ts` | Request-changes API contract | Verifies valid and invalid request-changes calls, auth rules, response codes, and sprint property updates. | 13 |
| `request-changes-ui.spec.ts` | Request-changes UI | Verifies Reviews page legend, batch-review entry points, and request-changes actions in review mode. | 6 |
| `changes-requested-notifications.spec.ts` | Notification aftermath of requested changes | Verifies action-item and sprint-property updates after plan/retro change requests. | 4 |
| `feedback-consolidation.spec.ts` | External feedback into issue workflow | Verifies external issue submission, source labeling, triage state, confirmation UX, and issues-list source presentation. | 18 |

## Search, AI, and Integration APIs

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `search-api.spec.ts` | Search API behavior | Verifies auth requirements, people/document results, and result limiting. | 4 |
| `ai-analysis-api.spec.ts` | AI analysis endpoints | Verifies AI status, plan analysis, retro analysis, auth, validation rules, and rate limiting. | 11 |
| `real-integration.spec.ts` | Real API + editor integration | Verifies real user search, upload API behavior, and healthy integration boundaries. | 9 |

## Data Integrity, Error Handling, and Race-Condition Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `data-integrity.spec.ts` | Persistence and structure integrity | Verifies complex document content, formatting, images, and persistence survive save/reload correctly. | 12 |
| `error-handling.spec.ts` | Runtime error recovery | Verifies graceful handling of API errors, network disconnects, mention search failure, and WebSocket reconnection. | 9 |
| `edge-cases.spec.ts` | Boundary-condition behavior | Verifies long titles, empty docs, rapid typing, undo/redo, and large paste handling. | 12 |
| `race-conditions.spec.ts` | Rapid action correctness | Verifies rapid saves, title changes, document creation, mention search, upload concurrency, and offline/slow-network behavior. | 10 |
| `autosave-race-conditions.spec.ts` | Auto-save ordering and retry | Verifies stale saves never overwrite current text, throttling works, retries happen, and slow responses do not clobber local state. | 8 |
| `critical-blockers.spec.ts` | Core regression blockers | Verifies ticket-number uniqueness, expired-session handling, and baseline WebSocket behavior under limit. | 6 |
| `document-isolation.spec.ts` | Cross-document contamination prevention | Verifies switching documents cannot contaminate content state between editors. | 3 |
| `content-caching.spec.ts` | Cached navigation integrity | Verifies fast cached doc switching without blank states or connection regressions. | 4 |

## Security Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `security.spec.ts` | Security regression coverage | Verifies XSS escaping, file validation, path safety, CSRF protections, authenticated route enforcement, workspace isolation, and session logout behavior. | 19 |

## Accessibility Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `accessibility.spec.ts` | Baseline accessibility checks | Verifies axe-core scans, keyboard-only navigation, focus visibility, labeling, and loading-state accessibility. | 11 |
| `check-aria.spec.ts` | Targeted ARIA check | Verifies `aria-expanded` behavior on relevant controls. | 1 |
| `status-colors-accessibility.spec.ts` | Accessible status-color usage | Verifies status and priority color classes remain accessible across issues, programs, weeks, and feedback surfaces. | 7 |
| `accessibility-remediation.spec.ts` | Full remediation verification | Verifies color-only state fixes, keyboard instructions, aria-live regions, combobox semantics, focus visibility, skip links, landmark structure, form labeling, target size, error identification, and automated axe scans after remediation. | 57 |

## Performance and System-Level Flows

| Spec file | Overview | Summary | Tests |
| --- | --- | --- | ---: |
| `performance.spec.ts` | User-perceived performance | Verifies load times, navigation responsiveness, typing latency, and other speed-sensitive UX thresholds. | 15 |

## Concise takeaway

The Playwright suite is not one flow. It is a browser-driven system map of Ship:

- auth and session control
- workspaces, roles, and invites
- docs, private docs, and wiki behavior
- editor blocks, uploads, mentions, and comments
- issues, bulk actions, and context menus
- programs, weeks, team mode, and status views
- accountability, reviews, and request-changes workflows
- AI and search integrations
- race conditions, caching, and error recovery
- security and accessibility regressions
- performance-sensitive user journeys

That makes Playwright the closest thing in the repo to a full application-level verification layer.
