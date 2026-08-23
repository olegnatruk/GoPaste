import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupShell, type PopupLibrary } from "../../src/popup/PopupShell";
import { createMediaRecord } from "../helpers/media-record";

function createLibrary(overrides: Partial<PopupLibrary> = {}): PopupLibrary {
  return {
    list: vi.fn().mockResolvedValue({ items: [] }),
    updateMetadata: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:test-preview"),
    revokeObjectURL: vi.fn(),
  });
});

describe("PopupShell", () => {
  it("shows loading, empty, error, and capture status states", async () => {
    let rejectLoad: (error: Error) => void = () => undefined;
    const loading = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    const library = createLibrary({ list: vi.fn().mockReturnValue(loading) });

    const view = render(
      <PopupShell
        library={library}
        loadCaptureStatus={() =>
          Promise.resolve({ state: "duplicate", updatedAt: "2026-08-21T00:00:00.000Z" })
        }
      />,
    );

    expect(screen.getByText("Loading your library…")).toBeInTheDocument();
    expect(await screen.findByText("That image is already in your library.")).toBeInTheDocument();
    rejectLoad(new Error("Database unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");

    view.unmount();
    render(<PopupShell library={createLibrary()} />);
    expect(
      await screen.findByRole("heading", { name: "Your library is empty" }),
    ).toBeInTheDocument();
  });

  it("queries title/tag search and category filters case-insensitively through the repository", async () => {
    const funny = createMediaRecord({ id: "funny", title: "Big Laugh", tags: ["Funny"] });
    const library = createLibrary({ list: vi.fn().mockResolvedValue({ items: [funny] }) });
    render(<PopupShell library={library} />);

    expect(await screen.findByText("Big Laugh")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), {
      target: { value: "LAUGH" },
    });
    await waitFor(() =>
      expect(library.list).toHaveBeenLastCalledWith({ limit: 24, search: "LAUGH" }),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "Funny" },
    });
    await waitFor(() =>
      expect(library.list).toHaveBeenLastCalledWith({
        limit: 24,
        search: "LAUGH",
        tags: ["Funny"],
      }),
    );
  });

  it("normalizes metadata edits and updates the rendered item", async () => {
    const item = createMediaRecord({ id: "edit-me", title: "Old title", tags: ["Old"] });
    const updated = { ...item, title: "New title", tags: ["Funny", "Reaction"] };
    const library = createLibrary({
      list: vi.fn().mockResolvedValue({ items: [item] }),
      updateMetadata: vi.fn().mockResolvedValue(updated),
    });
    render(<PopupShell library={library} />);

    const card = await screen.findByRole("article", { name: "Old title" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(card).getByRole("textbox", { name: "Title" }), {
      target: { value: "New title" },
    });
    fireEvent.change(within(card).getByRole("textbox", { name: "Tags" }), {
      target: { value: " Funny, funny, Reaction,  " },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(library.updateMetadata).toHaveBeenCalledWith("edit-me", {
        title: "New title",
        tags: ["Funny", "Reaction"],
      }),
    );
    expect(await screen.findByText("New title")).toBeInTheDocument();
  });

  it("requires confirmation before deletion and announces success", async () => {
    const item = createMediaRecord({ id: "delete-me", title: "Delete me" });
    const confirmDelete = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const library = createLibrary({
      list: vi.fn().mockResolvedValue({ items: [item] }),
      delete: vi.fn().mockResolvedValue(true),
    });
    render(<PopupShell library={library} confirmDelete={confirmDelete} />);

    const deleteButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    expect(library.delete).not.toHaveBeenCalled();
    fireEvent.click(deleteButton);

    await waitFor(() => expect(library.delete).toHaveBeenCalledWith("delete-me"));
    expect(screen.queryByText("Delete me")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Image deleted.");
  });

  it("loads pages incrementally and cleans up generated URLs and subscriptions", async () => {
    const first = createMediaRecord({ id: "first", title: "Newest" });
    const second = createMediaRecord({ id: "second", title: "Older" });
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "first" })
      .mockResolvedValueOnce({ items: [second] });
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const view = render(
      <PopupShell
        library={createLibrary({ list })}
        subscribeToLibraryChanges={subscribe}
        renderShareActions={(item) => <button type="button">Share {item.title}</button>}
      />,
    );

    expect(await screen.findByText("Newest")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Newest" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ limit: 24, cursor: "first" });

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
