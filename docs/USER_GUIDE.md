# User Guide

This guide describes GoPaste's media library and the optional CodeChum assistant. Chrome-specific behavior still requires manual verification where noted in `docs/COMPATIBILITY.md`.

## Save an Image

Right-click an image on a web page and choose **Save to GoPaste**. GoPaste fetches and stores the media locally. Unsupported formats, duplicates, oversized files, and inaccessible sources produce a clear status instead of a partial entry.

## Find and Organize Media

Open the GoPaste toolbar popup, choose a category created in the local dashboard, and browse the newest items. The category filter always reads the same local categories as the dashboard; click an image to copy it or drag it to a compatible chat. Use the dashboard for metadata and library management.

## Share Media

To paste a saved image or GIF into Messenger, open the Messenger conversation first, then open GoPaste and click the item. Return to Messenger, focus the composer, and press <kbd>⌘V</kbd> (or <kbd>Ctrl</kbd> + <kbd>V</kbd>). GoPaste converts the paste into the stored image/GIF file before Messenger handles it. The item can also be dragged directly over the Messenger composer and released. GoPaste never substitutes a source URL for the click-to-copy action.

## Back Up or Restore

Open the extension options page. **Export backup** downloads a ZIP containing media and versioned metadata. **Import backup** validates an existing GoPaste ZIP, shows progress, skips exact duplicates, imports valid entries, and reports invalid entries individually. The controls remain disabled while an archive operation is running, and storage totals refresh after an import.

Keep exported ZIP files private when source URLs or media are sensitive. Import only archives you are entitled to use, even though GoPaste validates their structure.

## Storage

The options page displays item count and approximate stored bytes. Storage is local to the Chrome profile and device; `unlimitedStorage` reduces quota pressure but does not create cloud backup or unlimited disk space.

## Local Dashboard

Open **Dashboard** from the GoPaste popup or extension options. The dashboard provides Overview, Library, Categories, Insights, Maintenance, and Backup & Settings sections.

- Switch the library between three-density thumbnail grids and a detailed list.
- Combine text, category, date, size, source, favorite, and activity filters.
- Select multiple items to favorite, add to a category without removing existing categories, or delete with an explicit scope confirmation.
- Open **Categories** to create visual category cards. Opening a category shows its included images newest first; choose **Add images** to select more saved media in newest-first order.
- Review local usage and storage summaries, recent items, and duplicate candidates.
- Export the whole library or selected categories to ZIP files and restore compatible archives.
- Configure local appearance, shortcuts, and the default click/copy action.

All media dashboard processing remains on this device. The dashboard has no cloud synchronization, remote backup, or external analytics. The separate CodeChum assistant uses Supabase and Gemini as described below.

## CodeChum Assistant

Open a CodeChum challenge in a browser tab, then choose **CodeChum** in the GoPaste popup. The assistant controls appear inside that popup; **Open full page** is optional. Choose the correct CodeChum tab if more than one is open, sign in with your member account, and enter your own Gemini API key. The landing site and administrator dashboard in the source folder are not included in the extension.

Before the first solver run for each account, read the data-sharing explanation and opt in. When you press **Start / resume**, the assistant reads the selected challenge and visible tests and sends that context to Gemini to prepare a candidate. The candidate is entered into CodeChum's editor. You click CodeChum's **Check code** yourself; after the result appears, press **Start / resume** again if you want the assistant to review the feedback and revise the candidate. **Stop** pauses a run. Revoking consent blocks later Gemini requests.

**Your approach (optional)** lets you describe your own algorithm in up to 4,000 characters. Notes are saved locally and included in generation/revision requests only after consent and a Start action, alongside relevant candidate code. Signing out or changing accounts clears these notes. Avoid entering personal or sensitive information.

Your saved GoPaste images and GIFs are not sent to Supabase or Gemini. CodeChum login/session, API key, settings, selected cases, and resumable progress use local Chrome extension storage. See `docs/PERMISSIONS_AND_PRIVACY.md` for the full data flow.

The assistant's **Keyboard shortcuts** section shows Chrome's current assignments. By default, `Alt+Shift+S` starts or resumes and `Alt+Shift+X` stops on the active CodeChum tab (`Alt` is Option on macOS). Speed-up and speed-down commands are available but have no default assignment; choose **Configure** to set or change them at `chrome://extensions/shortcuts`. If a shortcut fails to start, reopen the popup to see its error and check sign-in, key, and consent.

## Troubleshooting

- If Chrome reports that it cannot reach an image, open GoPaste's details under `chrome://extensions` and set **Site access** to **On all sites**, then retry.
- If an image server returns HTTP 401 or 403, open the image itself in a new tab and try **Save to GoPaste** there. Some sites deliberately prevent third-party retrieval even when the image is visible on a page.
- GoPaste automatically retries page-generated `blob:` images inside the originating tab. If the page still refuses to export the image, open its original/direct image and save that version.
- If binary copying falls back to a URL, the image MIME type or destination is not supported by the browser clipboard path.
- If import rejects an archive, review its per-entry summary for format, corruption, duplicate, path, or size errors.
- If CodeChum says no challenge tab is available, open a CodeChum problem and refresh the tab list in the assistant page. If a run cannot start, verify your member access, Gemini API key, consent, and selected tab.
- Gemini assistance uses Gemini 3 Flash first. If a request fails, the error identifies the attempted model and cause: invalid key/access, quota/rate limits, blocked prompt, missing answer, or token exhaustion. Quota and access restrictions require checking your Gemini API project; the extension cannot remove those restrictions. Reload the extension after replacing its build so Chrome uses the updated worker.
- If Gemini returns **RECITATION**, the run stops with **Original solution needed**. No blocked output is entered or cached, and existing editor code/checkpoints remain intact. Add your own algorithm steps in **Your approach**, then choose **Request original solution** to make a deliberate new request. The extension does not automatically retry or bypass the provider's restriction; Gemini may still withhold output. See [Google's response definitions](https://ai.google.dev/api/generate-content#FinishReason).
