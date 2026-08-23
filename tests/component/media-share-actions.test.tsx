import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MediaShareActions } from "../../src/popup/sharing/MediaShareActions";
import { createMediaRecord } from "../helpers/media-record";

describe("MediaShareActions", () => {
  it("reports binary copy from a click", async () => {
    const writeImage = vi.fn().mockResolvedValue({ method: "binary", mimeType: "image/gif" });
    const onUsage = vi.fn();
    render(
      <MediaShareActions
        item={createMediaRecord()}
        clipboardWriter={{ writeImage }}
        onUsage={onUsage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeImage).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Binary image copied.");
    expect(onUsage).toHaveBeenCalledWith("copy");
  });

  it("distinguishes a URL fallback and handles rejection", async () => {
    const writeImage = vi
      .fn()
      .mockResolvedValueOnce({ method: "url", url: "https://example.test/example.gif" })
      .mockRejectedValueOnce(new Error("denied"));
    render(<MediaShareActions item={createMediaRecord()} clipboardWriter={{ writeImage }} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Original URL copied because binary image copy was unavailable.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not copy this image or its original URL.",
      ),
    );
  });

  it("prepares a file drag payload for chat targets", () => {
    const onUsage = vi.fn();
    render(<MediaShareActions item={createMediaRecord()} onUsage={onUsage} />);
    const setData = vi.fn();
    const add = vi.fn();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag to chat" }), {
      dataTransfer: { setData, items: { add }, effectAllowed: "uninitialized" },
    });
    expect(add).toHaveBeenCalledOnce();
    expect(setData).toHaveBeenCalledWith(
      "text/uri-list",
      "# gopaste-media=018f0000-0000-7000-8000-000000000001\nhttps://example.test/example.gif",
    );
    expect(onUsage).toHaveBeenCalledWith("drag");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Dragging image file. Drop it into Messenger.",
    );
  });
});
