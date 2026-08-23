# Task 01 — Extension Foundation and Shared Contracts

Status: Complete (2026-08-21)  
Dependencies: Task 00  
Primary ownership: root configuration, `public/`, shared/core contracts, entry-point shells

## Scope

- Scaffold TypeScript, React, Vite, Manifest V3, lint/format/type/test/build scripts, and locally bundled dependencies.
- Add popup, options, and background entry points that load without runtime errors.
- Define domain types, application errors, limits, cross-context message contracts, and adapter interfaces.
- Add accessible baseline styling and test fixtures/helpers.

## Acceptance Criteria

- Production build creates a loadable unpacked extension with popup, options page, and service worker.
- Manifest permissions match `docs/PERMISSIONS_AND_PRIVACY.md` and contain no remote code.
- `npm run typecheck`, `npm test`, and `npm run build` pass.
- Shared contracts do not depend on React or concrete browser/storage adapters.

## Verification

Run dependency install, typecheck, tests, production build, and inspect the emitted manifest/assets for remote scripts.

## Completion Evidence

- `npm install` completed with no reported vulnerabilities.
- `npm run check` passed formatting, lint, type checking, 3 foundation contract tests, and the production build.
- `npm run package` produced `gopaste-extension.zip`; `unzip -t` reported no archive errors.
- The emitted manifest references present popup, options, and service-worker files and declares only the documented permissions.
- Emitted popup/options script and stylesheet references are extension-local. Chrome stable on macOS accepted the unpacked `dist/` directory during a headless startup smoke check; interactive surface checks remain part of Task 06.
