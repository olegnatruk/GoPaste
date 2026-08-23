# Task 09 — Insights, Taxonomy, and Maintenance Services

Status: Complete (2026-08-23)
Dependencies: Task 07
Primary ownership: `src/core/services/`, related unit tests

## Scope

- Implement local statistics aggregation, metadata-based tag suggestions, taxonomy helpers, storage breakdowns, and bounded exact/near-duplicate candidate scoring.
- Keep all calculations deterministic, local, cancellable/bounded where work may be large, and advisory for cleanup.

## Acceptance Criteria

- Metrics reconcile with supplied records and usage counters.
- Suggestions never mutate records without acceptance.
- Duplicate candidates include explainable similarity and do not delete automatically.

## Verification

Run focused unit tests, typecheck, lint, and the production build.

## Completion Evidence

- Pure local filtering, storage/usage aggregation, overview data, metadata tag suggestions, exact grouping, and explainable near-duplicate scoring are implemented.
- Near-duplicate analysis is capped at 25,000 comparisons and never mutates or deletes records.
- Six focused unit tests, typecheck, and owned-file lint checks pass.
