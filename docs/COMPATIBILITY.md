# Compatibility

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
