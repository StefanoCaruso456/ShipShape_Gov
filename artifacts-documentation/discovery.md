# Discovery

This note captures three things I learned from the codebase that I did not know before reviewing it. These are all pre-existing patterns in the repo, not part of the accessibility remediation changes.

## 1. Isolated End-to-End Test Environments

**Where I found it**

- `e2e/fixtures/isolated-env.ts`, lines `1-15`, `27-50`, and `90-260`

**What it does**

This test setup gives each Playwright worker its own:

- PostgreSQL container
- API server
- Vite preview server

It also assigns each worker its own port range to avoid collisions when tests run in parallel.

**Why it matters**

This is a strong testing best practice. It prevents flaky tests caused by shared state, shared ports, or one test affecting another test's database. The file also shows another smart engineering choice: using `vite preview` instead of `vite dev` during E2E tests to reduce memory usage and improve stability.

**How I would apply this in a future project**

If I build a full-stack app with a real database and backend, I would use this same pattern for E2E testing. It is especially valuable once a test suite grows large enough that shared environments start causing random failures.

## 2. A Unified Document Model with Typed Relationships

**Where I found it**

- `api/src/db/seed.ts`, lines `19-35`

**What it does**

The application treats many content types as documents and connects them through a `document_associations` table using explicit relationship types such as:

- `program`
- `project`
- `sprint`

Instead of hard-coding every relationship into separate table-specific columns, the system uses one central content model with typed links between records.

**Why it matters**

This is a strong architectural pattern for products where many records behave similarly but still need flexible relationships. It makes the system easier to extend because new document types or relationship types can often be added without redesigning the entire schema.

**How I would apply this in a future project**

I would use this approach in a planning, workflow, or knowledge-management product where tasks, notes, projects, and planning artifacts all need to connect to each other. It is a good fit when the product needs a flexible graph of related content rather than a set of isolated entities.

## 3. Accessibility-Aware Focus Management on Route Changes

**Where I found it**

- `web/src/hooks/useFocusOnNavigate.ts`, lines `4-24`

**What it does**

This hook does two important things whenever the route changes:

- moves focus to the main content area
- updates `document.title` based on the current route

**Why it matters**

This is an important best practice for single-page applications. In SPAs, route changes often update the screen visually without behaving like a normal page load for keyboard users or screen readers. Moving focus to the main content and updating the title helps restore the accessibility behavior users expect.

**How I would apply this in a future project**

I would make this a standard shared hook in any React app with client-side routing. It is a small implementation detail, but it improves keyboard navigation, screen-reader usability, and overall accessibility in a meaningful way.

## Bottom Line

The three strongest discoveries were:

1. fully isolated end-to-end environments for reliable parallel testing
2. a unified document model with typed relationship records
3. route-level focus management to preserve accessibility in a single-page app

These are all examples of engineering decisions that scale well because they improve reliability, flexibility, and usability at the system level rather than only solving one local problem.
