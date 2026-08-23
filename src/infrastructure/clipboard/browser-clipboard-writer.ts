import { ApplicationError } from "../../core/domain/errors";
import { SUPPORTED_MIME_TYPES, type SupportedMimeType } from "../../core/domain/media";
import type { ClipboardWriteResult, ClipboardWriter } from "../../core/ports/platform";

export interface ClipboardAccess {
  write?(items: ClipboardItem[]): Promise<void>;
  writeText?(text: string): Promise<void>;
}

export interface ClipboardItemFactory {
  new (items: Record<string, Blob>): ClipboardItem;
  supports?(type: string): boolean;
}

export interface ClipboardEnvironment {
  clipboard?: ClipboardAccess;
  ClipboardItem?: ClipboardItemFactory;
}

export const GOPASTE_CLIPBOARD_MEDIA_PREFIX = "gopaste-media:";

function browserEnvironment(): ClipboardEnvironment {
  return {
    clipboard: navigator.clipboard,
    ClipboardItem: globalThis.ClipboardItem,
  };
}

function supportedBlobMimeType(blob: Blob): SupportedMimeType | undefined {
  const mimeType = blob.type.split(";", 1)[0].trim().toLocaleLowerCase();
  return SUPPORTED_MIME_TYPES.find((supported) => supported === mimeType);
}

/** Returns a URL that remains meaningful outside the extension, if one exists. */
export function portableSourceUrl(sourceUrl?: string): string | undefined {
  const value = sourceUrl?.trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function clipboardFailure(cause?: unknown): ApplicationError {
  return new ApplicationError(
    "CLIPBOARD_UNSUPPORTED",
    "This image could not be copied, and no portable source URL is available.",
    undefined,
    cause === undefined ? undefined : { cause },
  );
}

function clipboardPayload(mimeType: string, blob: Blob, mediaId?: string): Record<string, Blob> {
  const payload: Record<string, Blob> = { [mimeType]: blob };
  if (mediaId) {
    payload["text/plain"] = new Blob([`${GOPASTE_CLIPBOARD_MEDIA_PREFIX}${mediaId}`], {
      type: "text/plain",
    });
  }
  return payload;
}

export class BrowserClipboardWriter implements ClipboardWriter {
  constructor(private readonly getEnvironment: () => ClipboardEnvironment = browserEnvironment) {}

  async writeImage(
    blob: Blob,
    sourceUrl?: string,
    mediaId?: string,
  ): Promise<ClipboardWriteResult> {
    const environment = this.getEnvironment();
    const mimeType = supportedBlobMimeType(blob);
    let binaryFailure: unknown;

    if (
      mimeType &&
      environment.clipboard?.write &&
      environment.ClipboardItem &&
      (environment.ClipboardItem.supports?.(mimeType) ?? true)
    ) {
      try {
        const item = new environment.ClipboardItem(clipboardPayload(mimeType, blob, mediaId));
        await environment.clipboard.write([item]);
        return { method: "binary", mimeType };
      } catch (error) {
        binaryFailure = error;
      }
    }

    // Chromium exposes GIF, JPEG, and WebP clipboard writes as web custom formats rather than
    // native system-image formats. This keeps GoPaste's original bytes on the clipboard instead
    // of degrading the action into a URL copy.
    if (mimeType && environment.clipboard?.write && environment.ClipboardItem) {
      try {
        const item = new environment.ClipboardItem(
          clipboardPayload(`web ${mimeType}`, blob, mediaId),
        );
        await environment.clipboard.write([item]);
        return { method: "binary", mimeType };
      } catch (error) {
        binaryFailure = error;
      }
    }

    const url = portableSourceUrl(sourceUrl);
    if (!url || !environment.clipboard?.writeText) {
      throw clipboardFailure(binaryFailure);
    }

    try {
      await environment.clipboard.writeText(url);
      return { method: "url", url };
    } catch (error) {
      throw clipboardFailure(error);
    }
  }
}
