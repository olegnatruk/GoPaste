import { ApplicationError } from "../../core/domain/errors";
import { LIMITS } from "../../core/domain/limits";
import type { MediaExtension, SupportedMimeType } from "../../core/domain/media";

export interface ValidatedMedia {
  blob: Blob;
  mimeType: SupportedMimeType;
  extension: MediaExtension;
  byteSize: number;
}

const SIGNATURE_READ_BYTES = 16;

export function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("The media bytes could not be read."));
    reader.readAsArrayBuffer(blob);
  });
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function sniffMediaType(bytes: Uint8Array): SupportedMimeType | undefined {
  if (
    bytes.length >= 6 &&
    (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  ) {
    return "image/gif";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return undefined;
}

export function extensionForMimeType(mimeType: SupportedMimeType): MediaExtension {
  switch (mimeType) {
    case "image/gif":
      return "gif";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
  }
}

export async function validateMediaBlob(blob: Blob): Promise<ValidatedMedia> {
  if (blob.size > LIMITS.maxMediaBytes) {
    throw new ApplicationError("ITEM_TOO_LARGE", "The image exceeds the 25 MiB item limit.", {
      maxBytes: LIMITS.maxMediaBytes,
      actualBytes: blob.size,
    });
  }

  const bytes = new Uint8Array(await readBlobArrayBuffer(blob.slice(0, SIGNATURE_READ_BYTES)));
  const mimeType = sniffMediaType(bytes);
  if (!mimeType) {
    throw new ApplicationError(
      "UNSUPPORTED_MEDIA",
      "The fetched file is not a supported GIF, PNG, JPEG, or WebP image.",
    );
  }

  return {
    blob,
    mimeType,
    extension: extensionForMimeType(mimeType),
    byteSize: blob.size,
  };
}
