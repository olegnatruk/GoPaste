import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardCategory } from "../../src/core/domain/dashboard";
import {
  DashboardShell,
  type DashboardLibraryService,
  type DashboardMediaRecord,
} from "../../src/dashboard/DashboardShell";
import { createMediaRecord } from "../helpers/media-record";

function dashboardRecord(overrides: Partial<DashboardMediaRecord> = {}): DashboardMediaRecord {
  return {
    ...createMediaRecord(),
    categoryIds: [],
    favorite: false,
    copyCount: 0,
    dragCount: 0,
    ...overrides,
  };
}

function createService(
  items: DashboardMediaRecord[] = [],
  overrides: Partial<DashboardLibraryService> = {},
): DashboardLibraryService {
  return {
    list: vi.fn().mockResolvedValue({ items, total: items.length }),
    updateMediaMetadata: vi.fn(async (id, update) => {
      const item = items.find((value) => value.id === id);
      if (!item) throw new Error("Item not found");
      return { ...item, ...update };
    }),
    batchUpdateMetadata: vi.fn(async (ids) => ({
      requested: ids.length,
      attempted: ids.length,
      succeeded: [...ids],
      failures: [],
    })),
    batchDeleteMedia: vi.fn(async (ids) => ({
      requested: ids.length,
      attempted: ids.length,
      succeeded: [...ids],
      failures: [],
    })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
    revokeObjectURL: vi.fn(),
  });
});

