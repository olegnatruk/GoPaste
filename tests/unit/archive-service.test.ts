import JSZip from "jszip";

import { LIMITS } from "../../src/core/domain/limits";
import type { MediaRecord, StorageStats } from "../../src/core/domain/media";
import type {
  BulkCreateMediaResult,
  CreateMediaResult,
  MediaRepository,
} from "../../src/core/ports/media-repository";
import { ZipArchiveService } from "../../src/infrastructure/archive";
import { readBlobArrayBuffer } from "../../src/infrastructure/media/validation";
import { createMediaRecord } from "../helpers/media-record";

class MemoryRepository implements MediaRepository {
  readonly records = new Map<string, MediaRecord>();

  constructor(records: MediaRecord[] = []) {
    records.forEach((record) => this.records.set(record.id, record));
  }

  async create(record: MediaRecord): Promise<CreateMediaResult> {
    const duplicate = [...this.records.values()].find((item) => item.sha256 === record.sha256);
    if (duplicate) return { status: "duplicate", existingId: duplicate.id };
    this.records.set(record.id, record);
    return { status: "created", record };
  }

  async getById(id: string) {
    return this.records.get(id);
  }

  async findByHash(hash: string) {
    return [...this.records.values()].find((item) => item.sha256 === hash);
  }

  async list() {
    return { items: [...this.records.values()] };
  }

  async updateMetadata(id: string) {
    const record = this.records.get(id);
    if (!record) throw new Error("missing");
    return record;
  }

  async delete(id: string) {
    return this.records.delete(id);
  }

  async getStats(): Promise<StorageStats> {
    const values = [...this.records.values()];
    return {
      itemCount: values.length,
      totalBytes: values.reduce((sum, item) => sum + item.byteSize, 0),
    };
  }

  async bulkCreate(records: readonly MediaRecord[]): Promise<BulkCreateMediaResult> {
    let created = 0;
    let duplicates = 0;
    for (const record of records) {
      const result = await this.create(record);
      if (result.status === "created") created += 1;
      else duplicates += 1;
    }
    return { created, duplicates };
  }
}

const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const HASH = "0".repeat(64);

function metadataItem(overrides: Record<string, unknown> = {}) {
  return {
    file: `images/item-${HASH}.gif`,
    sha256: HASH,
    mimeType: "image/gif",
    byteSize: GIF_BYTES.length,
    title: "Example",
    tags: ["reaction"],
    sourceUrl: "https://example.test/example.gif",
    pageUrl: "https://example.test/",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T01:00:00.000Z",
    ...overrides,
  };
}

async function archiveWith(items: unknown[], files: Record<string, Uint8Array> = {}) {
  const zip = new JSZip();
  zip.file(
    "metadata.json",
    JSON.stringify({
      format: "gopaste-archive",
      version: 1,
      exportedAt: "2026-08-21T02:00:00.000Z",
      items,
    }),
  );
  for (const [path, bytes] of Object.entries(files)) zip.file(path, bytes);
  return zip.generateAsync({ type: "uint8array" });
}

function zipBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer]);
}

