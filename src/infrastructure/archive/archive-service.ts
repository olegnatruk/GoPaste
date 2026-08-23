import JSZip, { type JSZipObject } from "jszip";

import {
  type ArchiveEntryFailure,
  type ArchiveImportSummary,
  type ArchiveItemMetadata,
  type ArchiveMetadataV1,
} from "../../core/domain/archive";
import { ApplicationError } from "../../core/domain/errors";
import { ARCHIVE, LIMITS } from "../../core/domain/limits";
import {
  SUPPORTED_MIME_TYPES,
  type MediaExtension,
  type MediaRecord,
  type SupportedMimeType,
} from "../../core/domain/media";
import type { MediaRepository } from "../../core/ports/media-repository";
import { WebContentHasher } from "../media/web-media";
import { extensionForMimeType, validateMediaBlob } from "../media/validation";

export type ArchiveProgress =
  | { phase: "exporting"; completed: number; total: number }
  | { phase: "importing"; completed: number; total: number };

export interface ArchiveServiceOptions {
  now?: () => Date;
  createId?: () => string;
  hash?: (blob: Blob) => Promise<string>;
  onProgress?: (progress: ArchiveProgress) => void;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_MEDIA_PATH = /^images\/[a-z0-9-]+\.(gif|png|jpg|webp)$/;
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");

function archiveInvalid(message: string): ApplicationError {
  return new ApplicationError("ARCHIVE_INVALID", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function optionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function validateItem(value: unknown): ArchiveItemMetadata | ArchiveEntryFailure {
  const file = isObject(value) && typeof value.file === "string" ? value.file : undefined;
  const fail = (message: string): ArchiveEntryFailure => ({
    ...(file ? { file } : {}),
    code: "INVALID_METADATA",
    message,
  });
  if (!isObject(value)) return fail("The item metadata must be an object.");
  if (!file || !SAFE_MEDIA_PATH.test(file)) return fail("The item has an unsafe media path.");
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    return fail("The item has an invalid SHA-256 digest.");
  }
  if (!SUPPORTED_MIME_TYPES.includes(value.mimeType as SupportedMimeType)) {
    return fail("The item has an unsupported MIME type.");
  }
  if (!Number.isSafeInteger(value.byteSize) || (value.byteSize as number) < 0) {
    return fail("The item has an invalid byte size.");
  }
  if ((value.byteSize as number) > LIMITS.maxMediaBytes) {
    return fail("The item exceeds the per-image size limit.");
  }
  if (typeof value.title !== "string" || value.title.length > 1_000) {
    return fail("The item has an invalid title.");
  }
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 100 ||
    !value.tags.every((tag) => typeof tag === "string" && tag.length <= 200)
  ) {
    return fail("The item has invalid tags.");
  }
  if (typeof value.sourceUrl !== "string" || value.sourceUrl.length > 10_000) {
    return fail("The item has an invalid source URL.");
  }
  if (!optionalString(value.pageUrl) || (value.pageUrl?.length ?? 0) > 10_000) {
    return fail("The item has an invalid page URL.");
  }
  if (!optionalPositiveNumber(value.width) || !optionalPositiveNumber(value.height)) {
    return fail("The item has invalid dimensions.");
  }
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) {
    return fail("The item has invalid timestamps.");
  }

