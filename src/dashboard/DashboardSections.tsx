import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardCategory,
  type DashboardMediaQuery,
  type DashboardMediaRecord,
  type DashboardPreferences,
} from "../core/domain/dashboard";
import type { DashboardRepository } from "../core/ports/dashboard-repository";
import {
  aggregateStorageStats,
  aggregateUsageStats,
  scoreNearDuplicateCandidates,
} from "../core/services/dashboard-insights";
import type { MediaRecord } from "../core/domain/media";
import type { MediaRepository } from "../core/ports/media-repository";
import {
  ZipArchiveService,
  downloadArchive,
  type ArchiveProgress,
} from "../infrastructure/archive";
import type { DashboardSection } from "./DashboardShell";

interface DashboardSectionsProps {
  section: Exclude<DashboardSection, "overview" | "library">;
  items: readonly DashboardMediaRecord[];
  repository: DashboardRepository;
  mediaRepository: MediaRepository;
  onLibraryChanged: () => void;
  onPreferencesChanged: (preferences: DashboardPreferences) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="dashboard-section__header">
      <span className="section-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CategoryMediaChoice({
  item,
  selected,
  onChange,
}: {
  item: DashboardMediaRecord;
  selected: boolean;
  onChange: (selected: boolean) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    const url = URL.createObjectURL(item.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.blob]);

  return (
    <label className={`category-media-choice${selected ? " is-selected" : ""}`}>
      {previewUrl ? (
        <img src={previewUrl} alt={item.title || "Saved image"} loading="lazy" />
      ) : null}
      <span className="category-media-choice__selection">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={`Include ${item.title || "Untitled"}`}
        />
      </span>
      <span>{item.title || "Untitled"}</span>
      <small>{new Date(item.createdAt).toLocaleDateString()}</small>
    </label>
  );
}

function CategoryMediaCard({ item }: { item: DashboardMediaRecord }) {
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    const url = URL.createObjectURL(item.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.blob]);

  return (
    <article className="category-media-card">
      {previewUrl ? (
        <img src={previewUrl} alt={item.title || "Saved image"} loading="lazy" />
      ) : null}
      <div>
        <strong>{item.title || "Untitled"}</strong>
        <small>{new Date(item.createdAt).toLocaleDateString()}</small>
      </div>
    </article>
  );
}

