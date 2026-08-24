import type { MediaRecord } from "../domain/media";

const DEFAULT_RECENT_LIMIT = 8;
const DEFAULT_NEAR_DUPLICATE_LIMIT = 100;
const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.72;

export const HARD_MAX_NEAR_DUPLICATE_COMPARISONS = 25_000;

const TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "asset",
  "cdn",
  "com",
  "file",
  "gif",
  "gifs",
  "image",
  "images",
  "img",
  "jpeg",
  "jpg",
  "media",
  "net",
  "org",
  "png",
  "static",
  "the",
  "webp",
  "www",
]);

type UnknownRecord = Record<string, unknown>;

export interface DashboardMetadataSnapshot {
  categories: string[];
  favorite: boolean;
  copyCount: number;
  dragCount: number;
  lastUsedAt?: string;
}

export interface DashboardRecordFilters {
  sourceHosts?: readonly string[];
  dateAddedFrom?: string | Date;
  dateAddedTo?: string | Date;
  minByteSize?: number;
  maxByteSize?: number;
  categories?: readonly string[];
  matchAllCategories?: boolean;
}

export interface StorageBucket {
  key: string;
  itemCount: number;
  totalBytes: number;
}

export interface DashboardStorageSummary {
  itemCount: number;
  totalBytes: number;
  averageBytes: number;
  byMimeType: StorageBucket[];
  byCategory: StorageBucket[];
}

export interface RecordUsageSummary {
  record: MediaRecord;
  copyCount: number;
  dragCount: number;
  totalActions: number;
  lastUsedAt?: string;
}

export interface CategoryUsageSummary {
  categoryId: string;
  itemCount: number;
  copyCount: number;
  dragCount: number;
  totalActions: number;
}

export interface DashboardUsageSummary {
  totalCopyCount: number;
  totalDragCount: number;
  totalActions: number;
  usedItemCount: number;
  byRecord: RecordUsageSummary[];
  byCategory: CategoryUsageSummary[];
}

export interface DashboardOverview {
  itemCount: number;
  favoriteCount: number;
  neverUsedCount: number;
  storage: DashboardStorageSummary;
  usage: DashboardUsageSummary;
  favorites: MediaRecord[];
  recentlySaved: MediaRecord[];
  recentlyUsed: RecordUsageSummary[];
}

export interface DashboardOverviewOptions {
  recentLimit?: number;
}

export interface ExactDuplicateGroup {
  sha256: string;
  records: MediaRecord[];
  totalBytes: number;
  reclaimableBytes: number;
}

export type NearDuplicateSignal =
  "title" | "dimensions" | "file-size" | "source-host" | "mime-type";

export interface NearDuplicateReason {
  signal: NearDuplicateSignal;
  similarity: number;
  contribution: number;
}

export interface NearDuplicateCandidate {
  left: MediaRecord;
  right: MediaRecord;
  score: number;
  reasons: NearDuplicateReason[];
}

export interface NearDuplicateOptions {
  threshold?: number;
  limit?: number;
  maxComparisons?: number;
}

export interface NearDuplicateResult {
  candidates: NearDuplicateCandidate[];
  comparisons: number;
  truncated: boolean;
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asUnknownRecord(value: unknown): UnknownRecord | undefined {
  return isUnknownRecord(value) ? value : undefined;
}

function nestedObjects(value: unknown): UnknownRecord[] {
  const root = asUnknownRecord(value);
  if (!root) return [];

  const direct = [
    root,
    ...[root.dashboard, root.dashboardMetadata, root.metadata, root.usage]
      .map(asUnknownRecord)
      .filter((entry): entry is UnknownRecord => Boolean(entry)),
  ];
  const nested = direct
    .flatMap((object) => [object.usage, object.taxonomy])
    .map(asUnknownRecord)
    .filter((entry): entry is UnknownRecord => Boolean(entry));
  return [...direct, ...nested];
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizedKey(trimmed);
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];

  const values: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      values.push(item);
      continue;
    }
    const object = asUnknownRecord(item);
    if (!object) continue;
    const label = [object.name, object.label, object.id].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && Boolean(candidate.trim()),
    );
    if (label) values.push(label);
  }
  return values;
}

