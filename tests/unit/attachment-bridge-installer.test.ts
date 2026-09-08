import { describe, expect, it, vi } from "vitest";

import { installAttachmentBridgeInOpenTabs } from "../../src/attachment-bridge-installer";

describe("attachment bridge installer", () => {
  it("injects the bridge into every open tab and all of its frames", async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { id: 1, url: "https://chat.example.test" },
        { id: 2, url: "http://upload.example.test" },
        { id: 3, url: "chrome://extensions" },
        { id: 4, url: "chrome-extension://extension-id/popup.html" },
        { id: 5 },
      ]);
    const executeScript = vi.fn().mockResolvedValue([]);

    await installAttachmentBridgeInOpenTabs({
      tabs: { query },
      scripting: { executeScript },
    });

    expect(query).toHaveBeenCalledWith({});
    expect(executeScript).toHaveBeenCalledTimes(5);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, allFrames: true },
      files: ["assets/attachment-bridge.js"],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 2, allFrames: true },
      files: ["assets/attachment-bridge.js"],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 3, allFrames: true },
      files: ["assets/attachment-bridge.js"],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 4, allFrames: true },
      files: ["assets/attachment-bridge.js"],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 5, allFrames: true },
      files: ["assets/attachment-bridge.js"],
    });
  });

  it("does not fail the popup when one target page rejects injection", async () => {
    const executeScript = vi.fn().mockRejectedValue(new Error("Cannot access contents of url"));

    await expect(
      installAttachmentBridgeInOpenTabs({
        tabs: { query: vi.fn().mockResolvedValue([{ id: 1, url: "https://example.test" }]) },
        scripting: { executeScript },
      }),
    ).resolves.toBeUndefined();
  });
});
