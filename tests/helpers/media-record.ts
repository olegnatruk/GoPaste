import type { MediaRecord } from "../../src/core/domain/media";

export function createMediaRecord(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "018f0000-0000-7000-8000-000000000001",
    blob: new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], {
      type: "image/gif",
    }),
    mimeType: "image/gif",
    extension: "gif",
    byteSize: 6,
    sha256: "0".repeat(64),
    title: "Example",
    tags: ["reaction"],
    sourceUrl: "https://example.test/example.gif",
    pageUrl: "https://example.test/",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}
