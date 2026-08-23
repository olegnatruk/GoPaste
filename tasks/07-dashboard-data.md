# Task 07 — Dashboard Data Contracts and Local Services

Status: Complete (2026-08-23)
Dependencies: Tasks 02 and 05
Primary ownership: `src/core/domain/`, `src/core/ports/`, `src/infrastructure/indexeddb/`, data tests

## Scope

- Add backward-compatible dashboard metadata, category, usage, preference, query, and statistics contracts.
- Upgrade IndexedDB without rewriting existing media blobs.
- Implement local category/preference/usage repositories, advanced listing, batch metadata operations, and exact duplicate groups.

## Acceptance Criteria

- Version-1 records normalize safely and migrate without data loss.
- Dashboard reads/writes remain local and bounded.
- Batch destructive operations report scope and partial failures.
- Exact duplicate results are deterministic and never delete automatically.

## Verification

Run focused repository tests, typecheck, lint, and the production build.

## Completion Evidence

- IndexedDB v2 migration, legacy normalization, advanced local queries, batch operations, categories, preferences, usage counters, statistics, and exact-duplicate groups are implemented.
- Five dashboard integration tests pass alongside the legacy media repository tests.
- Typecheck, owned-file lint/format checks, and the production build pass at handoff.
