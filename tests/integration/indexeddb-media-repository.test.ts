import "fake-indexeddb/auto";

import { DATABASE } from "../../src/core/domain/limits";
import { IndexedDbCaptureStatusStore } from "../../src/infrastructure/indexeddb/capture-status-store";
import { IndexedDbMediaRepository } from "../../src/infrastructure/indexeddb/media-repository";
import {
  closeGoPasteDatabase,
  openGoPasteDatabase,
} from "../../src/infrastructure/indexeddb/schema";
import { createMediaRecord } from "../helpers/media-record";

async function deleteDatabase(): Promise<void> {
  closeGoPasteDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE.name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("IndexedDbMediaRepository", () => {
  beforeEach(deleteDatabase);
  afterEach(deleteDatabase);

  it("persists complete records across a repository/database reopen", async () => {
    const repository = new IndexedDbMediaRepository();
    const record = createMediaRecord();
    await expect(repository.create(record)).resolves.toMatchObject({ status: "created" });

    closeGoPasteDatabase();
    const reopened = new IndexedDbMediaRepository();
    await expect(reopened.getById(record.id)).resolves.toMatchObject({
      id: record.id,
      mimeType: "image/gif",
      byteSize: 6,
      sha256: record.sha256,
    });
  });

  it("skips exact hash duplicates and returns the existing id", async () => {
    const repository = new IndexedDbMediaRepository();
    const first = createMediaRecord();
    await repository.create(first);
    await expect(
      repository.create(
        createMediaRecord({ id: "duplicate-id", sourceUrl: "https://other.test/a" }),
      ),
    ).resolves.toEqual({ status: "duplicate", existingId: first.id });
    await expect(repository.getStats()).resolves.toEqual({ itemCount: 1, totalBytes: 6 });
  });

  it("lists newest first with paging, search, and normalized tag filters", async () => {
    const repository = new IndexedDbMediaRepository();
    await repository.bulkCreate([
      createMediaRecord({
        id: "a",
        sha256: "a".repeat(64),
        title: "Older",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      createMediaRecord({
        id: "b",
        sha256: "b".repeat(64),
        title: "New reaction",
        tags: ["Funny", " funny "],
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      createMediaRecord({
        id: "c",
        sha256: "c".repeat(64),
        title: "Newest",
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
    ]);

    const first = await repository.list({ limit: 2 });
    expect(first.items.map(({ id }) => id)).toEqual(["c", "b"]);
    await expect(repository.list({ limit: 2, cursor: first.nextCursor })).resolves.toMatchObject({
      items: [{ id: "a" }],
    });
    const filtered = await repository.list({ limit: 10, search: "reaction", tags: ["FUNNY"] });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({ id: "b", tags: ["Funny"] });
  });

  it("updates metadata, totals bytes, and deletes records", async () => {
    const repository = new IndexedDbMediaRepository();
    const record = createMediaRecord();
    await repository.create(record);
    await expect(
      repository.updateMetadata(record.id, { title: " Renamed ", tags: ["One", "one", " Two "] }),
    ).resolves.toMatchObject({ title: "Renamed", tags: ["One", "Two"] });
    await expect(repository.getStats()).resolves.toEqual({ itemCount: 1, totalBytes: 6 });
    await expect(repository.delete(record.id)).resolves.toBe(true);
    await expect(repository.delete(record.id)).resolves.toBe(false);
  });

  it("aborts a failed bulk write without leaving partial records", async () => {
    const repository = new IndexedDbMediaRepository();
    await expect(
      repository.bulkCreate([
        createMediaRecord({ id: "same", sha256: "a".repeat(64) }),
        createMediaRecord({ id: "same", sha256: "b".repeat(64) }),
      ]),
    ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    await expect(repository.getStats()).resolves.toEqual({ itemCount: 0, totalBytes: 0 });
  });

  it("persists recent capture status independently of service-worker memory", async () => {
    const statusStore = new IndexedDbCaptureStatusStore();
    const status = {
      state: "saved" as const,
      updatedAt: "2026-08-21T01:02:03.000Z",
      itemId: "item-1",
    };
    await statusStore.set(status);
    closeGoPasteDatabase();
    await openGoPasteDatabase();
    await expect(new IndexedDbCaptureStatusStore().get()).resolves.toEqual(status);
  });
});
