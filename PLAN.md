# GoPaste Implementation Plan

## Local Dashboard Expansion — Approved

Status: **Approved on 2026-08-23 — implementation authorized**

This expansion adds a full-page management dashboard while preserving the popup as GoPaste's fast capture-and-share surface. The dashboard is entirely local: media, metadata, usage history, analytics, search indexes, preferences, and duplicate analysis remain on the user's device in extension storage.

### Non-negotiable boundary

- No accounts, cloud storage, cloud synchronization, remote backup, external analytics, or remote AI.
- Import and export use files explicitly chosen by the user, including complete or selective ZIP archives.
- Automatic tag suggestions use local filenames, source/page context already stored by GoPaste, and deterministic local heuristics.
- Duplicate and near-duplicate tools suggest candidates for review; they never delete automatically.

### Dashboard information architecture

1. **Overview** — pinned GIFs, recently saved, recently used, storage usage, top reactions, and actionable library-health summaries.
2. **Library** — three-density grid and detailed list views, advanced filters, sorting, favorites, bulk selection, batch editing, and an item details drawer.
3. **Categories & Tags** — create, rename, recolor, reorder, merge, and organize categories and nested tags.
4. **Insights** — local copy/drag counts, most-used GIFs, category activity, and storage breakdowns based only on actual local history.
5. **Maintenance** — exact and near-duplicate review, untagged and oversized-item queues, plus safe cleanup actions.
6. **Backup & Settings** — full and selective ZIP import/export, theme and accent controls, keyboard shortcuts, and default click/copy formats.

### Interaction and layout direction

- Inherit the existing chartreuse/green GoPaste identity, typography, controls, light/dark themes, and compact practical voice.
- Use a persistent desktop sidebar, a global search/filter command row, and a large content workspace.
- Keep frequent work in place: selection opens a contextual bulk-action bar; individual editing opens a non-blocking details drawer.
- Make library state visible rather than decorative: active filters, selection count, storage impact, scan progress, and destructive scope must be explicit.
- Support keyboard navigation, visible focus, reduced motion, non-color-only states, narrow dashboard windows, and long titles/tags.

### Proposed implementation sequence

#### Dashboard Phase A — Contracts and safe migration

- Define versioned metadata for favorites, categories, nested tags, usage events/counters, preview thumbnails, and preferences.
- Add restart-safe IndexedDB migrations and repositories without rewriting existing media blobs.
- Define bounded local statistics and duplicate-scan services.

Exit criteria: existing libraries migrate without data loss, new metadata has tested defaults, and all dashboard data remains local.

#### Dashboard Phase B — Shell and core library management

- Add the full-page dashboard entry point and navigation.
- Build Overview and Library surfaces with three-row-friendly grid behavior, density options, detailed list view, sorting, favorites, recent feeds, and item editing.
- Add multi-selection plus batch delete, category move, and tag editing with confirmation and failure summaries.

Exit criteria: users can browse and manage small and large local libraries without losing the popup's current quick-use behavior.

#### Dashboard Phase C — Organization and discovery

- Build the category/tag manager with rename, recolor, reorder, merge, and nested-tag operations.
- Add combined filters for text, tag, category, date added, file size, source website, favorite state, and recent activity.
- Add local metadata-based tag suggestions that require user acceptance.

Exit criteria: combined filters are predictable, bulk taxonomy changes are transactional, and no suggestion changes metadata silently.

#### Dashboard Phase D — Insights and maintenance

- Record and display local copy/drag usage counts and category trends.
- Add live storage totals and category/type breakdowns.
- Add exact-hash duplicate detection and bounded near-duplicate candidate scans with side-by-side review.
- Add maintenance queues for untagged, oversized, and unused media.

Exit criteria: figures reconcile with local records, scans stay responsive, and cleanup always requires explicit user choice.

#### Dashboard Phase E — Backup, personalization, and finishing

