# Task 10 — Dashboard Integration, Backup, Preferences, and Release

Status: Complete (automated and headless-Chrome verification; unpacked interactive check remains user-facing)
Dependencies: Tasks 07, 08, and 09
Primary ownership: build/manifest wiring, shared entry links, documentation, integrated verification

## Scope

- Wire the dashboard entry point, repositories, archive actions, preferences, taxonomy, insights, and maintenance views.
- Add selective ZIP export where the archive contract supports it.
- Run migration, component, unit, accessibility, responsive, and production-build checks.
- Update installation and user documentation and produce the load-unpacked folder.

## Acceptance Criteria

- The dashboard opens from GoPaste, uses only local device storage, and includes all approved sections.
- No cloud permissions, network SDKs, external analytics, or remote AI are introduced.
- The production build is loadable unpacked and documentation matches verified behavior.

## Verification

Run `npm run check` plus focused manual Chrome checks that do not require Playwright.

## Completion Evidence

- The dashboard is wired as the extension options page and opens from the popup or configurable Chrome command.
- Taxonomy, local insights, bounded maintenance, full/selective ZIP actions, themes, accent, shortcut control, and default actions are integrated without cloud dependencies or new network SDKs.
- `npm run check` passes: 17 test files / 78 tests plus a production build.
- Desktop and narrow responsive renders were captured with headless Chrome without Playwright and inspected for valid content.
- `dist/` is the load-unpacked production folder. A live installed-extension interaction remains a user-facing Chrome check rather than an automated compatibility claim.
