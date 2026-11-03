<img width="1470" height="836" alt="image" src="https://github.com/user-attachments/assets/58002983-d53f-4d9f-9b30-49362d115ff0" />

# GoPaste

GoPaste is a Chrome extension with a local image and GIF library and an optional, clearly labeled CodeChum coding assistant. The media library stays on your device. CodeChum requires a member sign-in and can send a selected challenge to Gemini after you consent and start a solver run.

## Features

- Save an image from Chrome's right-click context menu.
- Store the fetched binary locally in IndexedDB.
- Search, filter, categorize, rename, copy, drag, and delete library items.
- Export and restore a versioned ZIP archive.
- Open a full local dashboard for overview, advanced filtering, grid/list browsing, favorites, bulk edits, categories, insights, maintenance, backup, and preferences.
- Export the full library or selected categories and restore versioned ZIP archives.
- Review device-local storage and usage summaries without telemetry.
- Switch to CodeChum inside the popup to review visible test cases, configure your Gemini key, and prepare code for a manual CodeChum check. The same controls are available in an optional full-page view.

## Status

The combined extension builds and passes automated checks. CodeChum sign-in and solver flows still need a manual Chrome check before submitting an update. Its contracts and verification status are recorded in `docs/CODECHUM_INTEGRATION.md` and `tasks/`. Chrome Web Store approval is not guaranteed for two distinct features in one extension.

## Target Stack

- Chrome desktop, Manifest V3
- TypeScript, React, and Vite
- IndexedDB for local media storage
- JSZip for backup and restore
- Vitest, Testing Library, and Playwright for verification

## Repository Guide

- `PLAN.md` — approved delivery plan and scope.
- `AGENT.md` — agent workflow and engineering constraints.
- `docs/` — architecture, data, archive, security/privacy, compatibility, testing, and user documentation.
- `tasks/` — ordered implementation tasks and acceptance criteria.

## Development

Prerequisite: Node.js 20.19 or newer.

```sh
npm install
npm run dev
```

Use `npm run check` for formatting, lint, type checking, unit/component tests, and a production build. Individual commands are `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Extension integration tests use `npm run test:e2e` once the Task 06 suite is present.

The production extension is emitted to `dist/`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that directory. The toolbar popup switches between the GoPaste library and CodeChum controls; Dashboard and the full-page assistant open separately. Run `npm run package` to rebuild and create `gopaste-extension.zip` for distribution. The original `CODECHUM-HACK/` folder is a local reference only: it is ignored by Git and never packaged. The optional assistant is implemented in `src/codechum/`.
