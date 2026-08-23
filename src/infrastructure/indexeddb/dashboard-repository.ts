import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type BatchOperationFailure,
  type BatchOperationResult,
  type DashboardBatchMetadataUpdate,
  type DashboardCategory,
  type DashboardMediaQuery,
  type DashboardMediaRecord,
  type DashboardMetadataUpdate,
  type DashboardPreferences,
  type DashboardPreferenceUpdate,
  type DashboardStatistics,
  type ExactDuplicateGroup,
  type MediaUsage,
  type UsageAction,
} from "../../core/domain/dashboard";
import { ApplicationError } from "../../core/domain/errors";
import { LIMITS } from "../../core/domain/limits";
import type { MediaRecord, SupportedMimeType } from "../../core/domain/media";
import type { DashboardRepository } from "../../core/ports/dashboard-repository";
import {
  CATEGORIES_STORE,
  MEDIA_STORE,
  PREFERENCES_STORE,
  USAGE_STORE,
  openGoPasteDatabase,
} from "./schema";
import { requestResult, transactionComplete } from "./request";

const DEFAULT_CATEGORY_COLOR = "#516458";
const COLOR_PATTERN = /^#[\da-f]{6}$/i;

interface StoredDashboardMedia extends MediaRecord {
  normalizedTags?: string[];
  categoryIds?: unknown;
  favorite?: unknown;
  previewDataUrl?: unknown;
}

interface StoredCategory extends DashboardCategory {
  normalizedName: string;
}

function storageError(message: string, error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError("STORAGE_FAILED", message, undefined, { cause: error });
}

function uniqueStrings(values: unknown, normalizeCase = false): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    const key = normalizeCase ? trimmed.toLocaleLowerCase() : trimmed;
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizedTags(values: unknown): string[] {
  return uniqueStrings(values, true);
}

