# Stage 2 Artifacts

This folder is the working evidence store for Stage 2 implementation.

## Structure
- `category-1-type-safety/`: before/after measurements, benchmark script, benchmark command, and reasoning copy
- `category-2-bundle-size/`: before/after bundle builds, treemaps, summary metrics, and reasoning copy
- `category-3-api-response-time/`: reserved for API latency benchmarks
- `category-4-database-query-efficiency/`: reserved for query-count and EXPLAIN evidence
- `category-5-test-coverage-and-quality/`: reserved for test baselines and improvements
- `category-6-runtime-error-and-edge-case-handling/`: reserved for repro notes, screenshots, and before/after behavior
- `category-7-accessibility-compliance/`: reserved for Lighthouse, axe, and keyboard/screen reader evidence

## Category 1
- Before: `category-1-type-safety/before.json`
- After: `category-1-type-safety/after.json`
- Benchmark: `category-1-type-safety/benchmark.mjs`
- Command: `category-1-type-safety/benchmark-command.txt`
- Reasoning: `category-1-type-safety/reasoning.md`

## Category 2
- Before build output: `category-2-bundle-size/before-build-output.txt`
- After build output: `category-2-bundle-size/after-build-output.txt`
- Before treemap: `category-2-bundle-size/before-treemap.html`
- After treemap: `category-2-bundle-size/after-treemap.html`
- Summary: `category-2-bundle-size/summary.json`
- Command: `category-2-bundle-size/benchmark-commands.txt`
- Reasoning: `category-2-bundle-size/reasoning.md`

The original benchmark files remain in `benchmarks/` and the final narrative remains in `final-report/` so existing references do not break.
