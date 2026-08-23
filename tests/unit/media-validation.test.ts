import { LIMITS } from "../../src/core/domain/limits";
import { sniffMediaType, validateMediaBlob } from "../../src/infrastructure/media/validation";

describe("media validation", () => {
  it.each([
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"],
  ] as const)("sniffs supported magic bytes", (bytes, expected) => {
    expect(sniffMediaType(new Uint8Array(bytes))).toBe(expected);
  });

  it("uses bytes instead of a misleading declared Blob MIME type", async () => {
    const blob = new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], {
      type: "text/html",
    });
    await expect(validateMediaBlob(blob)).resolves.toMatchObject({
      mimeType: "image/gif",
      extension: "gif",
      byteSize: 6,
    });
  });

  it("rejects unsupported bytes with a stable code", async () => {
    await expect(validateMediaBlob(new Blob(["not an image"]))).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA",
    });
  });

  it("rejects items larger than 25 MiB before reading their signature", async () => {
    const blob = new Blob([new Uint8Array(LIMITS.maxMediaBytes + 1)]);
    await expect(validateMediaBlob(blob)).rejects.toMatchObject({
      code: "ITEM_TOO_LARGE",
    });
  });
});
