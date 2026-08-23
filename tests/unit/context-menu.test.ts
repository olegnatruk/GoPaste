import {
  CAPTURE_MENU_ID,
  captureRequestFromContextClick,
  registerCaptureContextMenu,
  type ContextMenuApi,
} from "../../src/background/context-menu";

describe("capture context menu", () => {
  it("removes the stable id before creating the image-only menu", () => {
    const create = vi.fn(() => CAPTURE_MENU_ID);
    const api: ContextMenuApi = {
      remove: vi.fn((_id, callback) => callback()),
      create,
    };
    registerCaptureContextMenu(api);
    expect(api.remove).toHaveBeenCalledWith(CAPTURE_MENU_ID, expect.any(Function));
    expect(create).toHaveBeenCalledWith(
      {
        id: CAPTURE_MENU_ID,
        title: "Save to GoPaste",
        contexts: ["image"],
      },
      expect.any(Function),
    );
  });

  it("builds capture provenance from the clicked srcUrl and tab page URL", () => {
    expect(
      captureRequestFromContextClick(
        {
          frameId: 7,
          menuItemId: CAPTURE_MENU_ID,
          mediaType: "image",
          srcUrl: "https://cdn.test/a.gif",
        },
        { id: 42, url: "https://page.test/gallery" },
      ),
    ).toEqual({
      sourceUrl: "https://cdn.test/a.gif",
      pageUrl: "https://page.test/gallery",
      tabId: 42,
      frameId: 7,
    });
    expect(
      captureRequestFromContextClick({
        frameId: 0,
        menuItemId: "other",
        mediaType: "image",
        srcUrl: "https://cdn.test/a.gif",
      }),
    ).toBeUndefined();
  });
});