- Add full and selective ZIP import/export from the dashboard.
- Add light/dark modes, custom accent choices, configurable shortcuts, and default click/copy behavior.
- Add custom title and static preview-frame editing without altering the original GIF.
- Finish responsive behavior, accessibility, documentation, migration tests, large-library tests, and the unpacked production build.

Exit criteria: requested dashboard features are present, documented, locally testable, and packaged without cloud permissions or network services.

### States and scale to design for

- Empty/new library, populated library, no search results, and cleared filters.
- Hundreds to 5,000 items, long titles, many tags, missing source data, and large blobs.
- First-run migration, partial batch failure, interrupted import, scan progress/cancellation, and storage pressure.
- No usage history yet, no duplicates found, multiple near-duplicate candidates, and destructive confirmations.

### Approval and delegation gate

The user approved this expansion on 2026-08-23. The coordinator must update app documentation, split these phases into dependency-aware task files, and deploy sub-agents on non-overlapping implementation areas before integrating the dashboard.

## Existing Extension Baseline

Status: **Approved on 2026-08-21 — implementation authorized**  
Source: `/Users/kurtangelo/Downloads/GoPaste-PRD.md` (PRD v1.0)  
Target: Google Chrome extension using Manifest V3

## Approval Gate

The user approved this plan on 2026-08-21. Documentation and task decomposition must still precede feature implementation.

After approval, the next actions will be:

1. Create the app documentation described below.
2. Convert the approved phases into small, dependency-aware task files with acceptance criteria.
3. Assign independent tasks to sub-agents, while one coordinating agent owns integration and verification.
4. Begin implementation only after the documentation and task breakdown exist.

## Product Scope

GoPaste will let a user:

- Save an image or GIF from a page through Chrome's image context menu.
- Keep the fetched binary and its metadata locally in IndexedDB.
- Browse, search, filter, tag, rename, copy, drag, and delete saved items.
- Export the complete library to a ZIP archive.
- Import a compatible ZIP archive with validation, duplicate handling, progress, and partial-failure reporting.
- View storage usage and data-management controls on an options page.

### Initial Release Boundaries

- Chrome desktop is the only supported browser/platform for v1.
- The library is local-only; accounts, cloud sync, collaboration, and remote backup are out of scope.
- Captured media is limited to image context-menu targets; video-to-GIF conversion and screen recording are out of scope.
- The extension will not upload user media to a GoPaste service.
- All dependencies must be bundled locally; Manifest V3 does not permit remotely hosted executable code.

## Proposed Technical Direction

The default implementation will use:

- TypeScript for extension and UI code.
- React for the popup and options interfaces.
- Vite with a Chrome-extension-compatible build configuration.
- Manifest V3 service worker for installation, context-menu registration, and capture orchestration.
- IndexedDB behind a typed repository layer for blobs and metadata.
- JSZip for archive import/export.
- Vitest and Testing Library for unit/component tests.
- Playwright with a loaded unpacked extension for critical Chromium integration flows where practical.

This stack is proposed, not yet implemented. If repository constraints discovered after approval conflict with it, the change will be documented before proceeding.

## Architecture

### Extension surfaces

- **Background service worker:** creates the context menu, receives clicks, fetches image bytes, validates responses, detects duplicates, and persists captures.
- **Popup:** provides search, category filtering, a virtualized or incremental thumbnail grid, and item actions.
- **Options page:** provides storage statistics plus ZIP import/export and progress/error reporting.
- **Shared application layer:** owns domain types, validation, duplicate policy, search/filter logic, and use cases.
- **Infrastructure layer:** wraps IndexedDB, Chrome APIs, clipboard behavior, object URLs, downloads, and ZIP processing.

### Data model

Each media record should include at least:

- Stable generated ID.
- Binary Blob, detected MIME type, byte size, and original file extension when known.
- Content hash for duplicate detection.
- Title, normalized tags/categories, and optional user notes if later approved.
- Original source URL and page URL.
- Creation and update timestamps.
- Optional width and height when they can be determined safely.

Indexes should support creation date, normalized title, tags/categories, and content hash. Schema upgrades must be versioned and transactional.

