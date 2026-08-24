# GoPaste

GoPaste is a local-first Chrome extension for saving images and GIFs from the web, organizing them with titles and categories, and quickly sharing or backing up the collection.

## Features

- Save an image from Chrome's right-click context menu.
- Store the fetched binary locally in IndexedDB.
- Search, filter, rename, copy, drag, and delete library items.
- Export and restore a versioned ZIP archive.
- Open a full local dashboard for overview, advanced filtering, grid/list browsing, favorites, bulk edits, categories, insights, maintenance, backup, and preferences.
- Export the full library or a selected category and restore versioned ZIP archives.
- Review device-local storage and usage summaries without telemetry or cloud services.

## Status

The base extension and local dashboard plans are approved and implemented. Task status and verification evidence are recorded in `tasks/`.

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

The production extension is emitted to `dist/`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that directory. The toolbar popup's **Dashboard** button, the extension details page's **Extension options** link, or the configurable Chrome shortcut opens the dashboard. Run `npm run package` to rebuild and create `gopaste-extension.zip` for distribution.
