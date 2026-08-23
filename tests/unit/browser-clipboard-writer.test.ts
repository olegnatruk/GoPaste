import { ApplicationError } from "../../src/core/domain/errors";
import {
  BrowserClipboardWriter,
  GOPASTE_CLIPBOARD_MEDIA_PREFIX,
  portableSourceUrl,
  type ClipboardEnvironment,
} from "../../src/infrastructure/clipboard/browser-clipboard-writer";

class FakeClipboardItem {
  static supported = true;
  static supports() {
    return FakeClipboardItem.supported;
  }

  constructor(readonly items: Record<string, Blob>) {}
}

describe("BrowserClipboardWriter", () => {
  const png = new Blob(["png"], { type: "image/png" });

  it("writes a supported binary image", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const environment: ClipboardEnvironment = {
      clipboard: { write, writeText },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    await expect(new BrowserClipboardWriter(() => environment).writeImage(png)).resolves.toEqual({
      method: "binary",
      mimeType: "image/png",
    });
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("includes a private media marker when the caller supplies an item ID", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const environment: ClipboardEnvironment = {
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    await new BrowserClipboardWriter(() => environment).writeImage(png, undefined, "saved-item");

    const item = write.mock.calls[0]?.[0][0] as FakeClipboardItem;
    const marker = item.items["text/plain"];
    expect(marker).toMatchObject({ type: "text/plain" });
    expect(marker?.size).toBe(`${GOPASTE_CLIPBOARD_MEDIA_PREFIX}saved-item`.length);
  });

  it("writes the original bytes as a Chrome web image format when the native type is unavailable", async () => {
    FakeClipboardItem.supported = false;
    const write = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const environment: ClipboardEnvironment = {
      clipboard: { write, writeText },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    const gif = new Blob(["gif"], { type: "image/gif" });
    await expect(new BrowserClipboardWriter(() => environment).writeImage(gif)).resolves.toEqual({
      method: "binary",
      mimeType: "image/gif",
    });
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith([
      expect.objectContaining({ items: { "web image/gif": gif } }),
    ]);
    expect(writeText).not.toHaveBeenCalled();
    FakeClipboardItem.supported = true;
  });

  it("falls back to the URL when a binary permission or type write is rejected", async () => {
    const write = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const environment: ClipboardEnvironment = {
      clipboard: { write, writeText },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    await expect(
      new BrowserClipboardWriter(() => environment).writeImage(
        png,
        "https://example.test/image.png",
      ),
    ).resolves.toEqual({ method: "url", url: "https://example.test/image.png" });
  });

  it("reports a stable error when both binary and URL writes fail", async () => {
    const environment: ClipboardEnvironment = {
      clipboard: {
        write: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
        writeText: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    const promise = new BrowserClipboardWriter(() => environment).writeImage(
      png,
      "https://example.test/image.png",
    );
    await expect(promise).rejects.toMatchObject({
      code: "CLIPBOARD_UNSUPPORTED",
    } satisfies Partial<ApplicationError>);
  });

  it("rejects a missing or non-portable fallback source", async () => {
    const writer = new BrowserClipboardWriter(() => ({ clipboard: {} }));

    await expect(writer.writeImage(png)).rejects.toMatchObject({
      code: "CLIPBOARD_UNSUPPORTED",
    });
    await expect(writer.writeImage(png, "blob:chrome-extension://id/value")).rejects.toMatchObject({
      code: "CLIPBOARD_UNSUPPORTED",
    });
  });

  it("recognizes only portable HTTP(S) source URLs", () => {
    expect(portableSourceUrl("https://example.test/a.gif")).toBe("https://example.test/a.gif");
    expect(portableSourceUrl("chrome-extension://id/a.gif")).toBeUndefined();
    expect(portableSourceUrl("not a url")).toBeUndefined();
  });
});