### Capture flow

1. Register one context-menu item for image targets during extension installation/startup.
2. On selection, validate the source URL and fetch the bytes promptly.
3. Confirm the response is a supported image type and enforce a documented maximum item size.
4. Compute a content hash and apply the duplicate policy.
5. Store the blob and metadata atomically.
6. Surface success or a useful error without depending on the popup being open.

The manifest will request only permissions that the implemented behavior needs. Broad host access may be required to fetch arbitrary image URLs; this must be verified and clearly justified in the user-facing permission documentation.

### Sharing flow

- Prefer copying an actual image through the Async Clipboard API when Chrome and the image MIME type support it.
- Provide a source-URL clipboard fallback when binary image copying is unavailable.
- Populate drag data with safe formats supported by Chrome, such as `text/uri-list` and `text/plain`.
- Revoke generated object URLs after use and avoid exposing inaccessible extension-only URLs as if they were portable files.

Clipboard and cross-application drag behavior varies by OS, Chrome version, MIME type, and destination application. A short compatibility spike is required before finalizing the interaction promises. Unsupported raw-GIF or native-file dragging must degrade honestly rather than appearing to work.

### ZIP contract

Exports will use a versioned, deterministic structure:

```text
gopaste-export.zip
├── metadata.json
└── images/
    ├── <stable-name>.gif
    └── <stable-name>.<ext>
```

`metadata.json` will include a schema version and map each file to its ID-independent metadata. Import will validate paths, archive size, uncompressed size, metadata shape, MIME/file agreement, and hashes where available. Unsafe paths, unsupported entries, corrupt files, and duplicate content will be reported individually. Valid entries may still import when other entries fail.

## Delivery Phases

### Phase 0 — Documentation, decomposition, and feasibility checks

- Create `README.md`, architecture documentation, data/archive specifications, permissions/privacy notes, testing strategy, and contributor setup instructions.
- Split the remaining phases into task files with dependencies, acceptance criteria, ownership boundaries, and verification commands.
- Run focused prototypes for arbitrary-URL image fetching, GIF clipboard support, popup drag behavior, and loaded-extension testing.
- Record compatibility results and adjust acceptance criteria before full feature work.

Exit criteria: documentation and tasks are reviewable; risky browser behaviors have a defined supported path and fallback.

### Phase 1 — Extension foundation

- Scaffold the TypeScript/React/Vite project and reproducible build.
- Add the Manifest V3 manifest, popup, options page, service worker, icons/placeholders, and shared modules.
- Establish linting, type checking, tests, packaging, and development instructions.
- Add centralized error types and lightweight local diagnostics without collecting telemetry.

Exit criteria: the unpacked extension loads in Chrome, all declared surfaces open, and automated baseline checks pass.

### Phase 2 — Storage and capture

- Implement the versioned IndexedDB schema and typed repository.
- Register and handle the image context menu.
- Fetch, validate, hash, and store media with useful failure handling.
- Add duplicate behavior and tests for transactions, schema upgrades, and malformed responses.

Exit criteria: supported images can be captured from representative sites and remain available after browser restart without duplicate corruption.

### Phase 3 — Library and categorization

- Build the popup layout, thumbnail lifecycle, loading/empty/error states, and keyboard-accessible controls.
- Add search, category/tag filtering, editing, deletion confirmation, and efficient incremental rendering.
- Ensure object URLs are revoked and large libraries do not block the UI.

Exit criteria: users can reliably find and manage items; accessibility and representative large-library checks pass.

### Phase 4 — Copy and drag sharing

- Implement the verified binary clipboard path and URL fallback.
- Implement standards-compatible drag payloads and clear feedback.
- Add capability detection and destination-oriented compatibility documentation.

Exit criteria: behavior matches the compatibility matrix for the supported Chrome/OS targets and degrades clearly elsewhere.

### Phase 5 — Import, export, and storage management