function firstFiniteCount(objects: readonly UnknownRecord[], keys: readonly string[]): number {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
      }
    }
  }
  return 0;
}

function latestValidDate(
  objects: readonly UnknownRecord[],
  keys: readonly string[],
): string | undefined {
  let latest: { value: string; timestamp: number } | undefined;
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value !== "string") continue;
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp) && (!latest || timestamp > latest.timestamp)) {
        latest = { value, timestamp };
      }
    }
  }
  return latest?.value;
}

export function readDashboardMetadata(record: MediaRecord): DashboardMetadataSnapshot {
  const objects = nestedObjects(record);
  const categories = uniqueStrings(
    objects.flatMap((object) =>
      [object.categories, object.categoryIds, object.category, object.categoryId].flatMap(
        stringValues,
      ),
    ),
  );
  const favorite = objects.some(
    (object) => object.favorite === true || object.isFavorite === true || object.pinned === true,
  );

  return {
    categories,
    favorite,
    copyCount: firstFiniteCount(objects, ["copyCount", "copies"]),
    dragCount: firstFiniteCount(objects, ["dragCount", "drags"]),
    lastUsedAt: latestValidDate(objects, ["lastUsedAt", "lastCopiedAt", "lastDraggedAt"]),
  };
}

function validDateBoundary(value: string | Date | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function hostFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function recordHosts(record: MediaRecord): Set<string> {
  return new Set(
    [hostFromUrl(record.sourceUrl), hostFromUrl(record.pageUrl)].filter((host): host is string =>
      Boolean(host),
    ),
  );
}

function matchesRequestedValues(
  actualValues: readonly string[],
  requestedValues: readonly string[] | undefined,
  matchAll: boolean,
): boolean {
  const requested = uniqueStrings(requestedValues ?? []).map(normalizedKey);
  if (!requested.length) return true;
  const actual = new Set(actualValues.map(normalizedKey));
  return matchAll
    ? requested.every((value) => actual.has(value))
    : requested.some((value) => actual.has(value));
}

export function filterDashboardRecords(
  records: readonly MediaRecord[],
  filters: DashboardRecordFilters,
): MediaRecord[] {
  const from = validDateBoundary(filters.dateAddedFrom);
  const to = validDateBoundary(filters.dateAddedTo);
  const requestedHosts = uniqueStrings(filters.sourceHosts ?? []).map((host) =>
    host
      .toLocaleLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, ""),
  );
  const minimum = Number.isFinite(filters.minByteSize) ? Math.max(0, filters.minByteSize ?? 0) : 0;
  const maximum = Number.isFinite(filters.maxByteSize)
    ? Math.max(0, filters.maxByteSize ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;

  return records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    if (from !== undefined && (!Number.isFinite(createdAt) || createdAt < from)) return false;
    if (to !== undefined && (!Number.isFinite(createdAt) || createdAt > to)) return false;
    if (record.byteSize < minimum || record.byteSize > maximum) return false;

    if (requestedHosts.length) {
      const hosts = recordHosts(record);
      if (!requestedHosts.some((host) => hosts.has(host))) return false;
    }

    const metadata = readDashboardMetadata(record);
    return matchesRequestedValues(
      metadata.categories,
      filters.categories,
      filters.matchAllCategories ?? false,
    );
  });
}

function incrementBucket(
  buckets: Map<string, { label: string; itemCount: number; totalBytes: number }>,
  label: string,
  byteSize: number,
): void {
  const key = normalizedKey(label);
  const bucket = buckets.get(key) ?? { label, itemCount: 0, totalBytes: 0 };
  bucket.itemCount += 1;
  bucket.totalBytes += byteSize;
  buckets.set(key, bucket);
}

