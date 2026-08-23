import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardCategory,
  type DashboardMediaRecord,
  type DashboardPreferences,
} from "../core/domain/dashboard";
import type { DashboardRepository } from "../core/ports/dashboard-repository";
import {
  aggregateStorageStats,
  aggregateUsageStats,
  scoreNearDuplicateCandidates,
  suggestMetadataTags,
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

function TaxonomyPanel({
  items,
  repository,
  onLibraryChanged,
}: Pick<DashboardSectionsProps, "items" | "repository" | "onLibraryChanged">) {
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2c6a42");
  const [parentId, setParentId] = useState("");
  const [tagRename, setTagRename] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Loading local categories…");

  const load = useCallback(async () => {
    try {
      setCategories(await repository.listCategories());
      setMessage("Categories are stored on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Categories could not be loaded.");
    }
  }, [repository]);

  useEffect(() => void load(), [load]);

  const tags = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      for (const tag of item.tags) {
        const key = tag.toLocaleLowerCase();
        const current = counts.get(key) ?? { label: tag, count: 0 };
        current.count += 1;
        counts.set(key, current);
      }
    }
    return [...counts.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [items]);

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    await repository.saveCategory({
      id: crypto.randomUUID(),
      name: name.trim(),
      color,
      ...(parentId ? { parentId } : {}),
      sortOrder: categories.length,
      createdAt: now,
      updatedAt: now,
    });
    setName("");
    setParentId("");
    setMessage("Category created locally.");
    await load();
  }

  async function updateCategory(category: DashboardCategory, update: Partial<DashboardCategory>) {
    await repository.saveCategory({
      ...category,
      ...update,
      updatedAt: new Date().toISOString(),
    });
    setMessage("Category updated.");
    await load();
  }

  async function renameTag(current: string) {
    const next = tagRename[current]?.trim();
    if (!next || next.toLocaleLowerCase() === current.toLocaleLowerCase()) return;
    const ids = items
      .filter((item) =>
        item.tags.some((tag) => tag.toLocaleLowerCase() === current.toLocaleLowerCase()),
      )
      .map((item) => item.id);
    const result = await repository.batchUpdateMetadata(ids, {
      addTags: [next],
      removeTags: [current],
    });
    setMessage(`${result.succeeded.length} items updated; ${result.failures.length} failed.`);
    setTagRename((values) => ({ ...values, [current]: "" }));
    onLibraryChanged();
  }

  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Organize"
        title="Categories & Tags"
        description="Create a local hierarchy, recolor folders, and rename tags across your library."
      />
      <div className="tool-grid tool-grid--taxonomy">
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Folders</span>
              <h2>Category manager</h2>
            </div>
            <span>{categories.length}</span>
          </div>
          <form className="category-create" onSubmit={(event) => void addCategory(event)}>
            <input
              aria-label="New category name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New category"
            />
            <input
              aria-label="Category color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <select
              aria-label="Parent category"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Top level</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button className="button" type="submit">
              Create
            </button>
          </form>
          <div className="taxonomy-list">
            {categories.map((category, index) => (
              <article
                key={category.id}
                style={{ "--category-color": category.color } as React.CSSProperties}
              >
                <span className="category-dot" aria-hidden="true" />
                <input
                  aria-label={`Rename ${category.name}`}
                  value={category.name}
                  onChange={(event) =>
                    setCategories((values) =>
                      values.map((value) =>
                        value.id === category.id ? { ...value, name: event.target.value } : value,
                      ),
                    )
                  }
                  onBlur={() =>
                    void updateCategory(category, {
                      name:
                        categories.find((value) => value.id === category.id)?.name ?? category.name,
                    })
                  }
                />
                <input
                  aria-label={`Color for ${category.name}`}
                  type="color"
                  value={category.color}
                  onChange={(event) => void updateCategory(category, { color: event.target.value })}
                />
                <select
                  aria-label={`Parent for ${category.name}`}
                  value={category.parentId ?? ""}
                  onChange={(event) =>
                    void updateCategory(category, { parentId: event.target.value || undefined })
                  }
                >
                  <option value="">Top level</option>
                  {categories
                    .filter((value) => value.id !== category.id)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                </select>
                <div className="row-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      void updateCategory(category, {
                        sortOrder: Math.max(0, category.sortOrder - 1),
                      })
                    }
                    aria-label={`Move ${category.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === categories.length - 1}
                    onClick={() =>
                      void updateCategory(category, { sortOrder: category.sortOrder + 1 })
                    }
                    aria-label={`Move ${category.name} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete category “${category.name}”? Media will remain saved.`,
                        )
                      )
                        void repository.deleteCategory(category.id).then(load);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {!categories.length ? (
              <p className="tool-empty">No categories yet. Tags continue to work without them.</p>
            ) : null}
          </div>
        </section>
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Vocabulary</span>
              <h2>Tag inventory</h2>
            </div>
            <span>{tags.length}</span>
          </div>
          <div className="tag-manager">
            {tags.map((tag) => (
              <form
                key={tag.label.toLocaleLowerCase()}
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameTag(tag.label);
                }}
              >
                <span>#{tag.label}</span>
                <small>{tag.count} items</small>
                <input
                  aria-label={`Rename ${tag.label}`}
                  value={tagRename[tag.label] ?? ""}
                  onChange={(event) =>
                    setTagRename((values) => ({ ...values, [tag.label]: event.target.value }))
                  }
                  placeholder="Rename to…"
                />
                <button type="submit" disabled={!tagRename[tag.label]?.trim()}>
                  Rename
                </button>
              </form>
            ))}
            {!tags.length ? (
              <p className="tool-empty">Tags appear here after you add them to a saved item.</p>
            ) : null}
          </div>
        </section>
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

function MaintenancePanel({
  items,
  repository,
  onLibraryChanged,
}: Pick<DashboardSectionsProps, "items" | "repository" | "onLibraryChanged">) {
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
  const untagged = items.filter((item) => !item.tags.length);

  async function acceptSuggestions(item: DashboardMediaRecord) {
    const suggestions = suggestMetadataTags(item)
      .slice(0, 3)
      .map((value) => value.tag);
    if (!suggestions.length) return;
    await repository.updateMediaMetadata(item.id, { tags: suggestions });
    setMessage(`Added ${suggestions.length} suggested tags to ${item.title || "Untitled"}.`);
    onLibraryChanged();
  }

  return (
    <section className="dashboard-section dashboard-tool-page">
      <SectionHeader
        eyebrow="Library health"
        title="Maintenance"
        description="GoPaste suggests cleanup candidates locally. You always decide what changes."
      />
      <div className="maintenance-summary">
        <article>
          <strong>{exact.length}</strong>
          <span>exact groups</span>
        </article>
        <article>
          <strong>{untagged.length}</strong>
          <span>untagged</span>
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
              The scan compares file traits, titles, dimensions, tags, and sources. It is capped to
              keep the dashboard responsive.
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
        <section className="tool-panel">
          <div className="tool-panel__heading">
            <div>
              <span className="section-eyebrow">Suggestions</span>
              <h2>Untagged items</h2>
            </div>
            <span>{untagged.length}</span>
          </div>
          <div className="suggestion-list">
            {untagged.slice(0, 8).map((item) => {
              const suggestions = suggestMetadataTags(item).slice(0, 3);
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.title || "Untitled"}</strong>
                    <small>
                      {suggestions.map((value) => `#${value.tag}`).join(" ") ||
                        "No confident suggestion"}
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={!suggestions.length}
                    onClick={() => void acceptSuggestions(item)}
                  >
                    Accept
                  </button>
                </article>
              );
            })}
            {!untagged.length ? (
              <p className="tool-empty">Every loaded item has at least one tag.</p>
            ) : null}
          </div>
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
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);

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
              aria-label="Tag to export"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
            >
              <option value="">Choose a tag</option>
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!tag}
              onClick={() => void exportRecords(items.filter((item) => item.tags.includes(tag)))}
            >
              Export tag
            </button>
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
      return <MaintenancePanel {...props} />;
    case "backup":
      return <BackupSettingsPanel {...props} />;
  }
}
