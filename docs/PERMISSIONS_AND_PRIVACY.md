# Permissions and Privacy

## Privacy Posture

GoPaste stores the user's library locally in the Chrome profile through IndexedDB. It does not create an account, send telemetry, upload media to a GoPaste service, or execute code from remote servers.

Dashboard categories, usage counters, preferences, tag suggestions, storage analysis, and duplicate comparisons are also stored or calculated locally. ZIP export is an explicit download to a user-chosen file; it is not cloud backup or synchronization.

Source and page URLs are retained as library metadata so URL-copy fallback and provenance remain available. These URLs can contain sensitive information; the extension should not log or transmit them unnecessarily.

Image capture first makes a credential-free request. If the selected server explicitly returns HTTP 401 or 403, GoPaste retries that same user-selected URL with the browser session's credentials. This allows saving images the user can view only while signed in; bytes remain local to the extension.

## Expected Manifest Permissions

- `contextMenus` — add the “Save to GoPaste” action for image targets.
- `unlimitedStorage` — permit a practical local binary library beyond ordinary extension quotas; actual space remains constrained by the device/profile.
- `downloads` — save ZIP exports through Chrome's download flow.
- `pageCapture` — recover the exact bytes of a selected image from Chrome's local page snapshot when the server blocks extension fetches and the page blocks canvas export.
- `scripting` — after a direct fetch fails, read a user-selected page-generated image (such as a `blob:` preview) from the exact originating tab. Injection happens only in response to the GoPaste context-menu action.
- `host_permissions: ["<all_urls>"]` — likely required for the service worker to fetch arbitrary selected image URLs. The feasibility task must verify this and remove or narrow it if possible.

The current dashboard does not require the Chrome `storage` permission because its preferences are kept in IndexedDB. The `commands` manifest entry exposes an open-dashboard shortcut and does not grant access to user data.

Clipboard writes are initiated by explicit user interaction in an extension page. Do not request broader clipboard permissions unless tests demonstrate they are required for the supported flow.

## Data Controls

Users can delete individual or selected entries, review cleanup candidates, export full or selective backups, and remove extension data through Chrome. Duplicate tools never delete automatically, and destructive batch actions require confirmation.

## Security Requirements

- Render titles, tags, URLs, and archive metadata as text.
- Treat remote bytes and ZIP content as untrusted.
- Validate media signatures and archive limits.
- Bundle all JavaScript and dependencies locally to comply with Manifest V3 CSP and Chrome Web Store policy.