function sortedBuckets(
  buckets: Map<string, { label: string; itemCount: number; totalBytes: number }>,
): StorageBucket[] {
  return [...buckets.values()]
    .map((bucket) => ({
      key: bucket.label,
      itemCount: bucket.itemCount,
      totalBytes: bucket.totalBytes,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function aggregateStorageStats(records: readonly MediaRecord[]): DashboardStorageSummary {
  const mimeTypes = new Map<string, { label: string; itemCount: number; totalBytes: number }>();
  const categories = new Map<string, { label: string; itemCount: number; totalBytes: number }>();
  let totalBytes = 0;

  for (const record of records) {
    const byteSize = Number.isFinite(record.byteSize) ? Math.max(0, record.byteSize) : 0;
    totalBytes += byteSize;
    incrementBucket(mimeTypes, record.mimeType, byteSize);
    const recordCategories = readDashboardMetadata(record).categories;
    for (const category of recordCategories.length ? recordCategories : ["Uncategorized"]) {
      incrementBucket(categories, category, byteSize);
    }
  }

  return {
    itemCount: records.length,
    totalBytes,
    averageBytes: records.length ? totalBytes / records.length : 0,
    byMimeType: sortedBuckets(mimeTypes),
    byCategory: sortedBuckets(categories),
  };
}

function compareUsage(left: RecordUsageSummary, right: RecordUsageSummary): number {
  return (
    right.totalActions - left.totalActions ||
    (Date.parse(right.lastUsedAt ?? "") || 0) - (Date.parse(left.lastUsedAt ?? "") || 0) ||
    left.record.id.localeCompare(right.record.id)
  );
}

export function aggregateUsageStats(records: readonly MediaRecord[]): DashboardUsageSummary {
  let totalCopyCount = 0;
  let totalDragCount = 0;
  const categoryUsage = new Map<string, CategoryUsageSummary>();
  const byRecord = records.map((record): RecordUsageSummary => {
    const metadata = readDashboardMetadata(record);
    totalCopyCount += metadata.copyCount;
    totalDragCount += metadata.dragCount;
    for (const categoryId of metadata.categories.length ? metadata.categories : ["Uncategorized"]) {
      const key = normalizedKey(categoryId);
      const bucket = categoryUsage.get(key) ?? {
        categoryId,
        itemCount: 0,
        copyCount: 0,
        dragCount: 0,
        totalActions: 0,
      };
      bucket.itemCount += 1;
      bucket.copyCount += metadata.copyCount;
      bucket.dragCount += metadata.dragCount;
      bucket.totalActions += metadata.copyCount + metadata.dragCount;
      categoryUsage.set(key, bucket);
    }
    return {
      record,
      copyCount: metadata.copyCount,
      dragCount: metadata.dragCount,
      totalActions: metadata.copyCount + metadata.dragCount,
      lastUsedAt: metadata.lastUsedAt,
    };
  });
  byRecord.sort(compareUsage);

  return {
    totalCopyCount,
    totalDragCount,
    totalActions: totalCopyCount + totalDragCount,
    usedItemCount: byRecord.filter((entry) => entry.totalActions > 0 || entry.lastUsedAt).length,
    byRecord,
    byCategory: [...categoryUsage.values()].sort(
      (left, right) =>
        right.totalActions - left.totalActions || left.categoryId.localeCompare(right.categoryId),
    ),
  };
}

function clampInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(value ?? fallback)));
}

export function buildDashboardOverview(
  records: readonly MediaRecord[],
  options: DashboardOverviewOptions = {},
): DashboardOverview {
  const recentLimit = clampInteger(options.recentLimit, DEFAULT_RECENT_LIMIT, 100);
  const usage = aggregateUsageStats(records);
  const recentlySaved = [...records]
    .sort(
      (left, right) =>
        (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, recentLimit);
  const favorites = records
    .filter((record) => readDashboardMetadata(record).favorite)
    .sort((left, right) => left.id.localeCompare(right.id));
  const recentlyUsed = usage.byRecord
    .filter((entry) => entry.lastUsedAt)
    .sort(
      (left, right) =>
        (Date.parse(right.lastUsedAt ?? "") || 0) - (Date.parse(left.lastUsedAt ?? "") || 0) ||
        left.record.id.localeCompare(right.record.id),
    )
    .slice(0, recentLimit);

  return {
    itemCount: records.length,
    favoriteCount: favorites.length,
    neverUsedCount: records.length - usage.usedItemCount,
    storage: aggregateStorageStats(records),
    usage,
    favorites,
    recentlySaved,
    recentlyUsed,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tokenize(value: string): string[] {
  return safeDecode(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 32 &&
        !TOKEN_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token) &&
        !/^[a-f\d]{12,}$/i.test(token),
    );
}

function compareRecords(left: MediaRecord, right: MediaRecord): number {
  return (
    (Date.parse(left.createdAt) || 0) - (Date.parse(right.createdAt) || 0) ||
    left.id.localeCompare(right.id)
  );
}

export function groupExactDuplicates(records: readonly MediaRecord[]): ExactDuplicateGroup[] {
  const groups = new Map<string, MediaRecord[]>();
  for (const record of records) {
    const hash = record.sha256.trim().toLocaleLowerCase();
    if (!hash) continue;
    const group = groups.get(hash) ?? [];
    group.push(record);
    groups.set(hash, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([sha256, group]) => {
      const sorted = [...group].sort(compareRecords);
      const sizes = sorted.map((record) => Math.max(0, record.byteSize));
      const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
      return {
        sha256,
        records: sorted,
        totalBytes,
        reclaimableBytes: totalBytes - Math.min(...sizes),
      };
    })
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left.map(normalizedKey));
  const rightSet = new Set(right.map(normalizedKey));
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function sizeSimilarity(left: number, right: number): number {
  if (left <= 0 || right <= 0) return 0;
  return Math.min(left, right) / Math.max(left, right);
}

function dimensionSimilarity(left: MediaRecord, right: MediaRecord): number {
  if (!left.width || !left.height || !right.width || !right.height) return 0;
  return (sizeSimilarity(left.width, right.width) + sizeSimilarity(left.height, right.height)) / 2;
}

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function scorePair(left: MediaRecord, right: MediaRecord): NearDuplicateCandidate {
  const title = jaccard(tokenize(left.title), tokenize(right.title));
  const dimensions = dimensionSimilarity(left, right);
  const fileSize = sizeSimilarity(left.byteSize, right.byteSize);
  const leftHosts = recordHosts(left);
  const sourceHost = [...recordHosts(right)].some((host) => leftHosts.has(host)) ? 1 : 0;
  const mimeType = left.mimeType === right.mimeType ? 1 : 0;
  const weighted: Array<[NearDuplicateSignal, number, number]> = [
    ["title", title, 0.35],
    ["dimensions", dimensions, 0.25],
    ["file-size", fileSize, 0.2],
    ["source-host", sourceHost, 0.1],
    ["mime-type", mimeType, 0.1],
  ];
  const reasons = weighted
    .filter(([, similarity]) => similarity > 0)
    .map(([signal, similarity, weight]) => ({
      signal,
      similarity: rounded(similarity),
      contribution: rounded(similarity * weight),
    }));

  return {
    left,
    right,
    score: rounded(reasons.reduce((sum, reason) => sum + reason.contribution, 0)),
    reasons,
  };
}

export function scoreNearDuplicateCandidates(
  records: readonly MediaRecord[],
  options: NearDuplicateOptions = {},
): NearDuplicateResult {
  const requestedThreshold = Number.isFinite(options.threshold)
    ? (options.threshold ?? DEFAULT_NEAR_DUPLICATE_THRESHOLD)
    : DEFAULT_NEAR_DUPLICATE_THRESHOLD;
  const threshold = Math.min(1, Math.max(0, requestedThreshold));
  const limit = clampInteger(options.limit, DEFAULT_NEAR_DUPLICATE_LIMIT, 500);
  const maxComparisons = clampInteger(
    options.maxComparisons,
    HARD_MAX_NEAR_DUPLICATE_COMPARISONS,
    HARD_MAX_NEAR_DUPLICATE_COMPARISONS,
  );
  const sorted = [...records].sort(compareRecords);
  const candidates: NearDuplicateCandidate[] = [];
  let comparisons = 0;
  let truncated = false;

  outer: for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      if (comparisons >= maxComparisons) {
        truncated = true;
        break outer;
      }
      comparisons += 1;
      const left = sorted[leftIndex];
      const right = sorted[rightIndex];
      if (left.sha256.trim() && normalizedKey(left.sha256) === normalizedKey(right.sha256))
        continue;
      const candidate = scorePair(left, right);
      if (candidate.score >= threshold) candidates.push(candidate);
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.left.id.localeCompare(right.left.id) ||
      left.right.id.localeCompare(right.right.id),
  );

  return {
    candidates: candidates.slice(0, limit),
    comparisons,
    truncated,
  };
}
