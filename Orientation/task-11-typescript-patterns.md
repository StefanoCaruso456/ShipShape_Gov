# Task 11: TypeScript Patterns

## TypeScript version

- Declared workspace version: `^5.7.2`
  - [package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/package.json#L48)
  - [api/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/package.json#L75)
  - [web/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/package.json#L79)
  - [shared/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/package.json#L23)
- Current lockfile-resolved version: `5.9.3`
  - [pnpm-lock.yaml](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/pnpm-lock.yaml#L4485)

Conclusion: the repo is authored against `^5.7.2`, but the currently locked/installable version is `5.9.3`.

## tsconfig settings

### Root config

Defined in [tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/tsconfig.json#L3).

- `target: "ES2022"`
- `lib: ["ES2022"]`
- `module: "NodeNext"`
- `moduleResolution: "NodeNext"`
- `resolveJsonModule: true`
- `declaration: true`
- `declarationMap: true`
- `sourceMap: true`
- `noEmit: false`
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `forceConsistentCasingInFileNames: true`
- `esModuleInterop: true`
- `allowSyntheticDefaultImports: true`
- `isolatedModules: true`
- `skipLibCheck: true`

Strict mode: **yes**.

### Package-specific configs

- `api/` extends root and emits to `dist`, with path mapping for `@ship/shared` to `../shared/dist`
  - [api/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/tsconfig.json#L2)
- `shared/` extends root, emits to `dist`, and is `composite: true`
  - [shared/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/tsconfig.json#L2)
- `web/` uses a separate Vite-oriented config:
  - `module: "ESNext"`
  - `moduleResolution: "bundler"`
  - `lib: ["ES2022", "DOM", "DOM.Iterable"]`
  - `jsx: "react-jsx"`
  - `strict: true`
  - `noEmit: true`
  - project reference to `../shared`
  - [web/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/tsconfig.json#L2)

## How types are shared between frontend and backend

The shared package is a compiled workspace library:

- package export surface: [shared/package.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/package.json#L7)
- barrel export: [shared/src/index.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/index.ts#L1)

What it contains:

- shared constants like `HTTP_STATUS`, `ERROR_CODES`, session timeouts
  - [shared/src/constants.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/constants.ts#L2)
- shared API wrapper types like `ApiResponse<T>`
  - [shared/src/types/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/api.ts#L2)
- the main document model: `DocumentType`, typed document variants, `BelongsTo`, approval types, `computeICEScore`
  - [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts#L33)

How it is wired:

- backend imports built declarations from `../shared/dist` via tsconfig paths
  - [api/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/tsconfig.json#L7)
- frontend references the shared project directly
  - [web/tsconfig.json](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/tsconfig.json#L21)

Representative usage:

- backend imports shared constants for auth/session handling
  - [api/src/routes/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/auth.ts#L7)
- frontend imports shared helpers like `computeICEScore`
  - [web/src/hooks/useProjectsQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useProjectsQuery.ts#L3)

Important caveat: sharing is partial, not absolute. The document model and constants are centralized in `shared/`, but many API response/view-model shapes are still defined locally in `web/` and `api/`.

## Examples in the codebase

### Generics

- `ApiResponse<T = unknown>`
  - [shared/src/types/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/api.ts#L2)
- `request<T>(...)`
  - [web/src/lib/api.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/lib/api.ts#L158)
- `PaginatedResponseSchema = <T extends z.ZodTypeAny>(...) => ...`
  - [api/src/openapi/schemas/common.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/openapi/schemas/common.ts#L48)

### Discriminated unions

- Shared typed documents use `document_type` as the discriminator:
  - `WikiDocument`, `IssueDocument`, `ProjectDocument`, etc.
  - [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts#L267)
- Frontend sidebar model does the same with `PanelDocument`
  - union: [web/src/components/sidebars/PropertiesPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/sidebars/PropertiesPanel.tsx#L143)
  - narrowing switch: [web/src/components/sidebars/PropertiesPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/sidebars/PropertiesPanel.tsx#L497)

### Utility types

- `Partial<ProjectProperties>` for default project properties
  - [shared/src/types/document.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/shared/src/types/document.ts#L320)
- `Partial<Project>` in update APIs
  - [web/src/hooks/useProjectsQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useProjectsQuery.ts#L129)
- `Partial<PanelDocument>` in sidebar update contracts
  - [web/src/components/sidebars/PropertiesPanel.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/sidebars/PropertiesPanel.tsx#L207)
- `Pick<>`: **none found** in `api/src`, `web/src`, or `shared/src`
- `Omit<>`: **none found** in `api/src`, `web/src`, or `shared/src`

### Type guards

- Custom predicate: `isReference(schema): schema is ReferenceObject`
  - [api/src/mcp/server.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/mcp/server.ts#L182)
- Custom predicate: `isValidRelationshipType(value): value is RelationshipType`
  - [api/src/routes/associations.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/associations.ts#L36)
- Custom predicate: `isError(result): result is AnalysisError`
  - [web/src/components/sidebars/QualityAssistant.tsx](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/components/sidebars/QualityAssistant.tsx#L80)
- Filter predicate narrowing array members:
  - [web/src/hooks/useTeamMembersQuery.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useTeamMembersQuery.ts#L51)

## Less-common but standard patterns

I did **not** find any repo-specific TypeScript pattern that looked unfamiliar enough to require outside research. The less-common patterns here are standard TS features:

- `satisfies` to verify a value conforms to a target type without widening it
  - [web/src/hooks/useWeeklyReviewActions.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/web/src/hooks/useWeeklyReviewActions.ts#L309)
- `declare global` for Express request augmentation
  - [api/src/middleware/auth.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/middleware/auth.ts#L7)
- `ReturnType<typeof Router>` to alias the Express router instance type
  - [api/src/routes/issues.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/issues.ts#L16)
- `as const` to keep literal tuples/narrow unions intact
  - [api/src/routes/associations.ts](/Users/stefanocaruso/Desktop/Gauntlet/ShipShape/api/src/routes/associations.ts#L33)

## Bottom line

- Strict mode is on.
- The effective installed TypeScript version is `5.9.3`, even though the manifests declare `^5.7.2`.
- `shared/` is the main cross-package source of document-model types, constants, and a few helpers, but not every API shape is centralized there.
- The repo uses generics, discriminated unions, `Partial`, user-defined type guards, `satisfies`, module augmentation, and `as const`.
- I did not find `Pick` or `Omit` usage in the main app packages.
