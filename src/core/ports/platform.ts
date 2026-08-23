import type { SupportedMimeType } from "../domain/media";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  create(): string;
}

export interface ContentHasher {
  sha256(blob: Blob): Promise<string>;
}

export interface MediaFetchResult {
  blob: Blob;
  declaredMimeType?: string;
}

export interface MediaFetchContext {
  tabId?: number;
  frameId?: number;
}

export interface MediaFetcher {
  fetch(url: string, context?: MediaFetchContext): Promise<MediaFetchResult>;
}

export type ClipboardWriteResult =
  { method: "binary"; mimeType: SupportedMimeType } | { method: "url"; url: string };

export interface ClipboardWriter {
  writeImage(blob: Blob, sourceUrl?: string): Promise<ClipboardWriteResult>;
}

export interface DownloadWriter {
  download(blob: Blob, filename: string): Promise<void>;
}
