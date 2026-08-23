import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type {
  DashboardBatchMetadataUpdate,
  DashboardCategory,
  DashboardDefaultAction,
  DashboardGridDensity,
  DashboardMediaRecord as CoreDashboardMediaRecord,
  DashboardMetadataUpdate,
  DashboardViewMode,
} from "../core/domain/dashboard";
import type { DashboardRepository } from "../core/ports/dashboard-repository";
import { suggestMetadataTags } from "../core/services/dashboard-insights";
import { BrowserClipboardWriter } from "../infrastructure/clipboard/browser-clipboard-writer";
import { setImageFileDragData } from "../infrastructure/clipboard/portable-drag";
import { BrandMark } from "../shared/BrandMark";

const PAGE_SIZE = 96;

export type DashboardSection =
  "overview" | "library" | "taxonomy" | "insights" | "maintenance" | "backup";

export type DashboardView = DashboardViewMode;
export type DashboardDensity = DashboardGridDensity;
export type DashboardMediaRecord = CoreDashboardMediaRecord;
export type DashboardItemUpdate = DashboardMetadataUpdate;

export type DashboardLibraryService = Pick<
  DashboardRepository,
  "list" | "updateMediaMetadata" | "batchUpdateMetadata" | "batchDeleteMedia"
> &
  Partial<Pick<DashboardRepository, "listCategories" | "recordUsage">>;

export interface DashboardShellProps {
  service: DashboardLibraryService;
  initialSection?: DashboardSection;
  initialView?: DashboardView;
  initialDensity?: DashboardDensity;
  initialDefaultAction?: DashboardDefaultAction;
  confirmDelete?: (items: readonly DashboardMediaRecord[]) => boolean;
  renderSection?: (
    section: Exclude<DashboardSection, "overview" | "library">,
    items: readonly DashboardMediaRecord[],
  ) => ReactNode;
}

const NAVIGATION: ReadonlyArray<{ id: DashboardSection; label: string; shortLabel: string }> = [
  { id: "overview", label: "Overview", shortLabel: "OV" },
  { id: "library", label: "Library", shortLabel: "LI" },
  { id: "taxonomy", label: "Categories & Tags", shortLabel: "CT" },
  { id: "insights", label: "Insights", shortLabel: "IN" },
  { id: "maintenance", label: "Maintenance", shortLabel: "MA" },
  { id: "backup", label: "Backup & Settings", shortLabel: "BS" },
];

const SECTION_COPY: Record<
  Exclude<DashboardSection, "overview" | "library">,
  { eyebrow: string; title: string; description: string }
> = {
  taxonomy: {
    eyebrow: "Organize",
    title: "Categories & Tags",
    description: "Shape the vocabulary that keeps your reaction library easy to browse.",
  },
  insights: {
    eyebrow: "Understand",
    title: "Insights",
    description: "See patterns calculated from usage stored only on this device.",
  },
  maintenance: {
    eyebrow: "Library health",
    title: "Maintenance",
    description: "Review duplicates, storage pressure, and items that need attention.",
  },
  backup: {
    eyebrow: "Keep it yours",
    title: "Backup & Settings",
    description: "Manage local preferences and portable backups of your library.",
  },
};

