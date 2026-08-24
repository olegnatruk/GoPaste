# User Guide

This guide describes the approved v1 behavior. Screens and exact wording will be updated after implementation verification.

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

All dashboard processing remains on this device. GoPaste has no account, cloud synchronization, remote backup, external analytics, or remote AI service.

## Troubleshooting

- If Chrome reports that it cannot reach an image, open GoPaste's details under `chrome://extensions` and set **Site access** to **On all sites**, then retry.
- If an image server returns HTTP 401 or 403, open the image itself in a new tab and try **Save to GoPaste** there. Some sites deliberately prevent third-party retrieval even when the image is visible on a page.
- GoPaste automatically retries page-generated `blob:` images inside the originating tab. If the page still refuses to export the image, open its original/direct image and save that version.
- If binary copying falls back to a URL, the image MIME type or destination is not supported by the browser clipboard path.
- If import rejects an archive, review its per-entry summary for format, corruption, duplicate, path, or size errors.
