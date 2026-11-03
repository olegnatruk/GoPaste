# Task 13 — CodeChum extension page and GoPaste entry

Status: **implemented; automated checks pass; manual Chrome verification pending**

Dependencies: task 11 contracts.

Owned files: new `src/codechum/ui/**`, root `codechum.html`, `src/popup/PopupShell.tsx` and focused UI tests. Do not edit the worker, manifest, build config, or privacy page.

Acceptance criteria:

- GoPaste popup visibly labels a CodeChum entry, displays CodeChum controls in a switchable popup view, and retains image library behavior. A full-page view remains optional.
- Show Chrome's actual shortcut assignments and a route to shortcut configuration; do not imply unassigned speed commands are bound.
- The entry opens a bundled CodeChum page with sign-in, solver status, controls, and clear text about Gemini processing.
- The page passes its source CodeChum tab ID with solver messages and gives an actionable state when no problem tab is available.
- All executable UI code and fonts are local to the extension; no remote stylesheet/script dependency.
- UI preserves usable keyboard, focus, and error states.
- No `CODECHUM-HACK/web/` or `admin/` content is mounted.
- The UI does not advertise unsupported generic console-script execution in the combined Store build.

Verification: focused component tests, `npm run typecheck`, `npm run build`; report manual-only gaps.