  const mimeType = value.mimeType as SupportedMimeType;
  const extension = file.slice(file.lastIndexOf(".") + 1) as MediaExtension;
  if (extensionForMimeType(mimeType) !== extension) {
    return fail("The filename extension does not match the declared MIME type.");
  }
  return {
    file: file as ArchiveItemMetadata["file"],
    sha256: value.sha256,
    mimeType,
    byteSize: value.byteSize as number,
    title: value.title,
    tags: [...value.tags] as string[],
    sourceUrl: value.sourceUrl,
    ...(value.pageUrl !== undefined ? { pageUrl: value.pageUrl } : {}),
    ...(value.width !== undefined ? { width: value.width } : {}),
    ...(value.height !== undefined ? { height: value.height } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function validateArchiveMetadata(value: unknown): {
  items: ArchiveItemMetadata[];
  failures: ArchiveEntryFailure[];
} {
  if (!isObject(value)) throw archiveInvalid("metadata.json must contain a JSON object.");
  if (value.format !== ARCHIVE.format || value.version !== ARCHIVE.version) {
    throw archiveInvalid("This is not a supported GoPaste archive version.");
  }
  if (!isIsoDate(value.exportedAt) || !Array.isArray(value.items)) {
    throw archiveInvalid("metadata.json is missing required archive fields.");
  }
  if (value.items.length > LIMITS.maxArchiveItems) {
    throw archiveInvalid(`The archive contains more than ${LIMITS.maxArchiveItems} items.`);
  }
  const items: ArchiveItemMetadata[] = [];
  const failures: ArchiveEntryFailure[] = [];
  const paths = new Set<string>();
  for (const rawItem of value.items) {
    const item = validateItem(rawItem);
    if ("code" in item) {
      failures.push(item);
    } else if (paths.has(item.file)) {
      failures.push({
        file: item.file,
        code: "DUPLICATE_PATH",
        message: "More than one item references this archive path.",
      });
    } else {
      paths.add(item.file);
      items.push(item);
    }
  }
  return { items, failures };
}

function originalName(entry: JSZipObject): string {
  return (entry as JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
}

function isSymlink(entry: JSZipObject): boolean {
  const permissions = entry.unixPermissions;
  return typeof permissions === "number" && (permissions & 0o170000) === 0o120000;
}

function declaredUncompressedSize(entry: JSZipObject): number | undefined {
  const data = (entry as JSZipObject & { _data?: { uncompressedSize?: number } })._data;
  return data?.uncompressedSize;
}

function validateZipEntries(zip: JSZip): void {
  let extractedBytes = 0;
  for (const entry of Object.values(zip.files)) {
    const sourceName = originalName(entry);
    if (
      sourceName.startsWith("/") ||
      sourceName.includes("\\") ||
      sourceName.split("/").includes("..") ||
      isSymlink(entry)
    ) {
      throw archiveInvalid("The ZIP contains an unsafe path or link.");
    }
    if (!entry.dir && entry.name !== "metadata.json" && !entry.name.startsWith("images/")) {
      throw archiveInvalid("The ZIP contains a file outside the supported archive layout.");
    }
    const size = declaredUncompressedSize(entry);
    if (size !== undefined) {
      extractedBytes += size;
      if (extractedBytes > LIMITS.maxArchiveExtractedBytes) {
        throw archiveInvalid("The ZIP exceeds the extracted-size limit.");
      }
    }
  }
}

async function listAll(repository: MediaRepository): Promise<MediaRecord[]> {
  const records: MediaRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await repository.list({
      limit: LIMITS.maxPageSize,
      ...(cursor ? { cursor } : {}),
    });
    records.push(...page.items);
    if (page.nextCursor && page.nextCursor === cursor) {
      throw new Error("Repository paging did not advance.");
    }
    cursor = page.nextCursor;
  } while (cursor);
  return records;
}

function toMetadata(record: MediaRecord, file: ArchiveItemMetadata["file"]): ArchiveItemMetadata {
  return {
    file,
    sha256: record.sha256,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    title: record.title,
    tags: record.tags,
    sourceUrl: record.sourceUrl,
    ...(record.pageUrl !== undefined ? { pageUrl: record.pageUrl } : {}),
    ...(record.width !== undefined ? { width: record.width } : {}),
    ...(record.height !== undefined ? { height: record.height } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ZipArchiveService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly hash: (blob: Blob) => Promise<string>;
  private readonly onProgress?: (progress: ArchiveProgress) => void;

  constructor(
    private readonly repository: MediaRepository,
    options: ArchiveServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.hash = options.hash ?? ((blob) => new WebContentHasher().sha256(blob));
    this.onProgress = options.onProgress;
  }

  async exportArchive(): Promise<Blob> {
    return this.exportRecords(await listAll(this.repository));
  }

  async exportSelection(records: readonly MediaRecord[]): Promise<Blob> {
    if (records.length > LIMITS.maxArchiveItems) {
      throw archiveInvalid(`The selection contains more than ${LIMITS.maxArchiveItems} items.`);
    }
    return this.exportRecords(records);
  }

  private async exportRecords(source: readonly MediaRecord[]): Promise<Blob> {
    const records = [...source].sort(
      (left, right) => left.sha256.localeCompare(right.sha256) || left.id.localeCompare(right.id),
    );
    const zip = new JSZip();
    const items: ArchiveItemMetadata[] = [];
    for (const [index, record] of records.entries()) {
      const stem = `${String(index + 1).padStart(5, "0")}-${record.sha256}`;
      const file = `images/${stem}.${record.extension}` as ArchiveItemMetadata["file"];
      items.push(toMetadata(record, file));
      zip.file(file, record.blob, { binary: true, date: ZIP_EPOCH, createFolders: false });
      this.onProgress?.({ phase: "exporting", completed: index + 1, total: records.length });
    }
    const metadata: ArchiveMetadataV1 = {
      format: ARCHIVE.format,
      version: ARCHIVE.version,
      exportedAt: this.now().toISOString(),
      items,
    };
    zip.file("metadata.json", JSON.stringify(metadata, null, 2), { date: ZIP_EPOCH });
    return zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  async importArchive(file: Blob): Promise<ArchiveImportSummary> {
    if (file.size > LIMITS.maxArchiveCompressedBytes) {
      throw archiveInvalid("The ZIP exceeds the compressed-size limit.");
    }
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (error) {
      throw new ApplicationError(
        "ARCHIVE_INVALID",
        "The selected file is not a readable ZIP.",
        undefined,
        {
          cause: error,
        },
      );
    }
    validateZipEntries(zip);
    const metadataEntry = zip.file("metadata.json");
    if (!metadataEntry) throw archiveInvalid("The ZIP does not contain root metadata.json.");

    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(await metadataEntry.async("text"));
    } catch (error) {
      throw new ApplicationError("ARCHIVE_INVALID", "metadata.json is not valid JSON.", undefined, {
        cause: error,
      });
    }
    const validated = validateArchiveMetadata(rawMetadata);
    const summary: ArchiveImportSummary = {
      imported: 0,
      duplicates: 0,
      failed: validated.failures.length,
      failures: [...validated.failures],
    };
    const pending: MediaRecord[] = [];
    let extractedBytes = 0;

    const flush = async () => {
      if (!pending.length) return;
      const batch = pending.splice(0);
      try {
        const result = await this.repository.bulkCreate(batch);
        summary.imported += result.created;
        summary.duplicates += result.duplicates;
      } catch {
        summary.failed += batch.length;
        summary.failures.push(
          ...batch.map((record) => ({
            file: validated.items.find((item) => item.sha256 === record.sha256)?.file,
            code: "STORAGE_FAILED",
            message: "This item could not be saved; no records from its batch were committed.",
          })),
        );
      }
      await Promise.resolve();
    };

    for (const [index, item] of validated.items.entries()) {
      try {
        const entry = zip.file(item.file);
        if (!entry) throw new Error("The referenced media file is missing.");
        const bytes = await entry.async("uint8array");
        extractedBytes += bytes.byteLength;
        if (extractedBytes > LIMITS.maxArchiveExtractedBytes) {
          throw archiveInvalid("The ZIP exceeds the extracted-size limit.");
        }
        if (bytes.byteLength !== item.byteSize)
          throw new Error("The extracted byte size does not match metadata.");
        const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: item.mimeType });
        const media = await validateMediaBlob(blob);
        if (
          media.mimeType !== item.mimeType ||
          media.extension !== extensionForMimeType(item.mimeType)
        ) {
          throw new Error("The image bytes do not match the declared MIME type.");
        }
        if ((await this.hash(blob)) !== item.sha256)
          throw new Error("The image SHA-256 does not match metadata.");
        pending.push({
          id: this.createId(),
          blob,
          mimeType: media.mimeType,
          extension: media.extension,
          byteSize: media.byteSize,
          sha256: item.sha256,
          title: item.title,
          tags: item.tags,
          sourceUrl: item.sourceUrl,
          ...(item.pageUrl !== undefined ? { pageUrl: item.pageUrl } : {}),
          ...(item.width !== undefined ? { width: item.width } : {}),
          ...(item.height !== undefined ? { height: item.height } : {}),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
        if (pending.length >= LIMITS.importBatchSize) await flush();
      } catch (error) {
        if (error instanceof ApplicationError && error.code === "ARCHIVE_INVALID") throw error;
        summary.failed += 1;
        summary.failures.push({
          file: item.file,
          code: "INVALID_ENTRY",
          message: error instanceof Error ? error.message : "The archive entry is invalid.",
        });
      }
      this.onProgress?.({
        phase: "importing",
        completed: index + 1,
        total: validated.items.length,
      });
    }
    await flush();
    return summary;
  }
}
