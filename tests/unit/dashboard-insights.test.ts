import { describe, expect, it } from "vitest";
import {
  HARD_MAX_NEAR_DUPLICATE_COMPARISONS,
  aggregateStorageStats,
  aggregateUsageStats,
  buildDashboardOverview,
  filterDashboardRecords,
  groupExactDuplicates,
  readDashboardMetadata,
  scoreNearDuplicateCandidates,
} from "../../src/core/services/dashboard-insights";
import { createMediaRecord } from "../helpers/media-record";

describe("dashboard insights", () => {
  it("reads optional dashboard metadata safely and aggregates overview, usage, and storage", () => {
    const favorite = createMediaRecord({
      id: "favorite",
      byteSize: 100,
      tags: [],
      createdAt: "2026-08-22T00:00:00.000Z",
      ...({
        dashboard: {
          categoryIds: ["Reaction"],
          favorite: true,
          copyCount: 4,
          dragCount: 2,
          lastUsedAt: "2026-08-23T00:00:00.000Z",
        },
      } as object),
    });
    const other = createMediaRecord({
      id: "other",
      byteSize: 300,
      mimeType: "image/webp",
      extension: "webp",
      createdAt: "2026-08-21T00:00:00.000Z",
      ...({ category: "Memes", copyCount: 1 } as object),
    });

    expect(readDashboardMetadata(favorite)).toEqual({
      categories: ["Reaction"],
      favorite: true,
      copyCount: 4,
      dragCount: 2,
      lastUsedAt: "2026-08-23T00:00:00.000Z",
    });
    const usage = aggregateUsageStats([other, favorite]);
    expect(usage).toMatchObject({
      totalCopyCount: 5,
      totalDragCount: 2,
      totalActions: 7,
      usedItemCount: 2,
    });
    expect(usage.byCategory).toEqual([
      {
        categoryId: "Reaction",
        itemCount: 1,
        copyCount: 4,
        dragCount: 2,
        totalActions: 6,
      },
      {
        categoryId: "Memes",
        itemCount: 1,
        copyCount: 1,
        dragCount: 0,
        totalActions: 1,
      },
    ]);
    expect(aggregateStorageStats([favorite, other])).toEqual({
      itemCount: 2,
      totalBytes: 400,
      averageBytes: 200,
      byMimeType: [
        { key: "image/gif", itemCount: 1, totalBytes: 100 },
        { key: "image/webp", itemCount: 1, totalBytes: 300 },
      ],
      byCategory: [
        { key: "Memes", itemCount: 1, totalBytes: 300 },
        { key: "Reaction", itemCount: 1, totalBytes: 100 },
      ],
    });

    const overview = buildDashboardOverview([other, favorite], { recentLimit: 1 });
    expect(overview).toMatchObject({
      itemCount: 2,
      favoriteCount: 1,
      neverUsedCount: 0,
    });
    expect(overview.recentlySaved.map((record) => record.id)).toEqual(["favorite"]);
    expect(overview.recentlyUsed.map((entry) => entry.record.id)).toEqual(["favorite"]);
    expect(overview.favorites.map((record) => record.id)).toEqual(["favorite"]);
  });

  it("combines source, date, size, and category filters without mutating input", () => {
    const matching = createMediaRecord({
      id: "match",
      byteSize: 2_000,
      tags: ["Funny", "Reaction"],
      sourceUrl: "https://media.example.test/cat.gif",
      createdAt: "2026-08-20T12:00:00.000Z",
      ...({ categoryIds: ["Cats", "Favorites"] } as object),
    });
    const excluded = createMediaRecord({
      id: "excluded",
      byteSize: 8_000,
      tags: ["Funny"],
      sourceUrl: "https://other.test/dog.gif",
      createdAt: "2026-08-19T00:00:00.000Z",
      ...({ categoryIds: ["Dogs"] } as object),
    });
    const records = [excluded, matching];

    const result = filterDashboardRecords(records, {
      sourceHosts: ["www.media.example.test"],
      dateAddedFrom: "2026-08-20T00:00:00.000Z",
      dateAddedTo: "2026-08-21T00:00:00.000Z",
      minByteSize: 1_000,
      maxByteSize: 3_000,
      categories: ["cats"],
    });

    expect(result.map((record) => record.id)).toEqual(["match"]);
    expect(records).toEqual([excluded, matching]);
  });

  it("groups exact hashes deterministically and reports advisory reclaimable bytes", () => {
    const newer = createMediaRecord({ id: "b", sha256: "ABC", byteSize: 80 });
    const older = createMediaRecord({
      id: "a",
      sha256: "abc",
      byteSize: 100,
      createdAt: "2026-08-20T00:00:00.000Z",
    });
    const unique = createMediaRecord({ id: "unique", sha256: "def", byteSize: 50 });

    expect(groupExactDuplicates([newer, unique, older])).toEqual([
      {
        sha256: "abc",
        records: [older, newer],
        totalBytes: 180,
        reclaimableBytes: 100,
      },
    ]);
  });

  it("scores near-duplicate candidates from visible metadata and excludes exact hashes", () => {
    const left = createMediaRecord({
      id: "left",
      sha256: "1".repeat(64),
      title: "Surprised cat reaction",
      tags: ["cat", "reaction"],
      byteSize: 10_000,
      width: 320,
      height: 240,
      sourceUrl: "https://example.test/a.gif",
    });
    const right = createMediaRecord({
      id: "right",
      sha256: "2".repeat(64),
      title: "Surprised cat reaction loop",
      tags: ["cat", "reaction"],
      byteSize: 9_800,
      width: 320,
      height: 240,
      sourceUrl: "https://example.test/b.gif",
    });
    const exact = createMediaRecord({
      id: "exact",
      sha256: left.sha256,
      title: left.title,
      tags: left.tags,
      byteSize: left.byteSize,
      width: left.width,
      height: left.height,
    });

    const result = scoreNearDuplicateCandidates([right, exact, left], {
      threshold: 0.7,
      maxComparisons: 10,
    });

    expect(result.comparisons).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.candidates.map(({ left: a, right: b }) => [a.id, b.id])).toContainEqual([
      "left",
      "right",
    ]);
    expect(result.candidates[0].reasons.map((reason) => reason.signal)).toEqual(
      expect.arrayContaining(["title", "dimensions", "file-size"]),
    );
    expect(result.candidates[0].reasons.map((reason) => reason.signal)).not.toContain("tags");
  });

  it("enforces the explicit near-duplicate comparison bound without altering records", () => {
    const records = Array.from({ length: 10 }, (_, index) =>
      createMediaRecord({
        id: String(index).padStart(2, "0"),
        sha256: String(index).padStart(64, "0"),
        title: "same title",
      }),
    );
    const snapshot = records.map(({ id, title, sha256 }) => ({ id, title, sha256 }));

    const result = scoreNearDuplicateCandidates(records, { maxComparisons: 4, threshold: 0 });

    expect(result.comparisons).toBe(4);
    expect(result.truncated).toBe(true);
    expect(records.map(({ id, title, sha256 }) => ({ id, title, sha256 }))).toEqual(snapshot);
    expect(HARD_MAX_NEAR_DUPLICATE_COMPARISONS).toBeGreaterThan(4);
  });
});
