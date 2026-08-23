import { ApplicationError } from "../../src/core/domain/errors";
import {
  BrowserClipboardWriter,
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

  it("copies the original URL when the MIME type is unsupported by ClipboardItem", async () => {
    FakeClipboardItem.supported = false;
    const write = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const environment: ClipboardEnvironment = {
      clipboard: { write, writeText },
      ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    };

    await expect(
      new BrowserClipboardWriter(() => environment).writeImage(
        new Blob(["gif"], { type: "image/gif" }),
        " https://example.test/reaction.gif ",
      ),
    ).resolves.toEqual({
      method: "url",
      url: "https://example.test/reaction.gif",
    });
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("https://example.test/reaction.gif");
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