- Implement the versioned export contract and deterministic metadata generation.
- Implement defensive import validation, duplicate handling, bounded batches, progress, and partial-failure summaries.
- Add storage statistics and data-management controls to the options page.
- Test round trips, corrupt archives, missing metadata, unsafe paths, duplicates, cancellation/interruptions where supportable, and larger libraries.

Exit criteria: an exported collection can be restored with blobs and metadata intact, and invalid archives cannot corrupt existing data.

### Phase 6 — Hardening and release preparation

- Audit permissions, CSP, dependency packaging, object-URL cleanup, archive safety, and error messages.
- Run unit, component, integration, extension E2E, and manual compatibility checks.
- Validate performance with documented small/medium/large fixture libraries.
- Produce installation, usage, privacy, troubleshooting, backup, and release/package documentation.

Exit criteria: all acceptance criteria pass, known limitations are documented, and a distributable Chrome extension package is produced.

## Documentation to Create After Approval

- `README.md` — purpose, features, install, development, build, test, and packaging.
- `docs/ARCHITECTURE.md` — runtime surfaces, boundaries, message flow, and major decisions.
- `docs/DATA_MODEL.md` — IndexedDB schema, indexes, migrations, and duplicate semantics.
- `docs/ARCHIVE_FORMAT.md` — versioned ZIP and metadata contract.
- `docs/PERMISSIONS_AND_PRIVACY.md` — permission rationale, local-data behavior, and privacy posture.
- `docs/COMPATIBILITY.md` — clipboard/drag test matrix and fallbacks.
- `docs/TESTING.md` — automated and manual validation strategy.
- `docs/USER_GUIDE.md` — capture, organize, share, import/export, and troubleshooting.
- `tasks/` — one task file per implementation unit, created only after plan approval.

## Quality and Acceptance Standards

- The extension builds reproducibly and loads without manifest/runtime errors.
- Type checking, linting, and automated tests pass before integration.
- Core flows are keyboard accessible and have visible focus, usable labels, and non-color-only feedback.
- Blob/object URLs are cleaned up, and large operations use bounded batches or yielding to keep interfaces responsive.
- User-visible destructive actions require confirmation or a recoverable interaction where feasible.
- Imports never trust archive paths or metadata and do not partially overwrite an existing record.
- No remote executable code, hidden telemetry, or unnecessary permissions are introduced.
- Documentation is updated in the same task as any contract or user-visible behavior change.

## Principal Risks and Planned Mitigations

- **Cross-origin image fetching:** verify service-worker fetch behavior and host permission needs early; document permission rationale and actionable failures.
- **Clipboard MIME limitations:** capability-test actual image types, with URL fallback and a documented compatibility matrix.
- **Drag-and-drop portability:** prototype real destinations early; promise only payloads Chrome can reliably provide.
- **Service-worker suspension:** keep operations restart-safe and persist durable state rather than relying on long-lived background memory.
- **Large blobs/archives:** batch work, yield between chunks, report progress, and enforce configurable/documented safety limits.
- **ZIP bombs/path traversal/corruption:** validate entry paths and total sizes before extraction, parse defensively, and isolate failures.
- **IndexedDB migration or partial writes:** use versioned schemas and transactions, with migration and rollback-oriented tests.

## Decisions Requiring Approval

Approval includes the proposed TypeScript + React + Vite direction and the v1 scope boundaries above. Phase 0 finalized these initial safety limits and defaults:

- Maximum item size: 25 MiB.
- Maximum import: 250 MiB compressed, 500 MiB declared/extracted content, and 5,000 media entries.
- Duplicate behavior: skip identical content hashes and report them; do not merge metadata automatically.
- Supported v1 media: GIF, PNG, JPEG, and WebP.
- Chrome stable on desktop is the product target. Compatibility claims remain limited to environments actually recorded in `docs/COMPATIBILITY.md`.

## Change Control

If implementation reveals that a PRD behavior is infeasible or materially different across supported environments, work will pause at the affected boundary. The evidence, fallback, and impact on acceptance criteria will be documented for user approval before broadening scope or silently changing the product promise.