function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function normalizeTags(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function sourceHost(item: DashboardMediaRecord): string {
  try {
    return new URL(item.pageUrl ?? item.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function usageCount(item: DashboardMediaRecord): number {
  return (item.copyCount ?? 0) + (item.dragCount ?? 0);
}

function applyBatchUpdate(
  item: DashboardMediaRecord,
  update: DashboardBatchMetadataUpdate,
): DashboardMediaRecord {
  const { addTags, removeTags, addCategoryIds, removeCategoryIds, ...metadata } = update;
  const tags = normalizeTags(
    [...(update.tags ?? item.tags), ...(addTags ?? [])]
      .filter(
        (tag) =>
          !(removeTags ?? []).some(
            (removed) => removed.toLocaleLowerCase() === tag.toLocaleLowerCase(),
          ),
      )
      .join(","),
  );
  const categoryIds = [
    ...new Set([...(update.categoryIds ?? item.categoryIds), ...(addCategoryIds ?? [])]),
  ].filter((id) => !(removeCategoryIds ?? []).includes(id));
  return { ...item, ...metadata, tags, categoryIds };
}

function MediaPreview({
  item,
  imageRef,
}: {
  item: DashboardMediaRecord;
  imageRef?: RefObject<HTMLImageElement | null>;
}) {
  const objectUrl = useObjectUrl(item.blob);
  const src = item.previewDataUrl || objectUrl;
  return src ? (
    <img ref={imageRef} src={src} alt={item.title || "Saved reaction"} loading="lazy" />
  ) : (
    <span className="dashboard-media__placeholder">Preparing preview…</span>
  );
}

interface MediaItemProps {
  item: DashboardMediaRecord;
  selected: boolean;
  view: DashboardView;
  onSelect: (item: DashboardMediaRecord, selected: boolean) => void;
  onFavorite: (item: DashboardMediaRecord) => void;
  onOpen: (item: DashboardMediaRecord) => void;
  defaultAction: DashboardDefaultAction;
  onUse: (item: DashboardMediaRecord) => void;
  onDrag: (event: DragEvent<HTMLButtonElement>, item: DashboardMediaRecord) => void;
}

function MediaItem({
  item,
  selected,
  view,
  onSelect,
  onFavorite,
  onOpen,
  defaultAction,
  onUse,
  onDrag,
}: MediaItemProps) {
  return (
    <article
      className={`dashboard-media dashboard-media--${view}${selected ? " is-selected" : ""}`}
    >
      <div className="dashboard-media__visual">
        <MediaPreview item={item} />
        <label className="dashboard-media__select">
          <span className="visually-hidden">Select {item.title || "Untitled"}</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(item, event.target.checked)}
          />
        </label>
        <button
          className={`dashboard-media__favorite${item.favorite ? " is-active" : ""}`}
          type="button"
          aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title || "Untitled"} ${
            item.favorite ? "from" : "to"
          } favorites`}
          aria-pressed={Boolean(item.favorite)}
          onClick={() => onFavorite(item)}
        >
          <span aria-hidden="true">★</span>
        </button>
      </div>
      <div className="dashboard-media__content">
        <div className="dashboard-media__title-row">
          <h3>{item.title || "Untitled"}</h3>
          <span>{item.extension.toUpperCase()}</span>
        </div>
        <div className="dashboard-media__tags">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag.toLocaleLowerCase()}>#{tag}</span>
          ))}
          {item.tags.length > 3 ? <span>+{item.tags.length - 3}</span> : null}
          {!item.tags.length ? <span>Untagged</span> : null}
        </div>
        <div className="dashboard-media__meta">
          <span>{formatBytes(item.byteSize)}</span>
          <span>{sourceHost(item)}</span>
          <span>{formatDate(item.createdAt)}</span>
        </div>
        <div className="dashboard-media__actions">
          <button
            className="dashboard-media__use"
            type="button"
            draggable={defaultAction === "drag"}
            onClick={() => onUse(item)}
            onDragStart={(event) => onDrag(event, item)}
          >
            {defaultAction === "copy"
              ? "Copy"
              : defaultAction === "download"
                ? "Download"
                : "Drag file"}
          </button>
          <button
            className="dashboard-media__details"
            type="button"
            aria-label="View details"
            onClick={() => onOpen(item)}
          >
            Details
          </button>
        </div>
      </div>
    </article>
  );
}

interface ItemDrawerProps {
  item: DashboardMediaRecord;
  categories: readonly DashboardCategory[];
  busy: boolean;
  onClose: () => void;
  onSave: (item: DashboardMediaRecord, update: DashboardItemUpdate) => Promise<void>;
  onDelete: (item: DashboardMediaRecord) => Promise<void>;
}

function ItemDrawer({ item, categories, busy, onClose, onSave, onDelete }: ItemDrawerProps) {
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [favorite, setFavorite] = useState(Boolean(item.favorite));
  const [categoryIds, setCategoryIds] = useState<string[]>(item.categoryIds);
  const previewRef = useRef<HTMLImageElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTitle(item.title);
    setTags(item.tags.join(", "));
    setFavorite(Boolean(item.favorite));
    setCategoryIds(item.categoryIds);
  }, [item]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(drawerRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ) ?? []),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [item.id, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(item, {
      title: title.trim(),
      tags: normalizeTags(tags),
      favorite,
      ...(categories.length || item.categoryIds.length ? { categoryIds } : {}),
    });
  }

  async function capturePreview() {
    const image = previewRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / image.naturalWidth);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    await onSave(item, { previewDataUrl: canvas.toDataURL("image/webp", 0.82) });
  }

  const suggestions = suggestMetadataTags(item)
    .filter((suggestion) => !item.tags.some((tag) => tag.toLocaleLowerCase() === suggestion.tag))
    .slice(0, 4);

  return (
    <aside
      ref={drawerRef}
      className="item-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-drawer-title"
    >
      <div className="item-drawer__header">
        <div>
          <span className="section-eyebrow">Item details</span>
          <h2 id="item-drawer-title">{item.title || "Untitled"}</h2>
        </div>
        <button
          ref={closeButtonRef}
          className="icon-button"
          type="button"
          aria-label="Close item details"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="item-drawer__preview">
        <MediaPreview item={item} imageRef={previewRef} />
      </div>
      <div className="preview-actions">
        <button type="button" disabled={busy} onClick={() => void capturePreview()}>
          Use current frame
        </button>
        {item.previewDataUrl ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave(item, { clearPreview: true })}
          >
            Restore animated preview
          </button>
        ) : null}
      </div>
      <form className="item-drawer__form" onSubmit={(event) => void submit(event)}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Tags
          <input
            aria-label="Tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="reaction, celebration"
          />
          <small>Separate tags with commas.</small>
        </label>
        {suggestions.length ? (
          <div className="tag-suggestions" aria-label="Local tag suggestions">
            <span>Suggested locally</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.tag}
                type="button"
                onClick={() => setTags(normalizeTags(`${tags},${suggestion.tag}`).join(", "))}
              >
                + #{suggestion.tag}
              </button>
            ))}
          </div>
        ) : null}
        {categories.length ? (
          <fieldset className="drawer-categories">
            <legend>Categories</legend>
            {categories.map((category) => (
              <label key={category.id}>
                <input
                  type="checkbox"
                  checked={categoryIds.includes(category.id)}
                  onChange={(event) =>
                    setCategoryIds((values) =>
                      event.target.checked
                        ? [...new Set([...values, category.id])]
                        : values.filter((value) => value !== category.id),
                    )
                  }
                />
                <i style={{ background: category.color }} aria-hidden="true" />
                {category.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        <label className="check-row">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(event) => setFavorite(event.target.checked)}
          />
          Keep in favorites
        </label>
        <dl className="item-drawer__facts">
          <div>
            <dt>File</dt>
            <dd>
              {item.extension.toUpperCase()} · {formatBytes(item.byteSize)}
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{sourceHost(item)}</dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd>{formatDate(item.createdAt)}</dd>
          </div>
        </dl>
        <div className="item-drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
        <button
          className="text-button text-button--danger"
          type="button"
          disabled={busy}
          onClick={() => void onDelete(item)}
        >
          Delete item
        </button>
      </form>
    </aside>
  );
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

function Overview({
  items,
  onOpenLibrary,
}: {
  items: readonly DashboardMediaRecord[];
  onOpenLibrary: () => void;
}) {
  const totalBytes = items.reduce((sum, item) => sum + item.byteSize, 0);
  const favorites = items.filter((item) => item.favorite).length;
  const uses = items.reduce((sum, item) => sum + usageCount(item), 0);
  const recent = [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);
  const recentlyUsed = [...items]
    .filter((item) => item.lastUsedAt)
    .sort((left, right) => (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? ""))
    .slice(0, 4);
  const mostUsed = [...items]
    .filter((item) => usageCount(item) > 0)
    .sort((left, right) => usageCount(right) - usageCount(left))[0];

  return (
    <section className="dashboard-section dashboard-overview">
      <SectionHeader
        eyebrow="Your reaction library"
        title="Everything ready when the moment lands."
        description="A local view of what you saved, how the library is growing, and what is worth organizing next."
      />
      <div className="overview-stats" aria-label="Library summary">
        <article>
          <span>Saved reactions</span>
          <strong>{items.length}</strong>
          <small>loaded in this view</small>
        </article>
        <article>
          <span>Favorites</span>
          <strong>{favorites}</strong>
          <small>
            {items.length
              ? `${Math.round((favorites / items.length) * 100)}% of library`
              : "No items yet"}
          </small>
        </article>
        <article>
          <span>Local storage</span>
          <strong>{formatBytes(totalBytes)}</strong>
          <small>media in this view</small>
        </article>
        <article>
          <span>Recorded uses</span>
          <strong>{uses}</strong>
          <small>copy and drag actions</small>
        </article>
      </div>
      <div className="overview-grid">
        <section className="overview-panel overview-panel--recent">
          <div className="overview-panel__heading">
            <div>
              <span className="section-eyebrow">Latest arrivals</span>
              <h2>Recently saved</h2>
            </div>
            <button className="text-button" type="button" onClick={onOpenLibrary}>
              View library
            </button>
          </div>
          {recent.length ? (
            <div className="recent-strip">
              {recent.map((item) => (
                <article key={item.id}>
                  <div className="recent-strip__preview">
                    <MediaPreview item={item} />
                  </div>
                  <h3>{item.title || "Untitled"}</h3>
                  <span>{formatDate(item.createdAt)}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="inline-empty">Saved reactions will appear here.</p>
          )}
          <div className="overview-panel__heading overview-panel__heading--secondary">
            <h2>Recently used</h2>
          </div>
          {recentlyUsed.length ? (
            <div className="recent-strip">
              {recentlyUsed.map((item) => (
                <article key={item.id}>
                  <div className="recent-strip__preview">
                    <MediaPreview item={item} />
                  </div>
                  <h3>{item.title || "Untitled"}</h3>
                  <span>{formatDate(item.lastUsedAt ?? item.updatedAt)}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="inline-empty inline-empty--compact">Used reactions will appear here.</p>
          )}
        </section>
        <section className="overview-panel overview-panel--signal">
          <span className="section-eyebrow">Local signal</span>
          <h2>{mostUsed ? "Your most-used reaction" : "Usage insights are waiting"}</h2>
          {mostUsed ? (
            <>
              <div className="signal-preview">
                <MediaPreview item={mostUsed} />
              </div>
              <strong>{mostUsed.title || "Untitled"}</strong>
              <p>{usageCount(mostUsed)} recorded copy and drag actions.</p>
            </>
          ) : (
            <p>Copy or drag a reaction and GoPaste will summarize that activity locally.</p>
          )}
        </section>
      </div>
    </section>
  );
}

export function DashboardShell({
  service,
  initialSection = "overview",
  initialView = "grid",
  initialDensity = "comfortable",
  initialDefaultAction = "copy",
  confirmDelete = (items) =>
    window.confirm(
      `Delete ${items.length === 1 ? `“${items[0]?.title || "Untitled"}”` : `${items.length} items`}?`,
    ),
  renderSection,
}: DashboardShellProps) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [items, setItems] = useState<DashboardMediaRecord[]>([]);
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [view, setView] = useState<DashboardView>(initialView);
  const [density, setDensity] = useState<DashboardDensity>(initialDensity);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [format, setFormat] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [activeItem, setActiveItem] = useState<DashboardMediaRecord>();
  const [busy, setBusy] = useState(false);
  const clipboardWriter = useMemo(() => new BrowserClipboardWriter(), []);
  const closeDrawer = useCallback(() => setActiveItem(undefined), []);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [page, categoryList] = await Promise.all([
        service.list({ limit: PAGE_SIZE }),
        service.listCategories?.() ?? Promise.resolve([]),
      ]);
      setItems(page.items);
      setCategories(categoryList);
      setNextCursor(page.nextCursor);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const tags = useMemo(
    () =>
      [...new Set(items.flatMap((item) => item.tags))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [items],
  );
  const sources = useMemo(
    () => [...new Set(items.map(sourceHost))].sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      if (query && !`${item.title} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(query))
        return false;
      if (tag && !item.tags.some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase()))
        return false;
      if (format && item.extension !== format) return false;
      if (source && sourceHost(item) !== source) return false;
      if (category && !item.categoryIds.includes(category)) return false;
      if (createdFrom && item.createdAt < `${createdFrom}T00:00:00.000Z`) return false;
      if (createdTo && item.createdAt > `${createdTo}T23:59:59.999Z`) return false;
      if (size === "small" && item.byteSize >= 1024 ** 2) return false;
      if (size === "medium" && (item.byteSize < 1024 ** 2 || item.byteSize > 10 * 1024 ** 2))
        return false;
      if (size === "large" && item.byteSize <= 10 * 1024 ** 2) return false;
      if (favoriteOnly && !item.favorite) return false;
      return true;
    });
    return filtered.sort((left, right) => {
      switch (sort) {
        case "oldest":
          return left.createdAt.localeCompare(right.createdAt);
        case "title":
          return (left.title || "Untitled").localeCompare(right.title || "Untitled");
        case "size":
          return right.byteSize - left.byteSize;
        case "used":
          return usageCount(right) - usageCount(left);
        default:
          return right.createdAt.localeCompare(left.createdAt);
      }
    });
  }, [
    category,
    createdFrom,
    createdTo,
    favoriteOnly,
    format,
    items,
    search,
    size,
    sort,
    source,
    tag,
  ]);

  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));

  function updateLocal(updated: DashboardMediaRecord) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setActiveItem((current) => (current?.id === updated.id ? updated : current));
  }

  async function updateItem(item: DashboardMediaRecord, update: DashboardItemUpdate) {
    setBusy(true);
    setNotice(undefined);
    try {
      const updated = await service.updateMediaMetadata(item.id, update);
      updateLocal({ ...item, ...updated, ...update });
      setNotice("Changes saved.");
    } catch (updateError) {
      setNotice(updateError instanceof Error ? updateError.message : "Changes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItems(targets: readonly DashboardMediaRecord[]) {
    if (!targets.length || !confirmDelete(targets)) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const ids = targets.map((item) => item.id);
      let deletedIds: string[] = [];
      const result = await service.batchDeleteMedia(ids);
      deletedIds = result.succeeded;
      const deleted = new Set(deletedIds);
      setItems((current) => current.filter((item) => !deleted.has(item.id)));
      setSelectedIds((current) => new Set([...current].filter((id) => !deleted.has(id))));
      if (activeItem && deleted.has(activeItem.id)) setActiveItem(undefined);
      setNotice(`${deleted.size} ${deleted.size === 1 ? "item" : "items"} deleted.`);
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error ? deleteError.message : "The items could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpdate(update: DashboardBatchMetadataUpdate) {
    const targets = selectedItems;
    if (!targets.length) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await service.batchUpdateMetadata(
        targets.map((item) => item.id),
        update,
      );
      const succeeded = new Set(result.succeeded);
      setItems((current) =>
        current.map((item) => (succeeded.has(item.id) ? applyBatchUpdate(item, update) : item)),
      );
      setNotice(
        `${result.succeeded.length} ${result.succeeded.length === 1 ? "item" : "items"} updated${
          result.failures.length ? `; ${result.failures.length} failed` : ""
        }.`,
      );
      setBulkTag("");
    } catch (bulkError) {
      setNotice(
        bulkError instanceof Error ? bulkError.message : "The batch update could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copySelectedSources() {
    const sources = selectedItems.map((item) => item.sourceUrl).filter(Boolean);
    if (!sources.length) return;
    try {
      await navigator.clipboard.writeText(sources.join("\n"));
      setNotice(`${sources.length} source ${sources.length === 1 ? "link" : "links"} copied.`);
    } catch {
      setNotice("Chrome could not copy the selected source links.");
    }
  }

  async function performDefaultAction(item: DashboardMediaRecord) {
    try {
      if (initialDefaultAction === "download") {
        const url = URL.createObjectURL(item.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${item.title || "gopaste-image"}.${item.extension}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setNotice("Download started locally.");
        return;
      }
      if (initialDefaultAction === "drag") {
        setNotice("Drag the “Drag file” button into Messenger or another compatible chat.");
        return;
      }
      await clipboardWriter.writeImage(item.blob, item.sourceUrl);
      await service.recordUsage?.(item.id, "copy");
      setNotice("Image copied using your dashboard default.");
    } catch (actionError) {
      setNotice(
        actionError instanceof Error ? actionError.message : "The action could not finish.",
      );
    }
  }

  function dragItem(event: DragEvent<HTMLButtonElement>, item: DashboardMediaRecord) {
    const result = setImageFileDragData(event.dataTransfer, item);
    if (result === "none") {
      event.preventDefault();
      setNotice("This image could not be prepared for file drag.");
      return;
    }
    void service.recordUsage?.(item.id, "drag");
    setNotice(
      result === "file"
        ? "Dragging image file. Drop it into Messenger."
        : "File drag is unavailable; dragging the original image link instead.",
    );
  }

  function selectItem(item: DashboardMediaRecord, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  }

  function selectVisible(selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of visibleItems) {
        if (selected) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await service.list({ limit: PAGE_SIZE, cursor: nextCursor });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : "More items could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  const customSection =
    section !== "overview" && section !== "library" ? renderSection?.(section, items) : null;

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <BrandMark />
          <div>
            <strong>GoPaste</strong>
            <span>Local dashboard</span>
          </div>
        </div>
        <nav aria-label="Dashboard sections">
          {NAVIGATION.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "is-active" : ""}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span aria-hidden="true">{item.shortLabel}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="dashboard-sidebar__note">
          <span className="status-dot" aria-hidden="true" />
          <p>
            <strong>Device only</strong>
            Your library stays in this browser.
          </p>
        </div>
      </aside>

      <div className="dashboard-main">
        {notice ? (
          <div className="dashboard-notice" role="status" aria-live="polite">
            {notice}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(undefined)}
            >
              ×
            </button>
          </div>
        ) : null}

        {loading ? (
          <section className="dashboard-state" role="status">
            <span className="dashboard-state__pulse" aria-hidden="true" />
            <h1>Loading your library</h1>
            <p>Gathering local reactions and metadata…</p>
          </section>
        ) : error ? (
          <section className="dashboard-state dashboard-state--error" role="alert">
            <span className="section-eyebrow">Something went wrong</span>
            <h1>The library could not be loaded.</h1>
            <p>{error}</p>
            <button className="button" type="button" onClick={() => void loadFirstPage()}>
              Try again
            </button>
          </section>
        ) : section === "overview" ? (
          <Overview items={items} onOpenLibrary={() => setSection("library")} />
        ) : section === "library" ? (
          <section className="dashboard-section dashboard-library">
            <SectionHeader
              eyebrow="Browse and organize"
              title="Library"
              description="Find the right reaction, keep favorites close, and tidy metadata in one place."
            />

            <div className="library-toolbar">
              <label className="dashboard-search">
                <span className="visually-hidden">Search library</span>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search titles and tags"
                />
              </label>
              <label>
                <span className="visually-hidden">Filter by tag</span>
                <select value={tag} onChange={(event) => setTag(event.target.value)}>
                  <option value="">All tags</option>
                  {tags.map((value) => (
                    <option key={value.toLocaleLowerCase()} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Filter by format</span>
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="">All formats</option>
                  <option value="gif">GIF</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </select>
              </label>
              <label>
                <span className="visually-hidden">Filter by source</span>
                <select value={source} onChange={(event) => setSource(event.target.value)}>
                  <option value="">All sources</option>
                  {sources.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Filter by category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Filter by file size</span>
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  <option value="">All sizes</option>
                  <option value="small">Under 1 MiB</option>
                  <option value="medium">1–10 MiB</option>
                  <option value="large">Over 10 MiB</option>
                </select>
              </label>
              <label className="date-filter">
                <span>Saved after</span>
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(event) => setCreatedFrom(event.target.value)}
                />
              </label>
              <label className="date-filter">
                <span>Saved before</span>
                <input
                  type="date"
                  value={createdTo}
                  onChange={(event) => setCreatedTo(event.target.value)}
                />
              </label>
              <label>
                <span className="visually-hidden">Sort library</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                  <option value="size">Largest first</option>
                  <option value="used">Most used</option>
                </select>
              </label>
            </div>

            <div className="library-viewbar">
              <div className="library-viewbar__scope">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => selectVisible(event.target.checked)}
                  />
                  Select visible
                </label>
                <button
                  className={`filter-chip${favoriteOnly ? " is-active" : ""}`}
                  type="button"
                  aria-pressed={favoriteOnly}
                  onClick={() => setFavoriteOnly((value) => !value)}
                >
                  ★ Favorites
                </button>
                <span>{visibleItems.length} shown</span>
              </div>
              <div className="library-viewbar__display">
                {view === "grid" ? (
                  <fieldset className="density-switcher">
                    <legend className="visually-hidden">Grid density</legend>
                    {(["compact", "comfortable", "spacious"] as const).map((value) => (
                      <button
                        key={value}
                        className={density === value ? "is-active" : ""}
                        type="button"
                        aria-label={`${value} grid density`}
                        aria-pressed={density === value}
                        onClick={() => setDensity(value)}
                      >
                        {value === "compact" ? "•••" : value === "comfortable" ? "••" : "•"}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
                <div className="view-switcher" role="group" aria-label="Library view">
                  <button
                    className={view === "grid" ? "is-active" : ""}
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    Grid
                  </button>
                  <button
                    className={view === "list" ? "is-active" : ""}
                    type="button"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>

            {!items.length ? (
              <section className="library-empty">
                <div className="library-empty__art" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="section-eyebrow">A clean slate</span>
                <h2>Save your first reaction</h2>
                <p>Right-click an image on the web and choose “Save to GoPaste.”</p>
              </section>
            ) : !visibleItems.length ? (
              <section className="library-empty">
                <span className="section-eyebrow">No matches</span>
                <h2>Nothing fits these filters</h2>
                <p>Clear a filter or try a broader search.</p>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setTag("");
                    setFormat("");
                    setSource("");
                    setCategory("");
                    setSize("");
                    setCreatedFrom("");
                    setCreatedTo("");
                    setFavoriteOnly(false);
                  }}
                >
                  Clear filters
                </button>
              </section>
            ) : (
              <>
                <div className={`library-items library-items--${view} density--${density}`}>
                  {visibleItems.map((item) => (
                    <MediaItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      view={view}
                      onSelect={selectItem}
                      onFavorite={(target) =>
                        void updateItem(target, { favorite: !target.favorite })
                      }
                      onOpen={setActiveItem}
                      defaultAction={initialDefaultAction}
                      onUse={(target) => void performDefaultAction(target)}
                      onDrag={dragItem}
                    />
                  ))}
                </div>
                {nextCursor ? (
                  <button
                    className="button button--secondary load-more"
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading more…" : "Load more"}
                  </button>
                ) : null}
              </>
            )}

            {selectedItems.length ? (
              <div className="bulk-bar" role="region" aria-label="Bulk actions">
                <strong>{selectedItems.length} selected</strong>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bulkUpdate({ favorite: true })}
                >
                  ★ Favorite
                </button>
                <div className="bulk-bar__tag">
                  <label>
                    <span className="visually-hidden">Tag selected items</span>
                    <input
                      value={bulkTag}
                      onChange={(event) => setBulkTag(event.target.value)}
                      placeholder="Add a tag"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !bulkTag.trim()}
                    onClick={() => void bulkUpdate({ addTags: normalizeTags(bulkTag) })}
                  >
                    Apply
                  </button>
                </div>
                {categories.length ? (
                  <div className="bulk-bar__tag">
                    <label>
                      <span className="visually-hidden">Move selected items to category</span>
                      <select
                        value={bulkCategory}
                        onChange={(event) => setBulkCategory(event.target.value)}
                      >
                        <option value="">Move to category…</option>
                        {categories.map((value) => (
                          <option key={value.id} value={value.id}>
                            {value.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !bulkCategory}
                      onClick={() => void bulkUpdate({ categoryIds: [bulkCategory] })}
                    >
                      Move
                    </button>
                  </div>
                ) : null}
                <button type="button" disabled={busy} onClick={() => void copySelectedSources()}>
                  Copy links
                </button>
                <button
                  className="bulk-bar__danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteItems(selectedItems)}
                >
                  Delete
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => setSelectedIds(new Set())}
                >
                  ×
                </button>
              </div>
            ) : null}
          </section>
        ) : customSection ? (
          customSection
        ) : (
          <section className="dashboard-section dashboard-placeholder">
            <SectionHeader {...SECTION_COPY[section]} />
            <div>
              <span className="dashboard-placeholder__mark" aria-hidden="true">
                {NAVIGATION.find((item) => item.id === section)?.shortLabel}
              </span>
              <h2>Ready for local tools</h2>
              <p>
                This workspace will use the same on-device library shown in Overview and Library.
              </p>
            </div>
          </section>
        )}
      </div>

      {activeItem ? (
        <>
          <button
            className="drawer-scrim"
            type="button"
            aria-label="Close item details"
            onClick={closeDrawer}
          />
          <ItemDrawer
            item={activeItem}
            categories={categories}
            busy={busy}
            onClose={closeDrawer}
            onSave={updateItem}
            onDelete={async (item) => deleteItems([item])}
          />
        </>
      ) : null}
    </main>
  );
}
