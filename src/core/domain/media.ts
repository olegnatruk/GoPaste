export const SUPPORTED_MIME_TYPES = ["image/gif", "image/png", "image/jpeg", "image/webp"] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const MEDIA_EXTENSIONS = ["gif", "png", "jpg", "webp"] as const;

export type MediaExtension = (typeof MEDIA_EXTENSIONS)[number];

export interface MediaRecord {
  id: string;
  blob: Blob;
  mimeType: SupportedMimeType;
  extension: MediaExtension;
  byteSize: number;
  sha256: string;
  title: string;
  tags: string[];
  sourceUrl: string;
  pageUrl?: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaMetadataUpdate {
  title?: string;
  tags?: string[];
}

export interface MediaPageQuery {
  cursor?: string;
  limit: number;
  search?: string;
  tags?: string[];
}

export interface MediaPage {
  items: MediaRecord[];
  nextCursor?: string;
}

export interface StorageStats {
  itemCount: number;
  totalBytes: number;
}
