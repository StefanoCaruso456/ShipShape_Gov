# Structure Conventions

Use these folders for all future non-source outputs in this repository:

- Documentation: `artifacts-documentation/`
- Diagrams: `artifacts-diagrams/`
- Audit measurements: `audit-results/`
- Benchmarks: `benchmarks/`
- Internal notes and snapshots: `docs/internal/`
- Final deliverables: `final-report/`

Rules:

- Do not save audit artifacts under `web/`, `api/`, `shared/`, or `e2e/`.
- Do not overwrite existing documentation files. Create a new version or append to a new file instead.
- Keep generated diagrams separate from narrative documentation.
- Keep benchmark evidence separate from audit conclusions.
- Keep skill assets under `skills/`, separate from project artifacts.