describe("DashboardShell", () => {
  it("shows actual overview values and exposes every dashboard section", async () => {
    const items = [
      dashboardRecord({
        id: "one",
        title: "Celebration",
        byteSize: 2048,
        favorite: true,
        copyCount: 3,
        dragCount: 2,
      }),
      dashboardRecord({ id: "two", title: "Concern", byteSize: 1024 }),
    ];
    render(<DashboardShell service={createService(items)} />);

    expect(
      await screen.findByRole("heading", { name: "Everything ready when the moment lands." }),
    ).toBeInTheDocument();
    expect(screen.getByText("3.0 KB")).toBeInTheDocument();
    expect(screen.getByText("50% of library")).toBeInTheDocument();
    expect(screen.getByText("5 recorded copy and drag actions.")).toBeInTheDocument();

    for (const label of [
      "Overview",
      "Library",
      "Categories & Tags",
      "Insights",
      "Maintenance",
      "Backup & Settings",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    const libraryHeading = await screen.findByRole("heading", { name: "Library" });
    expect(libraryHeading.closest(".dashboard-workspace")).toHaveAttribute(
      "data-section",
      "library",
    );
  });

  it("filters and sorts records, changes layout controls, and persists favorites", async () => {
    const items = [
      dashboardRecord({
        id: "laugh",
        title: "Big Laugh",
        tags: ["Funny"],
        favorite: false,
        sourceUrl: "https://giphy.test/laugh.gif",
        byteSize: 200,
      }),
      dashboardRecord({
        id: "wave",
        title: "Hello Wave",
        tags: ["Greeting"],
        favorite: true,
        sourceUrl: "https://tenor.test/wave.gif",
        byteSize: 400,
      }),
    ];
    const service = createService(items);
    render(<DashboardShell service={service} initialSection="library" />);

    expect(await screen.findByText("Big Laugh")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), {
      target: { value: "wave" },
    });
    expect(screen.queryByText("Big Laugh")).not.toBeInTheDocument();
    expect(screen.getByText("Hello Wave")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "compact grid density" }));
    expect(screen.getByRole("button", { name: "compact grid density" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Big Laugh to favorites" }));
    await waitFor(() =>
      expect(service.updateMediaMetadata).toHaveBeenCalledWith("laugh", { favorite: true }),
    );
    expect(screen.getByRole("button", { name: "Remove Big Laugh from favorites" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("supports selection, batch tagging, and confirmed batch deletion", async () => {
    const items = [
      dashboardRecord({ id: "one", title: "One" }),
      dashboardRecord({ id: "two", title: "Two" }),
    ];
    const service = createService(items);
    const confirmDelete = vi.fn().mockReturnValue(true);
    render(
      <DashboardShell service={service} initialSection="library" confirmDelete={confirmDelete} />,
    );

    expect(await screen.findByText("One")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select visible" }));
    expect(screen.getByRole("region", { name: "Bulk actions" })).toHaveTextContent("2 selected");

    fireEvent.change(screen.getByRole("textbox", { name: "Tag selected items" }), {
      target: { value: "Keeper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(service.batchUpdateMetadata).toHaveBeenCalledWith(["one", "two"], {
        addTags: ["Keeper"],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(service.batchDeleteMedia).toHaveBeenCalledWith(["one", "two"]));
    expect(confirmDelete).toHaveBeenCalledWith([
      expect.objectContaining({ id: "one", tags: ["reaction", "Keeper"] }),
      expect.objectContaining({ id: "two", tags: ["reaction", "Keeper"] }),
    ]);
    expect(screen.getByRole("heading", { name: "Save your first reaction" })).toBeInTheDocument();
  });

  it("adds a bulk category without replacing an image's existing categories", async () => {
    const categories = [
      {
        id: "reaction",
        name: "Reaction",
        color: "#2c6a42",
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "favorites",
        name: "Favorites",
        color: "#bdf45d",
        sortOrder: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] satisfies DashboardCategory[];
    const service = createService(
      [dashboardRecord({ id: "one", title: "One", categoryIds: ["reaction"] })],
      { listCategories: vi.fn().mockResolvedValue(categories) },
    );
    render(<DashboardShell service={service} initialSection="library" />);

    expect(await screen.findByText("One")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select visible" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Add selected items to category" }), {
      target: { value: "favorites" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(service.batchUpdateMetadata).toHaveBeenCalledWith(["one"], {
        addCategoryIds: ["favorites"],
      }),
    );
  });

  it("edits an item in the drawer and releases generated preview URLs", async () => {
    const item = dashboardRecord({ id: "edit", title: "Before", tags: ["Old"] });
    const service = createService([item]);
    const view = render(<DashboardShell service={service} initialSection="library" />);

    await screen.findByText("Before");
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    const drawer = screen.getByRole("dialog", { name: "Before" });
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "After" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), {
      target: { value: "New, new, Useful" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(service.updateMediaMetadata).toHaveBeenCalledWith("edit", {
        title: "After",
        tags: ["New", "Useful"],
        favorite: false,
      }),
    );
    expect(drawer).toHaveTextContent("After");

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("shows loading, empty, no-results, and recoverable error states", async () => {
    let rejectLoad: (error: Error) => void = () => undefined;
    const pending = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    const list = vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ items: [], total: 0 });
    const view = render(
      <DashboardShell service={createService([], { list })} initialSection="library" />,
    );

    expect(screen.getByRole("heading", { name: "Loading your library" })).toBeInTheDocument();
    rejectLoad(new Error("Database unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Save your first reaction" }),
    ).toBeInTheDocument();

    view.unmount();
    render(
      <DashboardShell
        service={createService([dashboardRecord({ title: "Only item" })])}
        initialSection="library"
      />,
    );
    await screen.findByText("Only item");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), {
      target: { value: "missing" },
    });
    expect(screen.getByRole("heading", { name: "Nothing fits these filters" })).toBeInTheDocument();
  });

  it("keeps the active workspace open while a parent-triggered reload refreshes its data", async () => {
    const service = createService([dashboardRecord({ id: "saved", title: "Saved" })]);
    const renderSection = vi.fn(() => <p>Category workspace stays open</p>);
    const view = render(
      <DashboardShell
        service={service}
        initialSection="taxonomy"
        reloadToken={0}
        renderSection={renderSection}
      />,
    );

    expect(await screen.findByText("Category workspace stays open")).toBeInTheDocument();
    view.rerender(
      <DashboardShell
        service={service}
        initialSection="taxonomy"
        reloadToken={1}
        renderSection={renderSection}
      />,
    );

    expect(await screen.findByText("Category workspace stays open")).toBeInTheDocument();
    await waitFor(() => expect(service.list).toHaveBeenCalledTimes(2));
  });
});
