# Task 04 — Clipboard and Drag Sharing

Status: Implemented — automated verification passes; manual destination compatibility pending  
Dependencies: Tasks 01 and 02  
Primary ownership: `src/infrastructure/clipboard/`, sharing UI hooks/components, sharing tests, `docs/COMPATIBILITY.md`

## Scope

- Implement capability-detected binary clipboard writes from stored blobs.
- Implement original-URL copy fallback with accurate user feedback.
- Implement standards-compatible `text/uri-list` and `text/plain` drag payloads.
- Perform and record the macOS/Chrome compatibility spike, including animated GIF fidelity and representative web/native destinations.

## Acceptance Criteria

- Copy is user-gesture initiated, reports whether binary or URL was copied, and handles permission/type failures.
- Drag never presents extension-only blob URLs as portable external files.
- Tests cover supported, rejected, missing-source, and fallback paths.
- Compatibility documentation distinguishes observed results from untested environments.

## Verification

Run focused tests and build; manually record Chrome/OS/destination/version results.

## Implementation Evidence

- `BrowserClipboardWriter` capability-detects `ClipboardItem`, the image MIME type, and Async Clipboard methods; it falls back to an original HTTP(S) source URL and surfaces stable `CLIPBOARD_UNSUPPORTED` failures.
- Popup sharing actions are initiated by Copy click or drag start and announce binary success, URL fallback, and failure distinctly.
- Drag data contains only `text/uri-list` and `text/plain` HTTP(S) values; extension/blob sources are rejected.
- Focused Task 04 suite: 15 tests passed across clipboard adapter, drag payload, and sharing component coverage.
- Type checking and production build passed after integration.
- macOS 26.5.2 and installed Chrome 151.0.7922.172 were recorded on 2026-08-21. Real clipboard contents, animated GIF fidelity, and pointer-driven web/native destination behavior remain pending because no interactive browser/native-app session was available; `docs/COMPATIBILITY.md` labels those cells accordingly.
