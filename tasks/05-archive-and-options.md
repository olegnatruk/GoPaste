# Task 05 — ZIP Import/Export and Options Page

Status: Complete (automated verification; interactive Chrome check remains in Task 06)  
Dependencies: Tasks 01 and 02  
Primary ownership: `src/infrastructure/archive/`, `src/options/`, archive/options tests

## Scope

- Implement deterministic archive v1 export and download.
- Implement defensive ZIP import with metadata/path/MIME/hash/limit validation, bounded batches, duplicates, progress, and partial-failure summary.
- Implement options-page storage statistics and archive controls.

## Acceptance Criteria

- Export/import round trip preserves bytes and supported metadata.
- Traversal, excessive size/count, missing/corrupt metadata, MIME mismatch, bad hashes, and duplicate content are handled safely.
- Valid entries can import despite unrelated invalid entries, without corrupting existing records.
- Options controls are accessible, prevent accidental concurrent operations, and expose progress/results.

## Verification

Run archive/repository/component tests, typecheck/build, and manual round-trip/corrupt-archive checks.

## Completion Evidence

- `npm test -- --run tests/unit/archive-service.test.ts tests/unit/options-shell.test.tsx`: 2 files, 8 tests passed.
- `npm run check`: formatting, lint, typecheck, 11 test files / 49 tests, and production build passed.
- Archive tests cover deterministic output, byte/metadata round trip, traversal, compressed-size and item-count limits, missing/corrupt metadata, missing files, MIME mismatch, bad hashes, duplicate content, and partial valid import.
- Options component tests cover statistics, export/download, disabled concurrent controls, progress/result announcements, import summary, and statistics retry.
- Interactive unpacked-extension round trip and corrupt-archive observation are explicitly assigned to Task 06; no manual Chrome result is claimed here.
