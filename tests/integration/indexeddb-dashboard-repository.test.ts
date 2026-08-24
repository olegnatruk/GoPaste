import "fake-indexeddb/auto";

import { DEFAULT_DASHBOARD_PREFERENCES } from "../../src/core/domain/dashboard";
import { DATABASE } from "../../src/core/domain/limits";
import { IndexedDbDashboardRepository } from "../../src/infrastructure/indexeddb/dashboard-repository";
import { IndexedDbMediaRepository } from "../../src/infrastructure/indexeddb/media-repository";
import {
  CATEGORIES_STORE,
  DASHBOARD_DATABASE_VERSION,
  FAVORITE_INDEX,
  LAST_USED_AT_INDEX,
  MEDIA_STORE,
  PREFERENCES_STORE,
  USAGE_STORE,
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

async function createLegacyDatabase(records: readonly Record<string, unknown>[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DATABASE.name, 1);
    request.onupgradeneeded = () => {
      const media = request.result.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      media.createIndex("by-sha256", "sha256");
      media.createIndex("by-created-at", "createdAt");
      media.createIndex("by-normalized-tags", "normalizedTags", { multiEntry: true });
      request.result.createObjectStore("status", { keyPath: "key" });
      for (const record of records) media.add(record);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe("IndexedDbDashboardRepository", () => {
  beforeEach(deleteDatabase);
  afterEach(deleteDatabase);

  it("upgrades a version-1 library without rewriting its media and normalizes dashboard defaults", async () => {
    const legacy = createMediaRecord({ id: "legacy", tags: ["Reaction"] });
    await createLegacyDatabase([{ ...legacy, normalizedTags: ["reaction"] }]);

    const database = await openGoPasteDatabase();
    expect(database.version).toBe(DASHBOARD_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual(
      expect.arrayContaining([MEDIA_STORE, CATEGORIES_STORE, PREFERENCES_STORE, USAGE_STORE]),
    );
    const media = database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE);
    expect(media.indexNames.contains(FAVORITE_INDEX)).toBe(true);
    expect(media.indexNames.contains(LAST_USED_AT_INDEX)).toBe(true);

    await expect(new IndexedDbDashboardRepository().getMedia("legacy")).resolves.toMatchObject({
      id: "legacy",
      blob: legacy.blob,
      categoryIds: [],
      favorite: false,
      copyCount: 0,
      dragCount: 0,
    });
  });

  it("persists categories, preferences, and local usage across a reopen", async () => {
    const media = new IndexedDbMediaRepository();
    await media.create(createMediaRecord({ id: "used" }));
    const repository = new IndexedDbDashboardRepository();
    await expect(repository.getPreferences()).resolves.toEqual(DEFAULT_DASHBOARD_PREFERENCES);

    await repository.saveCategory({
      id: "reactions",
      name: " Reactions ",
      color: "#BDF45D",
      sortOrder: 1,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    });
    await repository.updatePreferences({ theme: "dark", gridDensity: "compact" });
    await repository.recordUsage("used", "copy", "2026-08-23T01:00:00.000Z");
    await repository.recordUsage("used", "drag", "2026-08-23T02:00:00.000Z");

    closeGoPasteDatabase();
    const reopened = new IndexedDbDashboardRepository();
    await expect(reopened.listCategories()).resolves.toMatchObject([
      { id: "reactions", name: "Reactions", color: "#bdf45d" },
    ]);
    await expect(reopened.getPreferences()).resolves.toMatchObject({
      theme: "dark",
      gridDensity: "compact",
    });
    await expect(reopened.getUsage("used")).resolves.toEqual({
      mediaId: "used",
      copyCount: 1,
      dragCount: 1,
      lastUsedAt: "2026-08-23T02:00:00.000Z",
    });
  });

  it("supports advanced filtering, deterministic sorting, and partial batch results", async () => {
    const media = new IndexedDbMediaRepository();
    await media.bulkCreate([
      createMediaRecord({
        id: "a",
        sha256: "a".repeat(64),
        title: "Alpha",
        byteSize: 10,
        sourceUrl: "https://one.test/alpha.gif",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      createMediaRecord({
        id: "b",
        sha256: "b".repeat(64),
        title: "Bravo",
        tags: ["Funny"],
        byteSize: 20,
        sourceUrl: "https://two.test/bravo.gif",
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    const repository = new IndexedDbDashboardRepository();
    const batch = await repository.batchUpdateMetadata(["b", "missing", "b"], {
      favorite: true,
      addCategoryIds: ["favorites"],
    });
    expect(batch).toEqual({
      requested: 2,
      attempted: 2,
      succeeded: ["b"],
      failures: [{ id: "missing", code: "NOT_FOUND", message: "Item not found." }],
    });
    await repository.recordUsage("b", "copy", "2026-08-23T00:00:00.000Z");

    await expect(
      repository.list({
        limit: 10,
        search: "bravo",
        categoryIds: ["favorites"],
        sourceWebsite: "two.test",
        favorite: true,
        usedSince: "2026-08-01T00:00:00.000Z",
        minBytes: 15,
        sortBy: "usageCount",
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: "b",
          tags: ["Funny"],
          categoryIds: ["favorites"],
          favorite: true,
          copyCount: 1,
        },
      ],
    });
  });

  it("reports explicit batch deletion scope and clears associated usage", async () => {
    const media = new IndexedDbMediaRepository();
    await media.create(createMediaRecord({ id: "delete-me" }));
    const repository = new IndexedDbDashboardRepository();
    await repository.recordUsage("delete-me", "copy");

    await expect(repository.batchDeleteMedia(["delete-me", "missing"])).resolves.toEqual({
      requested: 2,
      attempted: 2,
      succeeded: ["delete-me"],
      failures: [{ id: "missing", code: "NOT_FOUND", message: "The image no longer exists." }],
    });
    await expect(repository.getUsage("delete-me")).resolves.toEqual({
      mediaId: "delete-me",
      copyCount: 0,
      dragCount: 0,
    });
  });

  it("derives local statistics and deterministic exact-duplicate groups without deleting", async () => {
    const first = createMediaRecord({
      id: "a",
      title: "First",
      sha256: "f".repeat(64),
      byteSize: 10,
    });
    const second = createMediaRecord({
      id: "b",
      title: "Second",
      sha256: "f".repeat(64),
      byteSize: 12,
    });
    await createLegacyDatabase([
      { ...second, normalizedTags: ["reaction"], favorite: true, categoryIds: ["favorites"] },
      { ...first, normalizedTags: ["reaction"] },
    ]);
    const repository = new IndexedDbDashboardRepository();
    await repository.recordUsage("b", "drag", "2026-08-23T00:00:00.000Z");

    await expect(repository.findExactDuplicateGroups()).resolves.toEqual([
      {
        sha256: "f".repeat(64),
        items: [
          { id: "a", title: "First", byteSize: 10, createdAt: first.createdAt },
          { id: "b", title: "Second", byteSize: 12, createdAt: second.createdAt },
        ],
        reclaimableBytes: 12,
      },
    ]);
    await expect(repository.getStatistics()).resolves.toMatchObject({
      itemCount: 2,
      totalBytes: 22,
      favoriteCount: 1,
      unusedCount: 1,
      dragCount: 1,
      byCategoryId: { favorites: { itemCount: 1, totalBytes: 12 } },
    });
    await expect(repository.getMedia("a")).resolves.toMatchObject({ id: "a" });
    await expect(repository.getMedia("b")).resolves.toMatchObject({ id: "b" });
  });
});