function normalizedIds(values: unknown): string[] {
  return uniqueStrings(values);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeUsage(value: Partial<MediaUsage> | undefined, mediaId: string): MediaUsage {
  return {
    mediaId,
    copyCount: nonNegativeInteger(value?.copyCount),
    dragCount: nonNegativeInteger(value?.dragCount),
    ...(validDate(value?.lastUsedAt) ? { lastUsedAt: value.lastUsedAt } : {}),
  };
}

function normalizeMedia(record: StoredDashboardMedia, usage?: MediaUsage): DashboardMediaRecord {
  const safeUsage = normalizeUsage(usage, record.id);
  const media = { ...record } as Partial<StoredDashboardMedia>;
  delete media.normalizedTags;
  delete media.categoryIds;
  delete media.favorite;
  delete media.previewDataUrl;
  return {
    ...(media as MediaRecord),
    tags: normalizedTags(record.tags),
    categoryIds: normalizedIds(record.categoryIds),
    favorite: record.favorite === true,
    copyCount: safeUsage.copyCount,
    dragCount: safeUsage.dragCount,
    previewDataUrl:
      typeof record.previewDataUrl === "string" && record.previewDataUrl
        ? record.previewDataUrl
        : undefined,
    ...(safeUsage.lastUsedAt ? { lastUsedAt: safeUsage.lastUsedAt } : {}),
  };
}

function toStoredMedia(
  current: StoredDashboardMedia,
  update: DashboardBatchMetadataUpdate,
): StoredDashboardMedia {
  let tags = update.tags ? normalizedTags(update.tags) : normalizedTags(current.tags);
  if (update.addTags) tags = normalizedTags([...tags, ...update.addTags]);
  if (update.removeTags) {
    const removed = new Set(
      normalizedTags(update.removeTags).map((tag) => tag.toLocaleLowerCase()),
    );
    tags = tags.filter((tag) => !removed.has(tag.toLocaleLowerCase()));
  }

  let categoryIds = update.categoryIds
    ? normalizedIds(update.categoryIds)
    : normalizedIds(current.categoryIds);
  if (update.addCategoryIds) {
    categoryIds = normalizedIds([...categoryIds, ...update.addCategoryIds]);
  }
  if (update.removeCategoryIds) {
    const removed = new Set(normalizedIds(update.removeCategoryIds));
    categoryIds = categoryIds.filter((id) => !removed.has(id));
  }

  const updated: StoredDashboardMedia = {
    ...current,
    ...(update.title !== undefined ? { title: update.title.trim() } : {}),
    tags,
    normalizedTags: tags.map((tag) => tag.toLocaleLowerCase()),
    categoryIds,
    ...(update.favorite !== undefined ? { favorite: update.favorite } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (update.clearPreview) delete updated.previewDataUrl;
  else if (update.previewDataUrl !== undefined) updated.previewDataUrl = update.previewDataUrl;
  return updated;
}

function normalizeCategory(category: DashboardCategory): StoredCategory {
  const id = category.id.trim();
  const name = category.name.trim();
  if (!id || !name) {
    throw new ApplicationError("VALIDATION_FAILED", "Categories need a stable ID and name.");
  }
  return {
    ...category,
    id,
    name,
    color: COLOR_PATTERN.test(category.color)
      ? category.color.toLocaleLowerCase()
      : DEFAULT_CATEGORY_COLOR,
    ...(category.parentId?.trim() ? { parentId: category.parentId.trim() } : {}),
    sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
    normalizedName: name.toLocaleLowerCase(),
  };
}

function toCategory(category: StoredCategory): DashboardCategory {
  const result = { ...category } as Partial<StoredCategory>;
  delete result.normalizedName;
  return result as DashboardCategory;
}

function sourceHosts(record: StoredDashboardMedia): string[] {
  const hosts: string[] = [];
  for (const value of [record.pageUrl, record.sourceUrl]) {
    if (!value) continue;
    try {
      hosts.push(new URL(value).hostname.toLocaleLowerCase());
    } catch {
      // Imported legacy URLs may be non-standard metadata strings.
    }
  }
  return hosts;
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareMedia(
  left: DashboardMediaRecord,
  right: DashboardMediaRecord,
  query: DashboardMediaQuery,
): number {
  const sortBy = query.sortBy ?? "createdAt";
  let comparison = 0;
  if (sortBy === "title") comparison = left.title.localeCompare(right.title);
  else if (sortBy === "byteSize") comparison = left.byteSize - right.byteSize;
  else if (sortBy === "usageCount") {
    comparison = left.copyCount + left.dragCount - (right.copyCount + right.dragCount);
  } else {
    comparison = timestamp(left[sortBy]) - timestamp(right[sortBy]);
  }
  const direction = query.sortDirection ?? (sortBy === "title" ? "ascending" : "descending");
  if (comparison !== 0) return direction === "ascending" ? comparison : -comparison;
  return left.id.localeCompare(right.id);
}

function matchesQuery(record: DashboardMediaRecord, query: DashboardMediaQuery): boolean {
  const search = query.search?.trim().toLocaleLowerCase();
  const tags = normalizedTags(query.tags).map((tag) => tag.toLocaleLowerCase());
  const recordTags = record.tags.map((tag) => tag.toLocaleLowerCase());
  const categories = normalizedIds(query.categoryIds);
  const website = query.sourceWebsite?.trim().toLocaleLowerCase();
  const created = timestamp(record.createdAt);
  return (
    (!search ||
      record.title.toLocaleLowerCase().includes(search) ||
      recordTags.some((tag) => tag.includes(search))) &&
    tags.every((tag) => recordTags.includes(tag)) &&
    categories.every((id) => record.categoryIds.includes(id)) &&
    (query.favorite === undefined || record.favorite === query.favorite) &&
    (query.minBytes === undefined || record.byteSize >= Math.max(0, query.minBytes)) &&
    (query.maxBytes === undefined || record.byteSize <= Math.max(0, query.maxBytes)) &&
    (!query.createdFrom || created >= timestamp(query.createdFrom)) &&
    (!query.createdTo || created <= timestamp(query.createdTo)) &&
    (!query.usedSince || timestamp(record.lastUsedAt) >= timestamp(query.usedSince)) &&
    (!website || sourceHosts(record).some((host) => host.includes(website)))
  );
}

async function getBoundedMedia(database: IDBDatabase): Promise<StoredDashboardMedia[]> {
  const records = (await requestResult(
    database
      .transaction(MEDIA_STORE)
      .objectStore(MEDIA_STORE)
      .getAll(undefined, LIMITS.maxArchiveItems + 1),
  )) as StoredDashboardMedia[];
  if (records.length > LIMITS.maxArchiveItems) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      `Dashboard operations are limited to ${LIMITS.maxArchiveItems} local items at a time.`,
    );
  }
  return records;
}

async function usageMap(database: IDBDatabase): Promise<Map<string, MediaUsage>> {
  const records = (await requestResult(
    database.transaction(USAGE_STORE).objectStore(USAGE_STORE).getAll(),
  )) as Partial<MediaUsage>[];
  return new Map(
    records
      .filter((record): record is Partial<MediaUsage> & { mediaId: string } =>
        Boolean(record && typeof record.mediaId === "string"),
      )
      .map((record) => [record.mediaId, normalizeUsage(record, record.mediaId)]),
  );
}

function batchFailure(id: string, error: unknown): BatchOperationFailure {
  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return { id, code: "NOT_FOUND", message: error.message };
  }
  return { id, code: "STORAGE_FAILED", message: "This local item could not be updated." };
}

export class IndexedDbDashboardRepository implements DashboardRepository {
  async list(query: DashboardMediaQuery) {
    try {
      const database = await openGoPasteDatabase();
      const records = await getBoundedMedia(database);
      const usages = await usageMap(database);
      const filtered = records
        .map((record) => normalizeMedia(record, usages.get(record.id)))
        .filter((record) => matchesQuery(record, query))
        .sort((left, right) => compareMedia(left, right, query));
      const cursorIndex = query.cursor
        ? filtered.findIndex((record) => record.id === query.cursor) + 1
        : 0;
      const start = cursorIndex > 0 ? cursorIndex : 0;
      const limit = Math.max(1, Math.min(Math.trunc(query.limit), LIMITS.maxPageSize));
      const items = filtered.slice(start, start + limit);
      return {
        items,
        total: filtered.length,
        ...(start + items.length < filtered.length && items.length
          ? { nextCursor: items[items.length - 1].id }
          : {}),
      };
    } catch (error) {
      throw storageError("The dashboard library could not be listed.", error);
    }
  }

  async getMedia(id: string): Promise<DashboardMediaRecord | undefined> {
    try {
      const database = await openGoPasteDatabase();
      const media = (await requestResult(
        database.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(id),
      )) as StoredDashboardMedia | undefined;
      if (!media) return undefined;
      const usage = (await requestResult(
        database.transaction(USAGE_STORE).objectStore(USAGE_STORE).get(id),
      )) as MediaUsage | undefined;
      return normalizeMedia(media, usage);
    } catch (error) {
      throw storageError("The dashboard item could not be read.", error);
    }
  }

  async updateMediaMetadata(
    id: string,
    update: DashboardMetadataUpdate,
  ): Promise<DashboardMediaRecord> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const current = (await requestResult(store.get(id))) as StoredDashboardMedia | undefined;
      if (!current) {
        transaction.abort();
        throw new ApplicationError("NOT_FOUND", "The image no longer exists.");
      }
      const updated = toStoredMedia(current, update);
      await requestResult(store.put(updated));
      await transactionComplete(transaction);
      const usage = await this.getUsage(id);
      return normalizeMedia(updated, usage);
    } catch (error) {
      throw storageError("The dashboard metadata could not be updated.", error);
    }
  }

  async batchUpdateMetadata(
    ids: readonly string[],
    update: DashboardBatchMetadataUpdate,
  ): Promise<BatchOperationResult> {
    const uniqueIds = normalizedIds(ids);
    const attemptedIds = uniqueIds.slice(0, LIMITS.maxArchiveItems);
    const failures: BatchOperationFailure[] = uniqueIds.slice(LIMITS.maxArchiveItems).map((id) => ({
      id,
      code: "LIMIT_EXCEEDED",
      message: `Only ${LIMITS.maxArchiveItems} items can be changed in one operation.`,
    }));
    const succeeded: string[] = [];
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      for (const id of attemptedIds) {
        const current = (await requestResult(store.get(id))) as StoredDashboardMedia | undefined;
        if (!current) {
          failures.push(batchFailure(id, new ApplicationError("NOT_FOUND", "Item not found.")));
          continue;
        }
        await requestResult(store.put(toStoredMedia(current, update)));
        succeeded.push(id);
      }
      await transactionComplete(transaction);
      return {
        requested: uniqueIds.length,
        attempted: attemptedIds.length,
        succeeded,
        failures,
      };
    } catch (error) {
      throw storageError("The batch metadata operation could not be completed.", error);
    }
  }

  async batchDeleteMedia(ids: readonly string[]): Promise<BatchOperationResult> {
    const uniqueIds = normalizedIds(ids);
    const attemptedIds = uniqueIds.slice(0, LIMITS.maxArchiveItems);
    const failures: BatchOperationFailure[] = uniqueIds.slice(LIMITS.maxArchiveItems).map((id) => ({
      id,
      code: "LIMIT_EXCEEDED",
      message: `Only ${LIMITS.maxArchiveItems} items can be deleted in one operation.`,
    }));
    const succeeded: string[] = [];
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction([MEDIA_STORE, USAGE_STORE], "readwrite");
      const media = transaction.objectStore(MEDIA_STORE);
      const usage = transaction.objectStore(USAGE_STORE);
      for (const id of attemptedIds) {
        if ((await requestResult(media.getKey(id))) === undefined) {
          failures.push({ id, code: "NOT_FOUND", message: "The image no longer exists." });
          continue;
        }
        await requestResult(media.delete(id));
        await requestResult(usage.delete(id));
        succeeded.push(id);
      }
      await transactionComplete(transaction);
      return {
        requested: uniqueIds.length,
        attempted: attemptedIds.length,
        succeeded,
        failures,
      };
    } catch (error) {
      throw storageError("The selected images could not be deleted.", error);
    }
  }

  async findExactDuplicateGroups(): Promise<ExactDuplicateGroup[]> {
    try {
      const records = await getBoundedMedia(await openGoPasteDatabase());
      const groups = new Map<string, StoredDashboardMedia[]>();
      for (const record of records) {
        const group = groups.get(record.sha256) ?? [];
        group.push(record);
        groups.set(record.sha256, group);
      }
      return [...groups.entries()]
        .filter(([, items]) => items.length > 1)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sha256, items]) => {
          const sorted = [...items].sort((left, right) => left.id.localeCompare(right.id));
          return {
            sha256,
            items: sorted.map(({ id, title, byteSize, createdAt }) => ({
              id,
              title,
              byteSize,
              createdAt,
            })),
            reclaimableBytes: sorted.slice(1).reduce((total, item) => total + item.byteSize, 0),
          };
        });
    } catch (error) {
      throw storageError("Exact duplicates could not be analyzed locally.", error);
    }
  }

  async listCategories(): Promise<DashboardCategory[]> {
    try {
      const records = (await requestResult(
        (await openGoPasteDatabase())
          .transaction(CATEGORIES_STORE)
          .objectStore(CATEGORIES_STORE)
          .getAll(),
      )) as StoredCategory[];
      return records
        .map(toCategory)
        .sort(
          (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
        );
    } catch (error) {
      throw storageError("Categories could not be read from this device.", error);
    }
  }

  async saveCategory(category: DashboardCategory): Promise<DashboardCategory> {
    try {
      const stored = normalizeCategory(category);
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(CATEGORIES_STORE, "readwrite");
      await requestResult(transaction.objectStore(CATEGORIES_STORE).put(stored));
      await transactionComplete(transaction);
      return toCategory(stored);
    } catch (error) {
      throw storageError("The category could not be saved on this device.", error);
    }
  }

  async deleteCategory(id: string): Promise<boolean> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(CATEGORIES_STORE, "readwrite");
      const store = transaction.objectStore(CATEGORIES_STORE);
      const exists = (await requestResult(store.getKey(id))) !== undefined;
      if (exists) await requestResult(store.delete(id));
      await transactionComplete(transaction);
      return exists;
    } catch (error) {
      throw storageError("The category could not be deleted from this device.", error);
    }
  }

  async getPreferences(): Promise<DashboardPreferences> {
    try {
      const stored = (await requestResult(
        (await openGoPasteDatabase())
          .transaction(PREFERENCES_STORE)
          .objectStore(PREFERENCES_STORE)
          .get(DEFAULT_DASHBOARD_PREFERENCES.key),
      )) as Partial<DashboardPreferences> | undefined;
      return this.normalizePreferences(stored);
    } catch (error) {
      throw storageError("Dashboard preferences could not be read from this device.", error);
    }
  }

  async updatePreferences(update: DashboardPreferenceUpdate): Promise<DashboardPreferences> {
    try {
      const current = await this.getPreferences();
      const updated = this.normalizePreferences({
        ...current,
        ...update,
        key: "dashboard",
        updatedAt: new Date().toISOString(),
      });
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(PREFERENCES_STORE, "readwrite");
      await requestResult(transaction.objectStore(PREFERENCES_STORE).put(updated));
      await transactionComplete(transaction);
      return updated;
    } catch (error) {
      throw storageError("Dashboard preferences could not be saved on this device.", error);
    }
  }

  async getUsage(mediaId: string): Promise<MediaUsage> {
    try {
      const stored = (await requestResult(
        (await openGoPasteDatabase())
          .transaction(USAGE_STORE)
          .objectStore(USAGE_STORE)
          .get(mediaId),
      )) as Partial<MediaUsage> | undefined;
      return normalizeUsage(stored, mediaId);
    } catch (error) {
      throw storageError("Local usage could not be read.", error);
    }
  }

  async listUsage(): Promise<MediaUsage[]> {
    try {
      const records = (await requestResult(
        (await openGoPasteDatabase()).transaction(USAGE_STORE).objectStore(USAGE_STORE).getAll(),
      )) as Partial<MediaUsage>[];
      return records
        .filter((record): record is Partial<MediaUsage> & { mediaId: string } =>
          Boolean(record && typeof record.mediaId === "string"),
        )
        .map((record) => normalizeUsage(record, record.mediaId))
        .sort(
          (left, right) =>
            timestamp(right.lastUsedAt) - timestamp(left.lastUsedAt) ||
            left.mediaId.localeCompare(right.mediaId),
        );
    } catch (error) {
      throw storageError("Local usage could not be listed.", error);
    }
  }

  async recordUsage(
    mediaId: string,
    action: UsageAction,
    usedAt = new Date().toISOString(),
  ): Promise<MediaUsage> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction([MEDIA_STORE, USAGE_STORE], "readwrite");
      const media = transaction.objectStore(MEDIA_STORE);
      if ((await requestResult(media.getKey(mediaId))) === undefined) {
        transaction.abort();
        throw new ApplicationError("NOT_FOUND", "The image no longer exists.");
      }
      const store = transaction.objectStore(USAGE_STORE);
      const current = normalizeUsage(
        (await requestResult(store.get(mediaId))) as Partial<MediaUsage> | undefined,
        mediaId,
      );
      const updated: MediaUsage = {
        ...current,
        ...(action === "copy"
          ? { copyCount: current.copyCount + 1 }
          : { dragCount: current.dragCount + 1 }),
        lastUsedAt: validDate(usedAt) ? usedAt : new Date().toISOString(),
      };
      await requestResult(store.put(updated));
      await transactionComplete(transaction);
      return updated;
    } catch (error) {
      throw storageError("Local usage could not be recorded.", error);
    }
  }

  async clearUsage(mediaId?: string): Promise<void> {
    try {
      const database = await openGoPasteDatabase();
      const transaction = database.transaction(USAGE_STORE, "readwrite");
      const store = transaction.objectStore(USAGE_STORE);
      await requestResult(mediaId ? store.delete(mediaId) : store.clear());
      await transactionComplete(transaction);
    } catch (error) {
      throw storageError("Local usage could not be cleared.", error);
    }
  }

  async getStatistics(): Promise<DashboardStatistics> {
    try {
      const database = await openGoPasteDatabase();
      const media = await getBoundedMedia(database);
      const usages = await usageMap(database);
      const statistics: DashboardStatistics = {
        itemCount: media.length,
        totalBytes: 0,
        favoriteCount: 0,
        untaggedCount: 0,
        unusedCount: 0,
        copyCount: 0,
        dragCount: 0,
        byMimeType: {},
        byCategoryId: {},
      };
      for (const stored of media) {
        const record = normalizeMedia(stored, usages.get(stored.id));
        statistics.totalBytes += record.byteSize;
        if (record.favorite) statistics.favoriteCount += 1;
        if (!record.tags.length) statistics.untaggedCount += 1;
        if (!record.copyCount && !record.dragCount) statistics.unusedCount += 1;
        statistics.copyCount += record.copyCount;
        statistics.dragCount += record.dragCount;
        const mime = record.mimeType as SupportedMimeType;
        const mimeStats = statistics.byMimeType[mime] ?? { itemCount: 0, totalBytes: 0 };
        mimeStats.itemCount += 1;
        mimeStats.totalBytes += record.byteSize;
        statistics.byMimeType[mime] = mimeStats;
        for (const categoryId of record.categoryIds) {
          const categoryStats = statistics.byCategoryId[categoryId] ?? {
            itemCount: 0,
            totalBytes: 0,
          };
          categoryStats.itemCount += 1;
          categoryStats.totalBytes += record.byteSize;
          statistics.byCategoryId[categoryId] = categoryStats;
        }
      }
      return statistics;
    } catch (error) {
      throw storageError("Dashboard statistics could not be calculated locally.", error);
    }
  }

  private normalizePreferences(
    value: Partial<DashboardPreferences> | undefined,
  ): DashboardPreferences {
    const themes = new Set(["system", "light", "dark"]);
    const densities = new Set(["compact", "comfortable", "spacious"]);
    const views = new Set(["grid", "list"]);
    const actions = new Set(["copy", "drag", "download"]);
    return {
      key: "dashboard",
      theme: themes.has(value?.theme ?? "")
        ? (value!.theme as DashboardPreferences["theme"])
        : DEFAULT_DASHBOARD_PREFERENCES.theme,
      accent:
        typeof value?.accent === "string" && COLOR_PATTERN.test(value.accent)
          ? value.accent.toLocaleLowerCase()
          : DEFAULT_DASHBOARD_PREFERENCES.accent,
      gridDensity: densities.has(value?.gridDensity ?? "")
        ? (value!.gridDensity as DashboardPreferences["gridDensity"])
        : DEFAULT_DASHBOARD_PREFERENCES.gridDensity,
      viewMode: views.has(value?.viewMode ?? "")
        ? (value!.viewMode as DashboardPreferences["viewMode"])
        : DEFAULT_DASHBOARD_PREFERENCES.viewMode,
      shortcutsEnabled:
        typeof value?.shortcutsEnabled === "boolean"
          ? value.shortcutsEnabled
          : DEFAULT_DASHBOARD_PREFERENCES.shortcutsEnabled,
      defaultAction: actions.has(value?.defaultAction ?? "")
        ? (value!.defaultAction as DashboardPreferences["defaultAction"])
        : DEFAULT_DASHBOARD_PREFERENCES.defaultAction,
      updatedAt: validDate(value?.updatedAt)
        ? value.updatedAt
        : DEFAULT_DASHBOARD_PREFERENCES.updatedAt,
    };
  }
}
