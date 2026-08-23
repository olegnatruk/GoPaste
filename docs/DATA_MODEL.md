# Data Model

## Database

Database name: `gopaste`  
Initial schema version: `1`; dashboard migration version: `2`

The implementation may use a small typed wrapper, but domain code depends on a repository interface rather than IndexedDB primitives.

## Media Record

```ts
interface MediaRecord {
  id: string;
  blob: Blob;
  mimeType: "image/gif" | "image/png" | "image/jpeg" | "image/webp";
  extension: "gif" | "png" | "jpg" | "webp";
  byteSize: number;
  sha256: string;
  title: string;
  tags: string[];
  categoryIds?: string[];
  favorite?: boolean;
  copyCount?: number;
  dragCount?: number;
  lastUsedAt?: string;
  previewDataUrl?: string;
  sourceUrl: string;
  pageUrl?: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}
```

Dashboard fields are optional at the domain boundary so existing version-1 records remain readable. Repository reads normalize them to safe defaults. A dashboard write persists only local metadata and never alters the original media blob when a custom preview frame is selected.

## Dashboard Stores

- `categories`: category/tag definitions with stable IDs, names, colors, optional parent IDs, and sort order.
- `preferences`: one local dashboard preference document containing theme, accent, grid density, view mode, shortcuts, and default action.
- `usage`: compact per-media counters and last-used timestamps. Aggregated charts are calculated locally and are not telemetry.

Schema version 2 adds these stores and media indexes for favorite and last-used state without recreating existing stores.

IDs are generated UUIDs. Dates are UTC ISO-8601 strings. Tags are trimmed, case-preserving for display, deduplicated case-insensitively, and indexed through a normalized form. Title and tag search is case-insensitive.

## Indexes

- Unique `sha256` for duplicate detection.
- `createdAt` for newest-first browsing.
- Multi-entry normalized tags index where supported by the chosen schema wrapper.

Free-text title/tag search may initially filter a bounded in-memory page. If measured library performance is inadequate, a normalized token index can be introduced through a schema migration.

## Repository Contract

The repository supports create, get, page/list, update metadata, delete, find by hash, count, byte totals, and a transaction-oriented bulk import. Writes either persist a complete valid record or do not persist it.

## Limits and Validation

- Maximum single media item: 25 MiB.
- Supported MIME types: GIF, PNG, JPEG, WebP.
- Validate magic bytes, not only headers or file extensions.
- Imported/fetched URLs are metadata strings and are never executed.
- Exact hash duplicates are skipped and reported; metadata is not silently merged.

## Migration Policy

Each IndexedDB change increments the schema version and includes a tested upgrade path. Destructive migrations require an export/backup path and explicit approval. Opening a newer unsupported schema must fail safely rather than recreate the database.
