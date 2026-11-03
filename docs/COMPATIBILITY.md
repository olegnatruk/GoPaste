# Compatibility

## Recitation recovery — 2026-10-06

The 0.2.3 build requests independently written code and treats Gemini's `RECITATION` outcome as **Original solution needed**, rather than an application crash. Blocked output is discarded without automatic retry/model fallback. The user can save optional algorithm notes and explicitly request an original solution; notes are capped at 4,000 characters and included under the existing account-specific consent. Legacy stored recitation errors also display the recovery controls.

All 138 tests across 24 suites passed, along with formatting, lint, typecheck, extension build, and the privacy-policy build. The 42 targeted Gemini/UI/routing regressions include a mocked worker start through recitation: stopped running state, WAIT badge, no error badge, no editor mutation or blocked checkpoint, and consent-checked bounded notes. These are mocked tests, not a live successful generation. Manual Chrome/Gemini verification with the user's API project remains pending, and the provider may still withhold output. The updated privacy source has not been deployed.

## Gemini failure correction — 2026-10-06

The 0.2.2 build uses Gemini 3 Flash first and preserves the cause when Gemini returns no answer. The prior parser silently discarded HTTP 200 responses with no candidates, no final text, or invalid JSON, leaving the generic “All Gemini models failed” message. Requests now use the documented Gemini 3 default temperature and low thinking, filter thought parts, retry token exhaustion once with a larger budget, stop on blocked prompts/access failures, and report each unsuccessful model's reason with the API key redacted. All 22 Gemini regressions and all 128 app tests passed, along with formatting, lint, typecheck, and the production build. Mocked tests verify these responses, consent/abort behavior, and timeout cleanup. Live generation with the user's API project is not yet verified; model access and quota remain provider-controlled.

## Combined extension verification — 2026-09-30

The 0.2.1 combined build passed GoPaste's formatting, lint, typecheck, 106 Vitest tests, and Vite build. The standalone CodeChum reference suite passed 66 Node tests locally. The privacy-policy Vite build also passed. The resulting ZIP contains the in-popup CodeChum view, optional `codechum.html`, one Manifest V3 worker, and no `CODECHUM-HACK/` source, admin site, web site, or store screenshots. These are automated/source checks only.

Manual Chrome checks are still required before submitting the update: load `dist/`, confirm GoPaste capture/copy/drag and dashboard flows, switch between library and CodeChum within the popup, sign in to CodeChum, verify its selected tab and test cases, consent with an account-specific key, start and stop a candidate via buttons and shortcuts, manually run CodeChum's Check code, resume after feedback, and retest after the service worker sleeps/restarts. No live Supabase or Gemini request was made during the automated suite, so their current integration is not yet verified end-to-end. Redeploy the updated privacy-policy site before pointing a Store listing at it.

## Product Target

Chrome stable on desktop. The current development environment is macOS; results for Windows, Linux, and destination apps must not be claimed until tested there.

## Sharing Contract

1. When Async Clipboard supports the stored image MIME type, GoPaste attempts to copy the binary image.
2. If binary copy is unsupported or rejected, GoPaste copies the original source URL when available and explains the fallback.
3. Drag payloads synchronously include the stored media as a named `File`, allowing file-drop targets such as chat composers to receive the attachment. When an HTTP(S) source URL exists, it is included as `text/uri-list` and `text/plain` as a compatibility fallback.
4. Destination-specific acceptance, native desktop file dragging, and animated-GIF fidelity remain best-effort until observed in a manual compatibility test.

## Verification Matrix

| Environment                          | Binary PNG          | Binary GIF/fidelity | URL copy fallback                                                   | Drag to web target                                            | Native desktop drag |
| ------------------------------------ | ------------------- | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- |
| Chrome 151.0.7922.172 / macOS 26.5.2 | Manual test pending | Manual test pending | Automated fallback paths pass; manual clipboard observation pending | Automated payload tests pass; manual destination test pending | Manual test pending |
| Chrome stable / Windows              | Not tested          | Not tested          | Not tested                                                          | Not tested                                                    | Not tested          |
| Chrome stable / Linux                | Not tested          | Not tested          | Not tested                                                          | Not tested                                                    | Not tested          |

Each recorded result must include Chrome version, OS version, destination, date, and whether the behavior was manually observed or automated. Unsupported cells must map to visible fallback behavior.

## Recorded Evidence — 2026-08-21

The Task 04 automated suite ran on macOS 26.5.2 with Chrome 151.0.7922.172 installed. It verifies the following adapter and UI behavior with simulated Clipboard and DataTransfer APIs:

- a supported binary write reports `binary` and does not write text;
- an unsupported or rejected binary write falls back to the original HTTP(S) URL and reports `url`;
- rejected URL writes and missing/non-portable source URLs produce `CLIPBOARD_UNSUPPORTED`;
- drag start adds a named `File` created from the saved binary, with a copy effect;
- when present, an HTTP(S) source is also written as `text/uri-list` and `text/plain`;
- if the file payload cannot be created, GoPaste reports and falls back to an HTTP(S) source URL only when one exists;
- the popup announces file-drag success, URL fallback, and failure as distinct statuses.

These are automated capability/fallback tests, not observations of the system clipboard or a destination application. The available agent environment did not permit a real pointer-driven drop into representative web and native applications, nor inspection of pasted GIF animation frames. Binary PNG behavior, animated-GIF fidelity, Google Docs/web-editor dragging, Finder/native-app dragging, and the URL actually present on the macOS clipboard therefore remain explicitly pending. No compatibility conclusion is drawn from a headless browser probe because headless page capabilities can differ from an interactive extension popup.

## Manual Sharing Checklist

For each run, record Chrome version, OS version, destination and date:

1. Copy a stored PNG and paste it into a native image-aware destination; confirm pixels and the “Binary image copied” status.
2. Copy a stored animated GIF, paste into a web editor and a native app, and confirm whether animation frames survive or the URL fallback is used.
3. Force or select a MIME type without binary clipboard support, copy it, and confirm the original URL and fallback status.
4. Drag an item into a browser file-drop target such as Messenger’s composer; confirm that the destination receives a named image file and, for GIFs, whether animation remains intact.
5. Drag into a browser URL/text target and confirm that the optional `text/uri-list` and `text/plain` fallbacks remain available.
6. Drag into a native destination and record whether it accepts the named file payload.
