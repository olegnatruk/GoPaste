import type { MediaRecord, SupportedMimeType } from "./media";

export type DashboardTheme = "system" | "light" | "dark";
export type DashboardGridDensity = "compact" | "comfortable" | "spacious";
export type DashboardViewMode = "grid" | "list";
export type DashboardDefaultAction = "copy" | "drag" | "download";
export type UsageAction = "copy" | "drag";

export interface DashboardMediaMetadata {
  categoryIds: string[];
  favorite: boolean;
  previewDataUrl?: string;
}

export interface DashboardMediaRecord extends MediaRecord, DashboardMediaMetadata {
  copyCount: number;
  dragCount: number;
  lastUsedAt?: string;
}

export interface DashboardMetadataUpdate {
  title?: string;
  tags?: string[];
  categoryIds?: string[];
  favorite?: boolean;
  previewDataUrl?: string;
  clearPreview?: boolean;
}

export interface DashboardBatchMetadataUpdate extends DashboardMetadataUpdate {
  addTags?: string[];
  removeTags?: string[];
  addCategoryIds?: string[];
  removeCategoryIds?: string[];
}

export type DashboardMediaSort =
  "createdAt" | "updatedAt" | "title" | "byteSize" | "lastUsedAt" | "usageCount";

export interface DashboardMediaQuery {
  cursor?: string;
  limit: number;
  search?: string;
  tags?: string[];
  categoryIds?: string[];
  createdFrom?: string;
  createdTo?: string;
  minBytes?: number;
  maxBytes?: number;
  sourceWebsite?: string;
  favorite?: boolean;
  usedSince?: string;
  sortBy?: DashboardMediaSort;
  sortDirection?: "ascending" | "descending";
}

export interface DashboardMediaPage {
  items: DashboardMediaRecord[];
  nextCursor?: string;
  total: number;
}

export interface DashboardCategory {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPreferences {
  key: "dashboard";
  theme: DashboardTheme;
  accent: string;
  gridDensity: DashboardGridDensity;
  viewMode: DashboardViewMode;
  shortcutsEnabled: boolean;
  defaultAction: DashboardDefaultAction;
  updatedAt: string;
}

export const DEFAULT_DASHBOARD_PREFERENCES: Readonly<DashboardPreferences> = Object.freeze({
  key: "dashboard",
  theme: "system",
  accent: "#2c6a42",
  gridDensity: "comfortable",
  viewMode: "grid",
  shortcutsEnabled: true,
  defaultAction: "copy",
  updatedAt: "1970-01-01T00:00:00.000Z",
});

export type DashboardPreferenceUpdate = Partial<Omit<DashboardPreferences, "key" | "updatedAt">>;

export interface MediaUsage {
  mediaId: string;
  copyCount: number;
  dragCount: number;
  lastUsedAt?: string;
}

export interface BatchOperationFailure {
  id: string;
  code: "NOT_FOUND" | "LIMIT_EXCEEDED" | "STORAGE_FAILED";
  message: string;
}

export interface BatchOperationResult {
  requested: number;
  attempted: number;
  succeeded: string[];
  failures: BatchOperationFailure[];
}

export interface DuplicateMediaSummary {
  id: string;
  title: string;
  byteSize: number;
  createdAt: string;
}

export interface ExactDuplicateGroup {
  sha256: string;
  items: DuplicateMediaSummary[];
  reclaimableBytes: number;
}

export interface DashboardBreakdown {
  itemCount: number;
  totalBytes: number;
}

export interface DashboardStatistics {
  itemCount: number;
  totalBytes: number;
  favoriteCount: number;
  untaggedCount: number;
  unusedCount: number;
  copyCount: number;
  dragCount: number;
  byMimeType: Partial<Record<SupportedMimeType, DashboardBreakdown>>;
  byCategoryId: Record<string, DashboardBreakdown>;
}
