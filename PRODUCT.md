# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

GoPaste serves individual Chrome users who collect GIFs and reaction images for repeated use in messaging and productivity applications. They need to capture media quickly in the browser, retrieve the right reaction without browsing folders, and maintain a personal library without surrendering it to a cloud service.

## Product Purpose

GoPaste is a local-first Chrome extension for capturing, organizing, finding, sharing, and backing up a personal GIF and image library. Success means users can save media in one action, retrieve it in seconds, understand and maintain their collection, and move it between devices through explicit local archive files.

## Positioning

GoPaste combines a fast context-menu capture and popup sharing workflow with a full local library dashboard. Media, metadata, usage history, analytics, search indexes, preferences, and backups remain under the user's control on their device; the product has no account or cloud dependency.

## Operating Context

- Users save images from web pages through Chrome's context menu.
- The toolbar popup is the quick-access surface for searching, copying, dragging, editing, and deleting media.
- A full-page local dashboard is the management surface for bulk organization, discovery, analytics, maintenance, backup, and preferences.
- Users share saved media with browser-based and desktop messaging or productivity applications where Chrome's clipboard and drag capabilities permit it.
- Users move or share collections through explicit ZIP exports and imports.

## Capabilities and Constraints

- Chrome desktop extension using Manifest V3.
- IndexedDB is the source of truth for media blobs and library metadata.
- Supported media in the current product contract: GIF, PNG, JPEG, and WebP, with a 25 MiB per-item limit.
- Library management includes grid/list views, adjustable grid density, bulk selection, batch deletion and tagging, category/tag management, favorites/pinning, title editing, and custom preview-thumbnail selection.
- Discovery includes multi-filter search by tag, category, date, size, and source; local metadata-based tag suggestions; and duplicate or near-duplicate review.
- Local analytics include copy/drag counts, frequently used media and categories, recently used/saved feeds, and IndexedDB storage breakdowns.
- Data mobility includes full ZIP import/export and selective category/tag exports.
- Preferences include light/dark themes, accent selection, configurable keyboard shortcuts, and default click/copy formats.
- All processing and storage remain local to the user's device. There is no account, cloud storage integration, cloud synchronization, external analytics, or remote AI service.
- Auto-tagging may use only local metadata/heuristics unless a future explicitly approved local model is added.
- Near-duplicate detection must run locally, remain bounded, and present candidates for user review rather than deleting automatically.
- Destructive bulk actions require clear scope, confirmation, and failure-safe behavior.
- The requested dashboard capability set is delivered in dependency-ordered phases, with every phase remaining local-only.

## Brand Commitments

- Product name: GoPaste.
- The current interface uses a compact, practical, local-library voice and a green/chartreuse visual identity.
- The popup remains the fast-use surface; the dashboard must not make quick capture or sharing slower.

## Evidence on Hand

- Product requirements: `/Users/kurtangelo/Downloads/GoPaste-PRD.md`.
- Approved implementation plan: `PLAN.md`.
- Existing popup, options, capture, local storage, sharing, and ZIP import/export implementation under `src/`.
- Existing local test fixtures and automated checks under `tests/`.
- No testimonials, usage benchmarks, external customer data, or cloud-service assets are available and none should be fabricated.

## Product Principles

- Local by design: user media and behavior never leave the device implicitly.
- Fast at the moment of use: capture and retrieval should take seconds, not become management work.
- Powerful when organizing: bulk tools and filters should scale without obscuring simple actions.
- Safe maintenance: analysis suggests; users confirm destructive cleanup.
- Portable by explicit choice: ZIP archives provide understandable, user-controlled mobility.

## Accessibility & Inclusion

Core flows must support keyboard operation, visible focus, semantic labels, non-color-only feedback, reduced motion, and layouts that remain usable with longer text and narrow windows.
