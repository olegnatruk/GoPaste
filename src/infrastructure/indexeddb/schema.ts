import { DATABASE } from "../../core/domain/limits";

export const MEDIA_STORE = "media";
export const STATUS_STORE = "status";
export const CATEGORIES_STORE = "categories";
export const PREFERENCES_STORE = "preferences";
export const USAGE_STORE = "usage";
export const HASH_INDEX = "by-sha256";
export const CREATED_AT_INDEX = "by-created-at";
export const TAGS_INDEX = "by-normalized-tags";
export const FAVORITE_INDEX = "by-favorite";
export const LAST_USED_AT_INDEX = "by-last-used-at";
export const CATEGORY_NAME_INDEX = "by-normalized-name";
export const CATEGORY_PARENT_INDEX = "by-parent-id";
export const CATEGORY_SORT_INDEX = "by-sort-order";
export const USAGE_LAST_USED_AT_INDEX = "by-last-used-at";

export const DASHBOARD_DATABASE_VERSION = 2;

let databasePromise: Promise<IDBDatabase> | undefined;

export function openGoPasteDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DATABASE.name,
      Math.max(DATABASE.version, DASHBOARD_DATABASE_VERSION),
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      let media: IDBObjectStore;
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        media = database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        media.createIndex(HASH_INDEX, "sha256", { unique: true });
        media.createIndex(CREATED_AT_INDEX, "createdAt");
        media.createIndex(TAGS_INDEX, "normalizedTags", { multiEntry: true });
      } else {
        media = request.transaction!.objectStore(MEDIA_STORE);
      }
      if (!media.indexNames.contains(FAVORITE_INDEX)) {
        media.createIndex(FAVORITE_INDEX, "favorite");
      }
      if (!media.indexNames.contains(LAST_USED_AT_INDEX)) {
        media.createIndex(LAST_USED_AT_INDEX, "lastUsedAt");
      }
      if (!database.objectStoreNames.contains(STATUS_STORE)) {
        database.createObjectStore(STATUS_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(CATEGORIES_STORE)) {
        const categories = database.createObjectStore(CATEGORIES_STORE, { keyPath: "id" });
        categories.createIndex(CATEGORY_NAME_INDEX, "normalizedName");
        categories.createIndex(CATEGORY_PARENT_INDEX, "parentId");
        categories.createIndex(CATEGORY_SORT_INDEX, "sortOrder");
      }
      if (!database.objectStoreNames.contains(PREFERENCES_STORE)) {
        database.createObjectStore(PREFERENCES_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(USAGE_STORE)) {
        const usage = database.createObjectStore(USAGE_STORE, { keyPath: "mediaId" });
        usage.createIndex(USAGE_LAST_USED_AT_INDEX, "lastUsedAt");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
    request.onblocked = () =>
      reject(new Error("IndexedDB upgrade is blocked by another connection."));
  });
  return databasePromise;
}

export function closeGoPasteDatabase(): void {
  void databasePromise?.then((database) => database.close());
  databasePromise = undefined;
}