describe("ZipArchiveService", () => {
  it("round trips bytes and supported metadata", async () => {
    const source = new MemoryRepository([
      createMediaRecord({
        sha256: HASH,
        title: "Saved title",
        tags: ["One", "Two"],
        updatedAt: "2026-08-21T01:00:00.000Z",
      }),
    ]);
    const archive = await new ZipArchiveService(source, {
      now: () => new Date("2026-08-21T02:00:00.000Z"),
    }).exportArchive();
    const repeatedArchive = await new ZipArchiveService(source, {
      now: () => new Date("2026-08-21T02:00:00.000Z"),
    }).exportArchive();
    expect(new Uint8Array(await readBlobArrayBuffer(repeatedArchive))).toEqual(
      new Uint8Array(await readBlobArrayBuffer(archive)),
    );
    const target = new MemoryRepository();
    const summary = await new ZipArchiveService(target, {
      hash: async () => HASH,
      createId: () => "imported-id",
    }).importArchive(new Blob([await readBlobArrayBuffer(archive)]));

    expect(summary).toEqual({ imported: 1, duplicates: 0, failed: 0, failures: [] });
    const imported = target.records.get("imported-id");
    expect(imported).toMatchObject({
      title: "Saved title",
      tags: ["One", "Two"],
      sha256: HASH,
      mimeType: "image/gif",
    });
    expect(imported?.blob.type).toBe("image/gif");
    expect(new Uint8Array(await readBlobArrayBuffer(imported!.blob))).toEqual(GIF_BYTES);
  });

  it("exports only the records explicitly selected by the dashboard", async () => {
    const selected = createMediaRecord({ id: "selected", sha256: HASH, tags: ["favorite"] });
    const omitted = createMediaRecord({ id: "omitted", sha256: "1".repeat(64) });
    const archive = await new ZipArchiveService(new MemoryRepository([selected, omitted]), {
      now: () => new Date("2026-08-21T02:00:00.000Z"),
    }).exportSelection([selected]);
    const zip = await JSZip.loadAsync(archive);
    const metadata = JSON.parse(await zip.file("metadata.json")!.async("text")) as {
      items: Array<{ sha256: string; tags: string[] }>;
    };

    expect(metadata.items).toEqual([expect.objectContaining({ sha256: HASH, tags: ["favorite"] })]);
    expect(Object.keys(zip.files).filter((path) => path.startsWith("images/"))).toHaveLength(1);
  });

  it("rejects traversal paths and compressed archives over the limit", async () => {
    const zip = new JSZip();
    zip.file("../metadata.json", "{}");
    const traversal = await zip.generateAsync({ type: "uint8array" });
    await expect(
      new ZipArchiveService(new MemoryRepository()).importArchive(zipBlob(traversal)),
    ).rejects.toMatchObject({ code: "ARCHIVE_INVALID" });

    const oversized = { size: LIMITS.maxArchiveCompressedBytes + 1 } as Blob;
    await expect(
      new ZipArchiveService(new MemoryRepository()).importArchive(oversized),
    ).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
  });

  it("rejects missing, corrupt, and excessive metadata", async () => {
    const missing = await new JSZip().generateAsync({ type: "uint8array" });
    await expect(
      new ZipArchiveService(new MemoryRepository()).importArchive(zipBlob(missing)),
    ).rejects.toMatchObject({ code: "ARCHIVE_INVALID" });

    const corruptZip = new JSZip();
    corruptZip.file("metadata.json", "{");
    const corrupt = await corruptZip.generateAsync({ type: "uint8array" });
    await expect(
      new ZipArchiveService(new MemoryRepository()).importArchive(zipBlob(corrupt)),
    ).rejects.toMatchObject({ code: "ARCHIVE_INVALID" });

    const excessive = await archiveWith(
      Array.from({ length: LIMITS.maxArchiveItems + 1 }, () => ({})),
    );
    await expect(
      new ZipArchiveService(new MemoryRepository()).importArchive(zipBlob(excessive)),
    ).rejects.toMatchObject({ code: "ARCHIVE_INVALID" });
  });

  it("imports valid entries while reporting missing files, MIME mismatches, and bad hashes", async () => {
    const valid = metadataItem();
    const missing = metadataItem({ file: "images/missing.gif", sha256: "1".repeat(64) });
    const mismatch = metadataItem({
      file: "images/wrong.png",
      sha256: "2".repeat(64),
      mimeType: "image/png",
    });
    const badHash = metadataItem({ file: "images/bad-hash.gif", sha256: "3".repeat(64) });
    const bytes = await archiveWith([valid, missing, mismatch, badHash], {
      [valid.file]: GIF_BYTES,
      [mismatch.file]: GIF_BYTES,
      [badHash.file]: GIF_BYTES,
    });
    const repository = new MemoryRepository();
    const summary = await new ZipArchiveService(repository, {
      hash: async (blob) => (blob.size === GIF_BYTES.length ? HASH : "f".repeat(64)),
      createId: () => "valid-id",
    }).importArchive(zipBlob(bytes));

    expect(summary).toMatchObject({ imported: 1, duplicates: 0, failed: 3 });
    expect(summary.failures.map((failure) => failure.file)).toEqual(
      expect.arrayContaining(["images/missing.gif", "images/wrong.png", "images/bad-hash.gif"]),
    );
    expect(repository.records.size).toBe(1);
  });

  it("reports content already in the repository as a duplicate", async () => {
    const item = metadataItem();
    const bytes = await archiveWith([item], { [item.file]: GIF_BYTES });
    const repository = new MemoryRepository([createMediaRecord({ sha256: HASH })]);
    const summary = await new ZipArchiveService(repository, {
      hash: async () => HASH,
    }).importArchive(zipBlob(bytes));
    expect(summary).toMatchObject({ imported: 0, duplicates: 1, failed: 0 });
    expect(repository.records.size).toBe(1);
  });
});
