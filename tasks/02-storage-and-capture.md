# Task 02 — IndexedDB Storage and Context Capture

Status: Implemented — automated verification passes; loaded-extension manual capture pending  
Dependencies: Task 01  
Primary ownership: `src/infrastructure/indexeddb/`, `src/infrastructure/media/`, `src/background/`, storage/capture tests

## Scope

- Implement schema v1, repository operations, transactions, paging, totals, and unique SHA-256 handling.
- Implement MIME magic-byte validation and the 25 MiB item limit.
- Register the image context menu and capture/fetch/store flow.
- Persist and expose recent capture status without relying on service-worker memory.

## Acceptance Criteria

- Supported fetched media persists with validated metadata and survives repository reopen.
- Exact duplicates are skipped, failures do not leave partial records, and stable error codes are surfaced.
- Context menu is idempotently registered and uses the clicked `srcUrl` and page URL.
- Repository, validation, duplicate, and capture orchestration tests pass.

## Verification

Run focused tests, full typecheck/build, then manually capture representative images in a loaded extension.

## Implementation Evidence

- Focused storage/capture suite: 18 tests passed across repository integration, media validation,
  capture orchestration, and context-menu behavior.
- Full automated suite: 21 tests passed; lint, typecheck, and production build passed.
- IndexedDB integration coverage includes reopen persistence, unique SHA-256 duplicate skips,
  atomic bulk rollback, paging/search/tag filtering, totals, metadata updates, deletion, and durable
  recent-capture status.
- Manual capture in a loaded Chrome extension remains pending because this agent environment did not
  provide an interactive signed-in Chrome session. No real-site fetch compatibility is claimed from
  mocked/unit coverage.
