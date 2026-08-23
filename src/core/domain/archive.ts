import type { MediaExtension, SupportedMimeType } from "./media";

export interface ArchiveItemMetadata {
  file: `images/${string}.${MediaExtension}`;
  sha256: string;
  mimeType: SupportedMimeType;
  byteSize: number;
  title: string;
  tags: string[];
  sourceUrl: string;
  pageUrl?: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveMetadataV1 {
  format: "gopaste-archive";
  version: 1;
  exportedAt: string;
  items: ArchiveItemMetadata[];
}

export interface ArchiveEntryFailure {
  file?: string;
  code: string;
  message: string;
}

export interface ArchiveImportSummary {
  imported: number;
  duplicates: number;
  failed: number;
  failures: ArchiveEntryFailure[];
}
