import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupShell, type PopupLibrary } from "../../src/popup/PopupShell";
import { createMediaRecord } from "../helpers/media-record";

function createLibrary(overrides: Partial<PopupLibrary> = {}): PopupLibrary {
  return {
    list: vi.fn().mockResolvedValue({ items: [] }),
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

  it("uses the image itself as the clean click-and-drag surface", async () => {
    const item = createMediaRecord({ id: "drag-me", title: "Big Laugh" });
    const onDragUsage = vi.fn();
    render(
      <PopupShell
        library={createLibrary({ list: vi.fn().mockResolvedValue({ items: [item] }) })}
        onDragUsage={onDragUsage}
      />,
    );

    const image = await screen.findByRole("button", {
      name: "Copy Big Laugh to clipboard; drag to Messenger",
    });
    const setData = vi.fn();
    const add = vi.fn();
    fireEvent.dragStart(image, {
      dataTransfer: { setData, items: { add }, effectAllowed: "uninitialized" },
    });

    expect(add).toHaveBeenCalledOnce();
    expect(onDragUsage).toHaveBeenCalledWith(item);
    expect(screen.queryByText("Drag to chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("copies a thumbnail as binary media without supplying a source URL", async () => {
    const item = createMediaRecord({ id: "copy-me", title: "Copy me" });
    const writeImage = vi.fn().mockResolvedValue({ method: "binary", mimeType: "image/gif" });
    const onCopyUsage = vi.fn();
    render(
      <PopupShell
        library={createLibrary({ list: vi.fn().mockResolvedValue({ items: [item] }) })}
        clipboardWriter={{ writeImage }}
        onCopyUsage={onCopyUsage}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Copy Copy me to clipboard; drag to Messenger",
      }),
    );

    await waitFor(() => expect(writeImage).toHaveBeenCalledWith(item.blob, undefined, item.id));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Image copied. Paste in Messenger to attach it.",
    );
    expect(onCopyUsage).toHaveBeenCalledWith(item);
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
      <PopupShell library={createLibrary({ list })} subscribeToLibraryChanges={subscribe} />,
    );

    expect(await screen.findByText("Newest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ limit: 24, cursor: "first" });

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
