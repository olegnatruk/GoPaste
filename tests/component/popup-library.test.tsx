import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupShell, type PopupLibrary } from "../../src/popup/PopupShell";
import { createMediaRecord } from "../helpers/media-record";

function createLibrary(overrides: Partial<PopupLibrary> = {}): PopupLibrary {
  return {
    list: vi.fn().mockResolvedValue({ items: [] }),
    listCategories: vi.fn().mockResolvedValue([]),
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

  it("filters by dashboard category without showing a popup search field", async () => {
    const funny = createMediaRecord({ id: "funny", title: "Big Laugh", tags: ["Funny"] });
    const library = createLibrary({
      list: vi.fn().mockResolvedValue({ items: [funny] }),
      listCategories: vi.fn().mockResolvedValue([
        {
          id: "funny-category",
          name: "Funny",
          color: "#2c6a42",
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    });
    render(<PopupShell library={library} />);

    expect(await screen.findByText("Big Laugh")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByRole("combobox", { name: "Category" }), {
      target: { value: "funny-category" },
    });
    await waitFor(() =>
      expect(library.list).toHaveBeenLastCalledWith({
        limit: 24,
        categoryIds: ["funny-category"],
      }),
    );
  });

  it("does not display the saved capture confirmation", async () => {
    const loadCaptureStatus = vi
      .fn()
      .mockResolvedValue({ state: "saved", updatedAt: "2026-08-21T00:00:00.000Z" });
    render(<PopupShell library={createLibrary()} loadCaptureStatus={loadCaptureStatus} />);

    await waitFor(() => expect(loadCaptureStatus).toHaveBeenCalledOnce());
    expect(screen.queryByText("Image saved to your library.")).not.toBeInTheDocument();
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
