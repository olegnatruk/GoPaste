# Task 03 — Popup Library and Categorization

Status: Complete (2026-08-21)  
Dependencies: Tasks 01 and 02  
Primary ownership: `src/popup/`, popup component tests

## Scope

- Build responsive popup states and an incremental thumbnail grid.
- Add title/tag search, category filtering, metadata editing, and confirmed deletion.
- Add accessible item controls, keyboard behavior, visible feedback, and object-URL cleanup.

## Acceptance Criteria

- Items are newest-first and searchable/filterable case-insensitively.
- Editing normalizes/deduplicates tags; deletion requires confirmation.
- Loading, empty, error, and capture-status states are clear.
- Generated URLs/listeners are cleaned up and component tests cover critical interactions.

## Verification

Run popup tests, accessibility-oriented assertions, typecheck/build, and manual narrow-popup checks.

## Completion Evidence

- Five popup component tests cover loading/empty/error/capture states, search and category queries,
  normalized metadata edits, confirmed deletion, incremental paging, action composition, and cleanup.
- Scoped Prettier and ESLint checks pass for `src/popup/` and its component test. The global
  typecheck, all 41 currently integrated automated tests, and the production build also pass.
- The project-wide `npm run check` was rerun but stopped on concurrent Task 04/05 formatting and an
  unused archive import outside this task's ownership; Task 03 files were not implicated.
- The popup releases every generated object URL when a card disappears or the surface unmounts and
  removes its `library/changed` listener when unmounted.
- A local browser check at a 320 × 600 viewport verified the empty popup layout, stacked controls,
  readable status panel, and absence of horizontal overflow. This was a responsive layout check, not
  a loaded-extension compatibility test.
