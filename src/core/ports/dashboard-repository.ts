import type {
  BatchOperationResult,
  DashboardBatchMetadataUpdate,
  DashboardCategory,
  DashboardMediaPage,
  DashboardMediaQuery,
  DashboardMediaRecord,
  DashboardMetadataUpdate,
  DashboardPreferences,
  DashboardPreferenceUpdate,
  DashboardStatistics,
  ExactDuplicateGroup,
  MediaUsage,
  UsageAction,
} from "../domain/dashboard";

export interface DashboardRepository {
  list(query: DashboardMediaQuery): Promise<DashboardMediaPage>;
  getMedia(id: string): Promise<DashboardMediaRecord | undefined>;
  updateMediaMetadata(id: string, update: DashboardMetadataUpdate): Promise<DashboardMediaRecord>;
  batchUpdateMetadata(
    ids: readonly string[],
    update: DashboardBatchMetadataUpdate,
  ): Promise<BatchOperationResult>;
  batchDeleteMedia(ids: readonly string[]): Promise<BatchOperationResult>;
  findExactDuplicateGroups(): Promise<ExactDuplicateGroup[]>;

  listCategories(): Promise<DashboardCategory[]>;
  saveCategory(category: DashboardCategory): Promise<DashboardCategory>;
  deleteCategory(id: string): Promise<boolean>;

  getPreferences(): Promise<DashboardPreferences>;
  updatePreferences(update: DashboardPreferenceUpdate): Promise<DashboardPreferences>;

  getUsage(mediaId: string): Promise<MediaUsage>;
  listUsage(): Promise<MediaUsage[]>;
  recordUsage(mediaId: string, action: UsageAction, usedAt?: string): Promise<MediaUsage>;
  clearUsage(mediaId?: string): Promise<void>;

  getStatistics(): Promise<DashboardStatistics>;
}
