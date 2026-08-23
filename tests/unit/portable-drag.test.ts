import {
  setImageFileDragData,
  setPortableDragData,
} from "../../src/infrastructure/clipboard/portable-drag";
import { createMediaRecord } from "../helpers/media-record";

describe("setPortableDragData", () => {
  it("sets standards-compatible URL and plain-text payloads", () => {
    const values = new Map<string, string>();
    const transfer = {
      effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
    };

    expect(setPortableDragData(transfer, "https://example.test/image.gif")).toBe(true);
    expect(transfer.effectAllowed).toBe("copy");
    expect(values).toEqual(
      new Map([
        ["text/uri-list", "https://example.test/image.gif"],
        ["text/plain", "https://example.test/image.gif"],
      ]),
    );
  });

  it.each([undefined, "", "blob:chrome-extension://id/value", "chrome-extension://id/value"])(
    "does not advertise a non-portable source: %s",
    (sourceUrl) => {
      const transfer = {
        effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
        setData: vi.fn(),
      };
      expect(setPortableDragData(transfer, sourceUrl)).toBe(false);
      expect(transfer.setData).not.toHaveBeenCalled();
    },
  );

  it("handles an unavailable DataTransfer", () => {
    expect(setPortableDragData(null, "https://example.test/image.gif")).toBe(false);
  });
});

describe("setImageFileDragData", () => {
  it("adds a real image file synchronously and retains a portable URL fallback", () => {
    const values = new Map<string, string>();
    const add = vi.fn();
    const transfer = {
      effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
      items: { add },
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
    };

    expect(setImageFileDragData(transfer, createMediaRecord({ title: "Big / Laugh" }))).toBe(
      "file",
    );
    expect(transfer.effectAllowed).toBe("copy");
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]?.[0]).toMatchObject({ name: "Big - Laugh.gif", type: "image/gif" });
    expect(values.get("text/uri-list")).toBe(
      "# gopaste-media=018f0000-0000-7000-8000-000000000001\nhttps://example.test/example.gif",
    );
    expect(values.get("application/x-gopaste-media")).toBe("018f0000-0000-7000-8000-000000000001");
  });

  it("falls back to a source link only when file drag cannot be created", () => {
    const setData = vi.fn();
    const transfer = {
      effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
      items: {
        add: vi.fn(() => {
          throw new DOMException("blocked");
        }),
      },
      setData,
    };

    expect(setImageFileDragData(transfer, createMediaRecord())).toBe("url");
    expect(setData).toHaveBeenCalledWith("text/uri-list", "https://example.test/example.gif");
  });
});
