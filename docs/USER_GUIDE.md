# User Guide

This guide describes the approved v1 behavior. Screens and exact wording will be updated after implementation verification.

## Save an Image

Right-click an image on a web page and choose **Save to GoPaste**. GoPaste fetches and stores the media locally. Unsupported formats, duplicates, oversized files, and inaccessible sources produce a clear status instead of a partial entry.

## Find and Organize Media

Open the GoPaste toolbar popup. Search titles and tags, choose a tag/category filter, and browse the newest items. Item controls allow copying, editing the title/tags, and deleting after confirmation.

## Share Media

Choose **Copy** to attempt a binary image copy. If Chrome or the image type does not support that operation, GoPaste copies the original URL when available and reports the fallback. To attach a saved image or GIF in Messenger, first open the Messenger conversation in another Chrome tab, then open GoPaste. Keep holding **Drag to chat** (or **Drag file** in the dashboard), move it over the Messenger composer, then release. GoPaste recognizes its own drop and supplies the stored binary to Messenger’s attachment input; the original URL remains a compatibility fallback for non-Messenger targets.

## Back Up or Restore

Open the extension options page. **Export backup** downloads a ZIP containing media and versioned metadata. **Import backup** validates an existing GoPaste ZIP, shows progress, skips exact duplicates, imports valid entries, and reports invalid entries individually. The controls remain disabled while an archive operation is running, and storage totals refresh after an import.

Keep exported ZIP files private when source URLs or media are sensitive. Import only archives you are entitled to use, even though GoPaste validates their structure.

## Storage

The options page displays item count and approximate stored bytes. Storage is local to the Chrome profile and device; `unlimitedStorage` reduces quota pressure but does not create cloud backup or unlimited disk space.

## Local Dashboard

Open **Dashboard** from the GoPaste popup or extension options. The dashboard provides Overview, Library, Categories & Tags, Insights, Maintenance, and Backup & Settings sections.

- Switch the library between three-density thumbnail grids and a detailed list.
- Combine text, category/tag, date, size, source, favorite, and activity filters.
- Select multiple items to favorite, re-tag, move, or delete with an explicit scope confirmation.
- Review local usage and storage summaries, recent items, and duplicate candidates.
- Export the whole library or selected categories/tags to ZIP files and restore compatible archives.
- Configure local appearance, shortcuts, and the default click/copy action.

All dashboard processing remains on this device. GoPaste has no account, cloud synchronization, remote backup, external analytics, or remote AI service.

## Troubleshooting

- If Chrome reports that it cannot reach an image, open GoPaste's details under `chrome://extensions` and set **Site access** to **On all sites**, then retry.
- If an image server returns HTTP 401 or 403, open the image itself in a new tab and try **Save to GoPaste** there. Some sites deliberately prevent third-party retrieval even when the image is visible on a page.
- GoPaste automatically retries page-generated `blob:` images inside the originating tab. If the page still refuses to export the image, open its original/direct image and save that version.
- If binary copying falls back to a URL, the image MIME type or destination is not supported by the browser clipboard path.
- If import rejects an archive, review its per-entry summary for format, corruption, duplicate, path, or size errors.
