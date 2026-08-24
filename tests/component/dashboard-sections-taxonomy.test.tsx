import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardCategory, DashboardMediaRecord } from "../../src/core/domain/dashboard";
import type { DashboardRepository } from "../../src/core/ports/dashboard-repository";
import { DashboardSections } from "../../src/dashboard/DashboardSections";
import { createMediaRecord } from "../helpers/media-record";

function item(overrides: Partial<DashboardMediaRecord> = {}): DashboardMediaRecord {
  return {
    ...createMediaRecord(),
    categoryIds: [],
    favorite: false,
    copyCount: 0,
    dragCount: 0,
    ...overrides,
  };
}

function createRepository(categories: DashboardCategory[]): DashboardRepository {
  return {
    list: vi.fn(),
    getMedia: vi.fn(),
    updateMediaMetadata: vi.fn(),
    batchUpdateMetadata: vi.fn(async (ids) => ({
      requested: ids.length,
      attempted: ids.length,
      succeeded: [...ids],
      failures: [],
    })),
    batchDeleteMedia: vi.fn(),
    findExactDuplicateGroups: vi.fn(),
    listCategories: vi.fn().mockResolvedValue(categories),
    saveCategory: vi.fn(async (category) => category),
    deleteCategory: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    getUsage: vi.fn(),
    listUsage: vi.fn(),
    recordUsage: vi.fn(),
    clearUsage: vi.fn(),
    getStatistics: vi.fn().mockResolvedValue({
      itemCount: 0,
      totalBytes: 0,
      favoriteCount: 0,
      untaggedCount: 0,
      unusedCount: 0,
      copyCount: 0,
      dragCount: 0,
      byMimeType: {},
      byCategoryId: {},
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:category-preview"),
    revokeObjectURL: vi.fn(),
  });
});

describe("Categories & Tags workspace", () => {
  it("uses category cards and adds selected newest-first images from a category card", async () => {
    const category = {
      id: "funny",
      name: "Funny",
      color: "#2c6a42",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies DashboardCategory;
    const oldest = item({
      id: "oldest",
      title: "Oldest",
      categoryIds: ["funny"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newest = item({ id: "newest", title: "Newest", createdAt: "2026-03-01T00:00:00.000Z" });
    const repository = createRepository([category]);
    const onLibraryChanged = vi.fn();
    vi.mocked(repository.getStatistics).mockResolvedValue({
      itemCount: 2,
      totalBytes: 12,
      favoriteCount: 0,
      untaggedCount: 0,
      unusedCount: 2,
      copyCount: 0,
      dragCount: 0,
      byMimeType: {},
      byCategoryId: { funny: { itemCount: 1, totalBytes: 6 } },
    });
    vi.mocked(repository.list).mockImplementation(async (query) => ({
      items: query.categoryIds?.includes("funny") ? [oldest] : [newest, oldest],
      total: query.categoryIds?.includes("funny") ? 1 : 2,
    }));

    render(
      <DashboardSections
        section="taxonomy"
        items={[oldest, newest]}
        repository={repository}
        mediaRepository={{} as never}
        onLibraryChanged={onLibraryChanged}
        onPreferencesChanged={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: /Funny/ });
    expect(screen.queryByText("Category manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Tag inventory")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New category/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Funny/ }));
    expect(await screen.findByRole("img", { name: "Oldest" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add images to Funny" }));

    const choices = await screen.findAllByRole("checkbox", { name: /Include/ });
    expect(choices.map((choice) => choice.getAttribute("aria-label"))).toEqual(["Include Newest"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Newest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 image" }));

    await waitFor(() =>
      expect(repository.batchUpdateMetadata).toHaveBeenCalledWith(["newest"], {
        addCategoryIds: ["funny"],
      }),
    );
    expect(onLibraryChanged).toHaveBeenCalledOnce();
  });
});
