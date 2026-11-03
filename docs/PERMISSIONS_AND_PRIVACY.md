# Permissions and Privacy

## Privacy Posture

GoPaste stores the image/GIF library locally in the Chrome profile through IndexedDB. It does not send telemetry or upload library media to a GoPaste service. The separately labeled CodeChum assistant requires a Supabase member account and can send challenge content to Google's Gemini API after an affirmative user choice. See `docs/CODECHUM_INTEGRATION.md` for the integration boundary.

Dashboard categories, usage counters, preferences, storage analysis, and duplicate comparisons are also stored or calculated locally. ZIP export is an explicit download to a user-chosen file; it is not cloud backup or synchronization.

Source and page URLs are retained as library metadata so URL-copy fallback and provenance remain available. These URLs can contain sensitive information; the extension should not log or transmit them unnecessarily.

CodeChum stores its login session, user Gemini API key, settings, optional implementation notes, selected cases, and paused solver checkpoints in `chrome.storage.local`, separate from the media database. The member's email and password are sent to Supabase to authenticate; the password is not stored by the extension. The access record is checked with Supabase when CodeChum is used. After the member consents to AI processing and starts the solver, the extension sends the current challenge description, language, selected visible tests and expected outputs, minimum requirements, relevant candidate code, optional implementation notes, and subsequent manual-check feedback to Gemini. It does not include GoPaste media. Revoking consent blocks new solver requests; sign-out clears the local CodeChum session, credentials, and notes. Changing accounts also removes notes. Blocked output is not inserted or cached.

Image capture first makes a credential-free request. If the selected server explicitly returns HTTP 401 or 403, GoPaste retries that same user-selected URL with the browser session's credentials. This allows saving images the user can view only while signed in; bytes remain local to the extension.

## Expected Manifest Permissions

- `contextMenus` — add the “Save to GoPaste” action for image targets.
- `unlimitedStorage` — permit a practical local binary library beyond ordinary extension quotas; actual space remains constrained by the device/profile.
- `downloads` — save ZIP exports through Chrome's download flow.
- `pageCapture` — recover the exact bytes of a selected image from Chrome's local page snapshot when the server blocks extension fetches and the page blocks canvas export.
- `scripting` — after a direct fetch fails, read a user-selected page-generated image (such as a `blob:` preview) from the exact originating tab. Injection happens only in response to the GoPaste context-menu action.
- `host_permissions: ["<all_urls>"]` — supports fetching selected images from arbitrary websites and the universal GoPaste attachment bridge; this broad scope requires clear Store justification.
- `storage` — CodeChum member session, settings, selected tests, API key, consent, and resumable solver state in local extension storage.
- `scripting` also supports user-invoked CodeChum page reading and editor input. The generic arbitrary-script runner is excluded from the combined Store build pending a separate policy-compatible design.

The dashboard itself does not require Chrome `storage` because its preferences remain in IndexedDB. The combined extension adds CodeChum commands alongside `open-dashboard`; commands do not grant access to user data.
Chrome's Tabs API permits opening/querying tabs without a separate `tabs` grant; the existing `<all_urls>` host access already permits reading matching tab URLs and `scripting` injection. Do not add redundant `tabs` or `activeTab` permissions unless integrated testing proves them necessary.

Clipboard writes are initiated by explicit user interaction in an extension page. Do not request broader clipboard permissions unless tests demonstrate they are required for the supported flow.

## Data Controls

Users can delete individual or selected entries, review cleanup candidates, export full or selective backups, and remove extension data through Chrome. Duplicate tools never delete automatically, and destructive batch actions require confirmation.

## Security Requirements

- Render titles, tags, URLs, and archive metadata as text.
- Treat remote bytes and ZIP content as untrusted.
- Validate media signatures and archive limits.
- Bundle all JavaScript and dependencies locally to comply with Manifest V3 CSP and Chrome Web Store policy.
- Do not execute remotely generated JavaScript as extension logic. CodeChum may put generated candidate text in CodeChum's editor; the user invokes the site's own Check code action.
