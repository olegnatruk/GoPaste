import { ApplicationError } from "../../core/domain/errors";
import { LIMITS } from "../../core/domain/limits";
import type { MediaPageQuery, MediaRecord } from "../../core/domain/media";
import type {
  BulkCreateMediaResult,
  CreateMediaResult,
  MediaRepository,
} from "../../core/ports/media-repository";
import { CREATED_AT_INDEX, HASH_INDEX, MEDIA_STORE, openGoPasteDatabase } from "./schema";
import { requestResult, transactionComplete } from "./request";

interface StoredMediaRecord extends MediaRecord {
  normalizedTags: string[];
}

function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function toStored(record: MediaRecord): StoredMediaRecord {
  const tags = normalizeTags(record.tags);
  return { ...record, tags, normalizedTags: tags.map((tag) => tag.toLocaleLowerCase()) };
}

function toMediaRecord(record: StoredMediaRecord): MediaRecord {
  const media = { ...record } as Partial<StoredMediaRecord>;
  delete media.normalizedTags;
  return media as MediaRecord;
}

function storageError(message: string, error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError("STORAGE_FAILED", message, undefined, { cause: error });
}

export class IndexedDbMediaRepository implements MediaRepository {
  async create(record: MediaRecord): Promise<CreateMediaResult> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const existing = (await requestResult(store.index(HASH_INDEX).get(record.sha256))) as
        StoredMediaRecord | undefined;
      if (existing) {
        transaction.abort();
        return { status: "duplicate", existingId: existing.id };
      }
      await requestResult(store.add(toStored(record)));
      await transactionComplete(transaction);
      return { status: "created", record: toMediaRecord(toStored(record)) };
    } catch (error) {
      throw storageError("The image could not be saved to local storage.", error);
    }
  }

  async getById(id: string): Promise<MediaRecord | undefined> {
    try {
      const database = await openGoPasteDatabase();
      const result = (await requestResult(
        database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(id),
      )) as StoredMediaRecord | undefined;
      return result ? toMediaRecord(result) : undefined;
    } catch (error) {
      throw storageError("The image could not be read from local storage.", error);
    }
  }

  async findByHash(sha256: string): Promise<MediaRecord | undefined> {
    try {
      const database = await openGoPasteDatabase();
      const store = database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE);
      const result = (await requestResult(store.index(HASH_INDEX).get(sha256))) as
        StoredMediaRecord | undefined;
      return result ? toMediaRecord(result) : undefined;
    } catch (error) {
      throw storageError("The image could not be read from local storage.", error);
    }
  }

  async list(query: MediaPageQuery) {
    try {
      const database = await openGoPasteDatabase();
      const store = database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE);
      const records = (await requestResult(
        store.index(CREATED_AT_INDEX).getAll(),
      )) as StoredMediaRecord[];
      records.sort((left, right) =>
        right.createdAt === left.createdAt
          ? right.id.localeCompare(left.id)
          : right.createdAt.localeCompare(left.createdAt),
      );

      const search = query.search?.trim().toLocaleLowerCase();
      const tags = normalizeTags(query.tags ?? []).map((tag) => tag.toLocaleLowerCase());
      const filtered = records.filter((record) => {
        const matchesSearch =
          !search ||
          record.title.toLocaleLowerCase().includes(search) ||
          record.normalizedTags.some((tag) => tag.includes(search));
        const matchesTags = tags.every((tag) => record.normalizedTags.includes(tag));
        return matchesSearch && matchesTags;
      });
      const cursorIndex = query.cursor
        ? filtered.findIndex((record) => record.id === query.cursor) + 1
        : 0;
      const start = cursorIndex > 0 ? cursorIndex : 0;
      const limit = Math.max(1, Math.min(query.limit, LIMITS.maxPageSize));
      const page = filtered.slice(start, start + limit);
      return {
        items: page.map(toMediaRecord),
        ...(start + page.length < filtered.length && page.length
          ? { nextCursor: page[page.length - 1].id }
          : {}),
      };
    } catch (error) {
      throw storageError("The library could not be listed.", error);
    }
  }

  async updateMetadata(
    id: string,
    update: { title?: string; tags?: string[] },
  ): Promise<MediaRecord> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const current = (await requestResult(store.get(id))) as StoredMediaRecord | undefined;
      if (!current) {
        transaction.abort();
        throw new ApplicationError("NOT_FOUND", "The image no longer exists.");
      }
      const tags = update.tags ? normalizeTags(update.tags) : current.tags;
      const updated: StoredMediaRecord = {
        ...current,
        ...(update.title !== undefined ? { title: update.title.trim() } : {}),
        tags,
        normalizedTags: tags.map((tag) => tag.toLocaleLowerCase()),
        updatedAt: new Date().toISOString(),
      };
      await requestResult(store.put(updated));
      await transactionComplete(transaction);
      return toMediaRecord(updated);
    } catch (error) {
      throw storageError("The image metadata could not be updated.", error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const exists = (await requestResult(store.getKey(id))) !== undefined;
      if (exists) await requestResult(store.delete(id));
      await transactionComplete(transaction);
      return exists;
    } catch (error) {
      throw storageError("The image could not be deleted.", error);
    }
  }

  async getStats() {
    try {
      const database = await openGoPasteDatabase();
      const records = (await requestResult(
        database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).getAll(),
      )) as StoredMediaRecord[];
      return {
        itemCount: records.length,
        totalBytes: records.reduce((total, record) => total + record.byteSize, 0),
      };
    } catch (error) {
      throw storageError("Storage totals could not be calculated.", error);
    }
  }

  async bulkCreate(records: readonly MediaRecord[]): Promise<BulkCreateMediaResult> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const seen = new Set<string>();
      let created = 0;
      let duplicates = 0;
      for (const record of records) {
        if (seen.has(record.sha256)) {
          duplicates += 1;
          continue;
        }
        seen.add(record.sha256);
        const existingKey = await requestResult(store.index(HASH_INDEX).getKey(record.sha256));
        if (existingKey !== undefined) {
          duplicates += 1;
          continue;
        }
        await requestResult(store.add(toStored(record)));
        created += 1;
      }
      await transactionComplete(transaction);
      return { created, duplicates };
    } catch (error) {
      throw storageError("The imported images could not be saved.", error);
    }
  }
}
