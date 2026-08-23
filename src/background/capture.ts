import { ApplicationError, serializeApplicationError } from "../core/domain/errors";
import type { MediaRecord } from "../core/domain/media";
import type { MediaRepository } from "../core/ports/media-repository";
import type { Clock, ContentHasher, IdGenerator, MediaFetcher } from "../core/ports/platform";
import type { CaptureStatus } from "../shared/messages";
import { validateMediaBlob } from "../infrastructure/media/validation";

export interface CaptureStatusStore {
  get(): Promise<CaptureStatus>;
  set(status: CaptureStatus): Promise<void>;
}

export interface CaptureRequest {
  sourceUrl: string;
  pageUrl?: string;
  tabId?: number;
  frameId?: number;
}

export type CaptureResult =
  { status: "created"; record: MediaRecord } | { status: "duplicate"; existingId: string };

function titleFromUrl(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname;
    const segment = path.split("/").filter(Boolean).at(-1);
    if (segment) {
      const decoded = decodeURIComponent(segment)
        .replace(/\.(gif|png|jpe?g|webp)$/i, "")
        .trim();
      if (decoded) return decoded.slice(0, 200);
    }
  } catch {
    // URL validity is ultimately enforced by the fetch adapter.
  }
  return "Captured image";
}

export class CaptureImage {
  constructor(
    private readonly repository: MediaRepository,
    private readonly fetcher: MediaFetcher,
    private readonly hasher: ContentHasher,
    private readonly statusStore: CaptureStatusStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(request: CaptureRequest): Promise<CaptureResult> {
    await this.statusStore.set({ state: "saving", updatedAt: this.clock.now().toISOString() });
    try {
      const fetched = await this.fetcher.fetch(request.sourceUrl, {
        ...(request.tabId !== undefined ? { tabId: request.tabId } : {}),
        ...(request.frameId !== undefined ? { frameId: request.frameId } : {}),
      });
      const validated = await validateMediaBlob(fetched.blob);
      const sha256 = await this.hasher.sha256(validated.blob);
      const now = this.clock.now().toISOString();
      const record: MediaRecord = {
        id: this.ids.create(),
        blob: validated.blob,
        mimeType: validated.mimeType,
        extension: validated.extension,
        byteSize: validated.byteSize,
        sha256,
        title: titleFromUrl(request.sourceUrl),
        tags: [],
        sourceUrl: request.sourceUrl,
        ...(request.pageUrl ? { pageUrl: request.pageUrl } : {}),
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.repository.create(record);
      if (result.status === "duplicate") {
        await this.statusStore.set({
          state: "duplicate",
          updatedAt: this.clock.now().toISOString(),
          itemId: result.existingId,
          error: new ApplicationError("DUPLICATE", "This image is already in GoPaste.").toJSON(),
        });
        return result;
      }
      await this.statusStore.set({
        state: "saved",
        updatedAt: this.clock.now().toISOString(),
        itemId: result.record.id,
      });
      return result;
    } catch (error) {
      const applicationError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError("UNKNOWN", "The image could not be captured.", undefined, {
              cause: error,
            });
      await this.statusStore.set({
        state: "failed",
        updatedAt: this.clock.now().toISOString(),
        error: serializeApplicationError(applicationError),
      });
      throw applicationError;
    }
  }
}

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { create: () => crypto.randomUUID() };