function TaxonomyPanel({
  items,
  repository,
  onLibraryChanged,
}: Pick<DashboardSectionsProps, "items" | "repository" | "onLibraryChanged">) {
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2c6a42");
  const [creating, setCreating] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>();
  const [showPicker, setShowPicker] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [pickerItems, setPickerItems] = useState<DashboardMediaRecord[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [categoryItems, setCategoryItems] = useState<DashboardMediaRecord[]>([]);
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);
  const [categoryItemsRevision, setCategoryItemsRevision] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("Loading local categories…");

  const load = useCallback(async () => {
    try {
      const [nextCategories, statistics] = await Promise.all([
        repository.listCategories(),
        repository.getStatistics(),
      ]);
      setCategories(nextCategories);
      setCategoryCounts(
        Object.fromEntries(
          Object.entries(statistics.byCategoryId).map(([id, breakdown]) => [
            id,
            breakdown.itemCount,
          ]),
        ),
      );
      setActiveCategoryId((current) =>
        current && !nextCategories.some((category) => category.id === current)
          ? undefined
          : current,
      );
      setMessage("Categories are stored on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Categories could not be loaded.");
    }
  }, [repository]);

  useEffect(() => void load(), [load]);

  const listAllMedia = useCallback(
    async (query: Omit<DashboardMediaQuery, "cursor" | "limit">) => {
      const loaded: DashboardMediaRecord[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await repository.list({
          limit: 100,
          ...query,
          ...(cursor ? { cursor } : {}),
        });
        loaded.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && !seenCursors.has(cursor) && seenCursors.add(cursor));
      return loaded;
    },
    [repository],
  );

  useEffect(() => {
    if (!activeCategoryId) {
      setCategoryItems([]);
      return;
    }
    let current = true;
    setCategoryItemsLoading(true);
    void listAllMedia({
      categoryIds: [activeCategoryId],
      sortBy: "createdAt",
      sortDirection: "descending",
    })
      .then((nextItems) => {
        if (current) setCategoryItems(nextItems);
      })
      .catch((error) => {
        if (current) {
          setCategoryItems([]);
          setMessage(
            error instanceof Error ? error.message : "Category images could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (current) setCategoryItemsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [activeCategoryId, categoryItemsRevision, listAllMedia]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId);
  const categoryItemCount = activeCategory ? (categoryCounts[activeCategory.id] ?? 0) : 0;
  const availableItems = useMemo(() => {
    if (!activeCategory) return [];
    const normalizedSearch = mediaSearch.trim().toLocaleLowerCase();
    const sourceItems = pickerItems.length ? pickerItems : items;
    return sourceItems
      .filter((item) => !item.categoryIds.includes(activeCategory.id))
      .filter(
        (item) => !normalizedSearch || item.title.toLocaleLowerCase().includes(normalizedSearch),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [activeCategory, items, mediaSearch, pickerItems]);

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const now = new Date().toISOString();
      const category = await repository.saveCategory({
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        sortOrder: categories.length,
        createdAt: now,
        updatedAt: now,
      });
      setName("");
      setCreating(false);
      setActiveCategoryId(category.id);
      setMessage("Category created locally. Add images when you are ready.");
      await load();
      onLibraryChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Category could not be created.");
    }
  }

  async function addSelectedMedia() {
    if (!activeCategory || !selectedMediaIds.size) return;
    try {
      const result = await repository.batchUpdateMetadata([...selectedMediaIds], {
        addCategoryIds: [activeCategory.id],
      });
      const succeeded = new Set(result.succeeded);
      const addedItems = availableItems
        .filter((item) => succeeded.has(item.id))
        .map((item) => ({
          ...item,
          categoryIds: [...new Set([...item.categoryIds, activeCategory.id])],
        }));
      setPickerItems((current) =>
        current.map((item) =>
          succeeded.has(item.id)
            ? { ...item, categoryIds: [...new Set([...item.categoryIds, activeCategory.id])] }
            : item,
        ),
      );
      setCategoryItems((current) =>
        [...current, ...addedItems].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
      );
      setCategoryItemsRevision((current) => current + 1);
      setCategoryCounts((current) => ({
        ...current,
        [activeCategory.id]: (current[activeCategory.id] ?? categoryItemCount) + succeeded.size,
      }));
      setSelectedMediaIds(new Set());
      setShowPicker(false);
      setMessage(
        `${result.succeeded.length} ${result.succeeded.length === 1 ? "image" : "images"} added to ${activeCategory.name}.`,
      );
      onLibraryChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Images could not be added to this category.",
      );
    }
  }

  function toggleMedia(id: string, selected: boolean) {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function openPicker() {
    const opening = !showPicker;
    setShowPicker(opening);
    if (!opening) return;

    setPickerLoading(true);
    try {
      setPickerItems(await listAllMedia({ sortBy: "createdAt", sortDirection: "descending" }));
    } catch (error) {
      setPickerItems([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "All saved images could not be loaded; showing the current library page.",
      );
    } finally {
      setPickerLoading(false);
    }
  }

  if (activeCategory) {
    return (
      <section className="dashboard-section dashboard-tool-page">
        <header className="dashboard-section__header category-workspace__header">
          <button
            className="back-link"
            type="button"
            onClick={() => {
              setActiveCategoryId(undefined);
              setShowPicker(false);
              setSelectedMediaIds(new Set());
            }}
          >
            ← All categories
          </button>
          <span className="section-eyebrow">Category</span>
          <h1>{activeCategory.name}</h1>
          <p>
            {categoryItemCount} {categoryItemCount === 1 ? "image" : "images"} included. Add more
            from your saved library, starting with the most recently added.
          </p>
        </header>

        <div className="category-workspace__cards">
          <article
            className="category-summary-card"
            style={{ "--category-color": activeCategory.color } as React.CSSProperties}
          >
            <span className="category-dot" aria-hidden="true" />
            <strong>{activeCategory.name}</strong>
            <small>{categoryItemCount} saved items</small>
          </article>
          <button
            className="category-card category-card--add-media"
            type="button"
            onClick={() => void openPicker()}
            aria-label={`Add images to ${activeCategory.name}`}
            aria-expanded={showPicker}
          >
            <span className="category-card__plus">
              <PlusIcon />
            </span>
            <strong>Add images</strong>
            <small>Select from your library</small>
          </button>
        </div>

        <section className="category-collection" aria-label={`Images in ${activeCategory.name}`}>
          <div className="category-collection__heading">
            <div>
              <span className="section-eyebrow">Collection</span>
              <h2>Images in {activeCategory.name}</h2>
            </div>
            <span>Newest first</span>
          </div>
          {categoryItemsLoading ? <p className="tool-empty">Loading category images…</p> : null}
          {!categoryItemsLoading && categoryItems.length ? (
            <div className="category-media-grid category-media-grid--collection">
              {categoryItems.map((item) => (
                <CategoryMediaCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {!categoryItemsLoading && !categoryItems.length ? (
            <p className="tool-empty">
              No images in this category yet. Use the plus card to add some.
            </p>
          ) : null}
        </section>

        {showPicker ? (
          <section className="category-picker" aria-label={`Add images to ${activeCategory.name}`}>
            <div className="category-picker__heading">
              <div>
                <span className="section-eyebrow">Recently added</span>
                <h2>Select images to include</h2>
              </div>
              <span>{selectedMediaIds.size} selected</span>
            </div>
            <label className="category-picker__search">
              <span className="visually-hidden">Filter saved images</span>
              <input
                type="search"
                value={mediaSearch}
                onChange={(event) => setMediaSearch(event.target.value)}
                placeholder="Filter saved images"
              />
            </label>
            <div className="category-media-grid">
              {availableItems.map((item) => (
                <CategoryMediaChoice
                  key={item.id}
                  item={item}
                  selected={selectedMediaIds.has(item.id)}
                  onChange={(selected) => toggleMedia(item.id, selected)}
                />
              ))}
            </div>
            {pickerLoading ? <p className="tool-empty">Loading all saved images…</p> : null}
            {!availableItems.length ? (
              <p className="tool-empty">Every matching image is already in this category.</p>
            ) : null}
            <div className="category-picker__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setShowPicker(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={!selectedMediaIds.size}
                onClick={() => void addSelectedMedia()}
              >
                Add {selectedMediaIds.size || ""} {selectedMediaIds.size === 1 ? "image" : "images"}
              </button>
            </div>
          </section>
        ) : null}
        <p className="tool-status" role="status">
          {message}
        </p>
      </section>
    );
  }

  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Organize"
        title="Categories"
        description="Keep your reaction library in visual categories, then add saved images whenever they belong."
      />
      <div className="category-card-grid" aria-label="Categories">
        {categories.map((category) => {
          const categoryCount = categoryCounts[category.id] ?? 0;
          return (
            <button
              key={category.id}
              className="category-card"
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
              style={{ "--category-color": category.color } as React.CSSProperties}
            >
              <span className="category-card__swatch" aria-hidden="true" />
              <strong>{category.name}</strong>
              <small>
                {categoryCount} {categoryCount === 1 ? "image" : "images"}
              </small>
              <span className="category-card__arrow" aria-hidden="true">
                →
              </span>
            </button>
          );
        })}
        {creating ? (
          <form
            className="category-card category-card--create"
            onSubmit={(event) => void addCategory(event)}
          >
            <span className="category-card__plus" aria-hidden="true">
              <PlusIcon />
            </span>
            <label>
              <span className="visually-hidden">New category name</span>
              <input
                aria-label="New category name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Category name"
              />
            </label>
            <label className="category-card__color">
              <span className="visually-hidden">Category color</span>
              <input
                aria-label="Category color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <div className="category-card__create-actions">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setName("");
                }}
              >
                Cancel
              </button>
              <button className="button" type="submit" disabled={!name.trim()}>
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            className="category-card category-card--new"
            type="button"
            onClick={() => setCreating(true)}
          >
            <span className="category-card__plus">
              <PlusIcon />
            </span>
            <strong>New category</strong>
            <small>Create a local collection</small>
          </button>
        )}
      </div>
      <p className="tool-status" role="status">
        {message}
      </p>
    </section>
  );
}

function InsightsPanel({ items }: { items: readonly DashboardMediaRecord[] }) {
  const storage = useMemo(() => aggregateStorageStats(items), [items]);
  const usage = useMemo(() => aggregateUsageStats(items), [items]);
  const maxUsage = Math.max(1, ...usage.byRecord.slice(0, 6).map((value) => value.totalActions));
  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Understand"
        title="Insights"
        description="Every figure is calculated from media and activity stored in this Chrome profile."
      />
      <div className="insight-stats">
        <article>
          <span>Saved items</span>
          <strong>{storage.itemCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>Local media</span>
          <strong>{formatBytes(storage.totalBytes)}</strong>
        </article>
        <article>
          <span>Copies</span>
          <strong>{usage.totalCopyCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>Drags</span>
          <strong>{usage.totalDragCount.toLocaleString()}</strong>
        </article>
      </div>
      <div className="tool-grid">
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Usage</span>
              <h2>Most used reactions</h2>
            </div>
          </div>
          <div className="bar-chart">
            {usage.byRecord.slice(0, 6).map((entry) => (
              <div key={entry.record.id}>
                <span>{entry.record.title || "Untitled"}</span>
                <i style={{ width: `${(entry.totalActions / maxUsage) * 100}%` }} />
                <strong>{entry.totalActions}</strong>
              </div>
            ))}
            {!usage.totalActions ? (
              <p className="tool-empty">
                Copy and drag activity will appear here as you use GoPaste.
              </p>
            ) : null}
          </div>
        </section>
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Storage</span>
              <h2>By file type</h2>
            </div>
          </div>
          <dl className="breakdown-list">
            {storage.byMimeType.map((bucket) => (
              <div key={bucket.key}>
                <dt>
                  {bucket.key.replace("image/", "").toUpperCase()}{" "}
                  <small>{bucket.itemCount} items</small>
                </dt>
                <dd>{formatBytes(bucket.totalBytes)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}

function MaintenancePanel({ items }: Pick<DashboardSectionsProps, "items">) {
  const [scanned, setScanned] = useState(false);
  const [message, setMessage] = useState("Run a bounded local scan when you are ready.");
  const exact = useMemo(() => {
    const groups = new Map<string, DashboardMediaRecord[]>();
    for (const item of items) groups.set(item.sha256, [...(groups.get(item.sha256) ?? []), item]);
    return [...groups.values()].filter((group) => group.length > 1);
  }, [items]);
  const near = useMemo(
    () =>
      scanned
        ? scoreNearDuplicateCandidates(items, { limit: 24, maxComparisons: 25_000 })
        : undefined,
    [items, scanned],
  );
  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Library health"
        title="Maintenance"
        description="GoPaste identifies cleanup candidates locally. You always decide what changes."
      />
      <div className="maintenance-summary">
        <article>
          <strong>{exact.length}</strong>
          <span>exact groups</span>
        </article>
        <article>
          <strong>{items.length}</strong>
          <span>saved items</span>
        </article>
        <article>
          <strong>{items.filter((item) => item.byteSize > 10 * 1024 ** 2).length}</strong>
          <span>over 10 MiB</span>
        </article>
        <button
          className="button"
          type="button"
          onClick={() => {
            setScanned(true);
            setMessage("Local comparison complete. No files were changed.");
          }}
        >
          Scan near-duplicates
        </button>
      </div>
      <div className="tool-grid">
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Review queue</span>
              <h2>Near-duplicate candidates</h2>
            </div>
            {near ? <span>{near.candidates.length}</span> : null}
          </div>
          {!scanned ? (
            <p className="tool-empty">
              The scan compares file traits, titles, dimensions, and sources. It is capped to keep
              the dashboard responsive.
            </p>
          ) : near?.candidates.length ? (
            <div className="duplicate-list">
              {near.candidates.map((candidate) => (
                <article key={`${candidate.left.id}-${candidate.right.id}`}>
                  <div>
                    <strong>{candidate.left.title || "Untitled"}</strong>
                    <span>↔</span>
                    <strong>{candidate.right.title || "Untitled"}</strong>
                  </div>
                  <small>
                    {Math.round(candidate.score * 100)}% similar ·{" "}
                    {candidate.reasons.map((reason) => reason.signal).join(", ")}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="tool-empty">No likely near-duplicates found in the loaded library.</p>
          )}
        </section>
      </div>
      <p className="tool-status" role="status">
        {message}
        {near?.truncated ? " The scan stopped at its 25,000-comparison safety cap." : ""}
      </p>
    </section>
  );
}

function BackupSettingsPanel({
  items,
  repository,
  mediaRepository,
  onLibraryChanged,
  onPreferencesChanged,
}: Omit<DashboardSectionsProps, "section">) {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  );
  const [progress, setProgress] = useState<ArchiveProgress>();
  const [message, setMessage] = useState("Backups are written only to a file you choose.");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<DashboardCategory[]>([]);

  useEffect(() => {
    void repository.getPreferences().then(setPreferences);
    void repository.listCategories().then(setCategories);
  }, [repository]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.style.setProperty("--accent", preferences.accent);
  }, [preferences]);

  async function updatePreferences(update: Partial<DashboardPreferences>) {
    const saved = await repository.updatePreferences(update);
    setPreferences(saved);
    onPreferencesChanged(saved);
    setMessage("Preferences saved on this device.");
  }

  async function exportRecords(records?: readonly MediaRecord[]) {
    setMessage("Creating local ZIP…");
    const service = new ZipArchiveService(mediaRepository, { onProgress: setProgress });
    const blob = records ? await service.exportSelection(records) : await service.exportArchive();
    await downloadArchive(
      blob,
      `gopaste-${records ? "selection" : "backup"}-${new Date().toISOString().slice(0, 10)}.zip`,
    );
    setProgress(undefined);
    setMessage("ZIP created. Chrome asked where to save it.");
  }

  async function importArchive(file: File | undefined) {
    if (!file) return;
    setMessage("Validating and importing ZIP…");
    const summary = await new ZipArchiveService(mediaRepository, {
      onProgress: setProgress,
    }).importArchive(file);
    setProgress(undefined);
    setMessage(
      `${summary.imported} imported, ${summary.duplicates} duplicates skipped, ${summary.failed} failed.`,
    );
    onLibraryChanged();
  }

  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Keep it yours"
        title="Backup & Settings"
        description="Portable ZIP files and preferences stay under your control on this device."
      />
      <div className="tool-grid">
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Portable archive</span>
              <h2>Backup & restore</h2>
            </div>
            <span>Local only</span>
          </div>
          <div className="backup-actions">
            <button className="button" type="button" onClick={() => void exportRecords()}>
              Export full library
            </button>
            <label className="button button--secondary">
              Import ZIP
              <input
                className="visually-hidden"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void importArchive(input.files?.[0]).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
          </div>
          <div className="selective-export">
            <select
              aria-label="Category to export"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!category}
              onClick={() =>
                void exportRecords(items.filter((item) => item.categoryIds.includes(category)))
              }
            >
              Export category
            </button>
          </div>
          {progress ? (
            <progress
              aria-label={`${progress.phase} ${progress.completed} of ${progress.total}`}
              value={progress.completed}
              max={Math.max(1, progress.total)}
            />
          ) : null}
        </section>
        <section className="tool-panel settings-form">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Personalize</span>
              <h2>Dashboard defaults</h2>
            </div>
          </div>
          <label>
            Theme
            <select
              value={preferences.theme}
              onChange={(event) =>
                void updatePreferences({
                  theme: event.target.value as DashboardPreferences["theme"],
                })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Accent color
            <input
              type="color"
              value={preferences.accent}
              onChange={(event) => void updatePreferences({ accent: event.target.value })}
            />
          </label>
          <label>
            Default library view
            <select
              value={preferences.viewMode}
              onChange={(event) =>
                void updatePreferences({
                  viewMode: event.target.value as DashboardPreferences["viewMode"],
                })
              }
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </label>
          <label>
            Grid density
            <select
              value={preferences.gridDensity}
              onChange={(event) =>
                void updatePreferences({
                  gridDensity: event.target.value as DashboardPreferences["gridDensity"],
                })
              }
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </label>
          <label>
            Single-click action
            <select
              value={preferences.defaultAction}
              onChange={(event) =>
                void updatePreferences({
                  defaultAction: event.target.value as DashboardPreferences["defaultAction"],
                })
              }
            >
              <option value="copy">Copy image</option>
              <option value="drag">Prepare drag</option>
              <option value="download">Download file</option>
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.shortcutsEnabled}
              onChange={(event) =>
                void updatePreferences({ shortcutsEnabled: event.target.checked })
              }
            />
            Enable dashboard keyboard shortcuts
          </label>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => window.open("chrome://extensions/shortcuts")}
          >
            Configure Chrome shortcut
          </button>
        </section>
      </div>
      <p className="tool-status" role="status">
        {message}
      </p>
    </section>
  );
}

export function DashboardSections(props: DashboardSectionsProps) {
  switch (props.section) {
    case "taxonomy":
      return <TaxonomyPanel {...props} />;
    case "insights":
      return <InsightsPanel items={props.items} />;
    case "maintenance":
      return <MaintenancePanel items={props.items} />;
    case "backup":
      return <BackupSettingsPanel {...props} />;
  }
}
