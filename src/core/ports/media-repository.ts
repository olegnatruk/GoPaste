import type {
  MediaMetadataUpdate,
  MediaPage,
  MediaPageQuery,
  MediaRecord,
  StorageStats,
} from "../domain/media";

export type CreateMediaResult =
  { status: "created"; record: MediaRecord } | { status: "duplicate"; existingId: string };

export interface BulkCreateMediaResult {
  created: number;
  duplicates: number;
}

export interface MediaRepository {
  create(record: MediaRecord): Promise<CreateMediaResult>;
  getById(id: string): Promise<MediaRecord | undefined>;
  findByHash(sha256: string): Promise<MediaRecord | undefined>;
  list(query: MediaPageQuery): Promise<MediaPage>;
  updateMetadata(id: string, update: MediaMetadataUpdate): Promise<MediaRecord>;
  delete(id: string): Promise<boolean>;
  getStats(): Promise<StorageStats>;
  bulkCreate(records: readonly MediaRecord[]): Promise<BulkCreateMediaResult>;
}
