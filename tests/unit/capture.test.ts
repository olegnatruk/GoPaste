import { CaptureImage, type CaptureStatusStore } from "../../src/background/capture";
import { ApplicationError } from "../../src/core/domain/errors";
import type { MediaRecord } from "../../src/core/domain/media";
import type { MediaRepository } from "../../src/core/ports/media-repository";
import type { CaptureStatus } from "../../src/shared/messages";

function gifBlob(): Blob {
  return new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])]);
}

function repositoryWithCreate(create: MediaRepository["create"]): MediaRepository {
  return {
    create,
    getById: vi.fn(),
    findByHash: vi.fn(),
    list: vi.fn(),
    updateMetadata: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
    bulkCreate: vi.fn(),
  };
}

describe("CaptureImage", () => {
  const fixedDate = new Date("2026-08-21T01:02:03.000Z");

  it("fetches, validates, hashes, and stores the selected srcUrl with page provenance", async () => {
    const statuses: CaptureStatus[] = [];
    const statusStore: CaptureStatusStore = {
      get: vi.fn(),
      set: vi.fn(async (status) => void statuses.push(status)),
    };
    let created: MediaRecord | undefined;
    const create: MediaRepository["create"] = async (record) => {
      created = record;
      return { status: "created", record };
    };
    const capture = new CaptureImage(
      repositoryWithCreate(vi.fn(create)),
      { fetch: vi.fn(async () => ({ blob: gifBlob(), declaredMimeType: "text/plain" })) },
      { sha256: vi.fn(async () => "a".repeat(64)) },
      statusStore,
      { now: () => fixedDate },
      { create: () => "new-id" },
    );

    await expect(
      capture.execute({
        sourceUrl: "https://images.test/path/happy.gif",
        pageUrl: "https://page.test/gallery",
      }),
    ).resolves.toMatchObject({ status: "created" });
    expect(created).toMatchObject({
      id: "new-id",
      title: "happy",
      sourceUrl: "https://images.test/path/happy.gif",
      pageUrl: "https://page.test/gallery",
      mimeType: "image/gif",
      extension: "gif",
      sha256: "a".repeat(64),
    });
    expect(statuses.map(({ state }) => state)).toEqual(["saving", "saved"]);
  });

  it("surfaces duplicates using the stable duplicate code", async () => {
    const set = vi.fn();
    const create: MediaRepository["create"] = async () => ({
      status: "duplicate",
      existingId: "existing",
    });
    const capture = new CaptureImage(
      repositoryWithCreate(vi.fn(create)),
      { fetch: vi.fn(async () => ({ blob: gifBlob() })) },
      { sha256: vi.fn(async () => "a".repeat(64)) },
      { get: vi.fn(), set },
      { now: () => fixedDate },
      { create: () => "new-id" },
    );
    await expect(capture.execute({ sourceUrl: "https://images.test/a.gif" })).resolves.toEqual({
      status: "duplicate",
      existingId: "existing",
    });
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "duplicate",
        itemId: "existing",
        error: expect.objectContaining({ code: "DUPLICATE" }),
      }),
    );
  });

  it("persists a stable failure status and leaves repository writes untouched", async () => {
    const create = vi.fn();
    const set = vi.fn();
    const capture = new CaptureImage(
      repositoryWithCreate(create),
      {
        fetch: vi.fn(async () => {
          throw new ApplicationError("FETCH_FAILED", "No response");
        }),
      },
      { sha256: vi.fn() },
      { get: vi.fn(), set },
      { now: () => fixedDate },
      { create: () => "new-id" },
    );
    await expect(capture.execute({ sourceUrl: "https://images.test/a.gif" })).rejects.toMatchObject(
      {
        code: "FETCH_FAILED",
      },
    );
    expect(create).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "failed",
        error: expect.objectContaining({ code: "FETCH_FAILED" }),
      }),
    );
  });
});
