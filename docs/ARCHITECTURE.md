# Architecture

## Runtime Surfaces

GoPaste has four Chrome extension surfaces and a shared core:

```text
Chrome context menu
        |
        v
background service worker --> capture use case --> IndexedDB repository
        ^                                             ^
        |                                             |
popup UI ---------------- application services -------+
options UI ------------- archive/storage services ----+
dashboard UI ----------- library/insight services -----+
```

- The **service worker** owns context-menu registration and capture orchestration. It must not rely on durable in-memory state because Chrome can suspend it.
- The **popup** owns library browsing and item actions. It must remain useful in a narrow viewport and release generated object URLs.
- The **options page** owns storage statistics and archive import/export.
- The **dashboard** is a full-page local management surface for overview, library organization, taxonomy, insights, maintenance, backup, and preferences. It reads and writes through local repositories and never requires a network service.
- The **core** contains domain types and pure or adapter-driven use cases. It cannot import React or call Chrome APIs directly.
- **Adapters** isolate IndexedDB, Chrome APIs, clipboard, drag payloads, hashing, downloads, and ZIP processing.

## Proposed Source Layout

```text
src/
  background/
  popup/
  options/
  dashboard/
  core/
    domain/
    services/
    ports/
  infrastructure/
    chrome/
    indexeddb/
    archive/
    clipboard/
  shared/
tests/
public/
```

## Cross-Context Contracts

Chrome messages are versioned discriminated unions. Each request has a type, payload, and correlation ID; each response is either a typed result or a serializable application error. Blob-heavy flows should use IndexedDB references instead of repeatedly sending whole blobs between contexts.

Initial message families are:

- `capture/status` for recent capture feedback.
- `library/changed` for invalidation hints.
- `storage/stats` for options-page queries if direct repository access is not appropriate.

The database remains the source of truth. Messages notify; they do not substitute for durable state.

## Error Model

Expected failures use stable codes such as `FETCH_FAILED`, `UNSUPPORTED_MEDIA`, `ITEM_TOO_LARGE`, `DUPLICATE`, `STORAGE_FAILED`, `CLIPBOARD_UNSUPPORTED`, and `ARCHIVE_INVALID`. UI surfaces translate these into concise guidance while retaining safe diagnostic detail.

## Key Decisions

- Local-only storage; no GoPaste server or account.
- Content SHA-256 is the duplicate identity.
- Broad host permission is expected for arbitrary image capture and must be explained clearly.
- Clipboard and drag are capability-based; URL fallback is part of the product behavior.
- Archive parsing is untrusted-input handling with explicit limits.
- Dashboard analytics are derived from local usage counters/events and stored media metadata. No telemetry leaves the device.
- Dashboard preferences use extension-local storage; media and durable library metadata remain in IndexedDB.
- Exact duplicates use SHA-256. Near-duplicate analysis is bounded, advisory, and user-confirmed.
