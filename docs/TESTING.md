# Testing Strategy

## Automated Layers

- **Unit:** validation, MIME sniffing, tag normalization, hashing integration, duplicate policy, filtering, archive metadata validation, path safety, and error mapping.
- **Repository integration:** IndexedDB create/read/update/delete, unique hash, paging, transactions, totals, bulk-import partial failures, dashboard v2 migration, batch metadata, categories, preferences, local usage, and statistics.
- **Component:** popup and dashboard loading/empty/error states, grid/list views, density, search/filter, selection, bulk actions, edit/delete confirmation, copy feedback, options progress, and import summaries.
- **Extension integration/E2E:** unpacked extension startup, surface loading, service-worker messaging, representative capture where Chromium automation permits it, and export/import round trip.

## Required Commands

Task 01 will define and document scripts for formatting/linting, type checking, unit/component tests, E2E tests, production build, and packaging. The final coordinator runs the complete suite from a clean dependency install.

## Fixtures

Maintain tiny valid GIF/PNG/JPEG/WebP fixtures; misleading extension/header fixtures; corrupt files; duplicate pairs; safe and unsafe ZIPs; and generated library sizes for responsiveness checks. Fixtures must be license-safe and small unless generated during tests.

## Manual Checks

- Load the unpacked production build without manifest/runtime errors.
- Capture from representative HTTPS pages, including Google Images where feasible.
- Confirm persistence after Chrome restart/service-worker suspension.
- Verify popup keyboard operation and visible feedback.
- Record clipboard and drag outcomes in `COMPATIBILITY.md`.
- Round-trip a library through ZIP and inspect partial-failure reporting.
- Observe popup/dashboard responsiveness with small, medium, and large generated libraries.

## Completion Evidence

Every task reports commands run and their results. Manual-only claims identify the exact environment. A mocked Chrome API test cannot be reported as real browser compatibility.
