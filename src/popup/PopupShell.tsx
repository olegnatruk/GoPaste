import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { MediaPageQuery, MediaRecord } from "../core/domain/media";
import type { MediaRepository } from "../core/ports/media-repository";
import { BrandMark } from "../shared/BrandMark";
import type { CaptureStatus } from "../shared/messages";

const PAGE_SIZE = 24;

export interface PopupLibrary {
  list: MediaRepository["list"];
  updateMetadata: MediaRepository["updateMetadata"];
  delete: MediaRepository["delete"];
}

export interface PopupShellProps {
  library: PopupLibrary;
  loadCaptureStatus?: () => Promise<CaptureStatus>;
  subscribeToLibraryChanges?: (onChange: () => void) => () => void;
  confirmDelete?: (item: MediaRecord) => boolean;
  renderShareActions?: (item: MediaRecord) => ReactNode;
  onOpenDashboard?: () => void;
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

function captureMessage(status: CaptureStatus): string | undefined {
  switch (status.state) {
    case "saving":
      return "Saving image…";
    case "saved":
      return "Image saved to your library.";
    case "duplicate":
      return "That image is already in your library.";
    case "failed":
      return status.error?.message ?? "The image could not be saved.";
    default:
      return undefined;
  }
}

function useObjectUrl(blob: Blob): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

interface MediaCardProps {
  item: MediaRecord;
  onSave: (item: MediaRecord, title: string, tags: string[]) => Promise<void>;
  onDelete: (item: MediaRecord) => Promise<void>;
  renderShareActions?: (item: MediaRecord) => ReactNode;
}

function MediaCard({ item, onSave, onDelete, renderShareActions }: MediaCardProps) {
  const imageUrl = useObjectUrl(item.blob);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(item, title, normalizeTags(tags));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setTitle(item.title);
    setTags(item.tags.join(", "));
    setEditing(false);
  }

  return (
    <article
      className={`media-card${editing ? " media-card--editing" : ""}`}
      aria-label={item.title || "Untitled image"}
    >
      <div className="media-card__preview">
        {imageUrl ? (
          <img src={imageUrl} alt={item.title || "Saved image"} loading="lazy" />
        ) : (
          <span>Loading preview…</span>
        )}
      </div>

      {editing ? (
        <form className="media-card__editor" onSubmit={(event) => void save(event)}>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Tags
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="funny, reaction"
              aria-describedby={`tag-help-${item.id}`}
            />
          </label>
          <small id={`tag-help-${item.id}`}>Separate tags with commas.</small>
          <div className="media-card__actions media-card__actions--edit">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancelEdit} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="media-card__body">
          <h2>{item.title || "Untitled"}</h2>
          {item.tags.length ? (
            <ul className="tag-list" aria-label="Tags">
              {item.tags.map((tag) => (
                <li key={tag.toLocaleLowerCase()}>{tag}</li>
              ))}
            </ul>
          ) : (
            <span className="media-card__untagged">Untagged</span>
          )}
          <div className="media-card__actions">
            {renderShareActions?.(item)}
            <button className="button--quiet" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="button--danger" type="button" onClick={() => void onDelete(item)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function PopupShell({
  library,
  loadCaptureStatus,
  subscribeToLibraryChanges,
  confirmDelete = (item) => window.confirm(`Delete “${item.title || "Untitled"}”?`),
  renderShareActions,
  onOpenDashboard,
}: PopupShellProps) {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>();
  const [refreshToken, setRefreshToken] = useState(0);

  const query = useMemo<MediaPageQuery>(
    () => ({
      limit: PAGE_SIZE,
      ...(search.trim() ? { search } : {}),
      ...(category ? { tags: [category] } : {}),
    }),
    [category, search],
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await library.list(query);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [library, query]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, refreshToken]);

  useEffect(() => {
    if (!loadCaptureStatus) return;
    let active = true;
    void loadCaptureStatus()
      .then((status) => {
        if (active) setCaptureStatus(status);
      })
      .catch(() => {
        if (active) setCaptureStatus(undefined);
      });
    return () => {
      active = false;
    };
  }, [loadCaptureStatus, refreshToken]);

  useEffect(() => {
    if (!subscribeToLibraryChanges) return;
    return subscribeToLibraryChanges(() => setRefreshToken((value) => value + 1));
  }, [subscribeToLibraryChanges]);

  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of items) {
      for (const tag of item.tags) values.set(tag.toLocaleLowerCase(), tag);
    }
    if (category) values.set(category.toLocaleLowerCase(), category);
    return [...values.values()].sort((left, right) => left.localeCompare(right));
  }, [category, items]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(undefined);
    try {
      const page = await library.list({ ...query, cursor: nextCursor });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "More images could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveItem(item: MediaRecord, title: string, tags: string[]) {
    setNotice(undefined);
    try {
      const updated = await library.updateMetadata(item.id, { title, tags });
      setItems((current) => current.map((value) => (value.id === updated.id ? updated : value)));
      setNotice("Changes saved.");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "Changes could not be saved.");
      throw saveError;
    }
  }

  async function deleteItem(item: MediaRecord) {
    if (!confirmDelete(item)) return;
    setNotice(undefined);
    try {
      const deleted = await library.delete(item.id);
      if (!deleted) throw new Error("The image no longer exists.");
      setItems((current) => current.filter((value) => value.id !== item.id));
      setNotice("Image deleted.");
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error ? deleteError.message : "The image could not be deleted.",
      );
    }
  }

  const captureNotice = captureStatus ? captureMessage(captureStatus) : undefined;

  return (
    <main className="surface surface--popup">
      <header className="surface__header popup-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <h1>GoPaste</h1>
            <p>Reaction library</p>
          </div>
        </div>
        <div className="popup-header__actions">
          {onOpenDashboard ? (
            <button type="button" onClick={onOpenDashboard}>
              Dashboard
            </button>
          ) : null}
          <span className="popup-header__count" aria-label={`${items.length} images shown`}>
            <strong>{items.length}</strong>
            <span>saved</span>
          </span>
        </div>
      </header>

      {captureNotice ? (
        <p className={`capture-status capture-status--${captureStatus?.state}`} role="status">
          {captureNotice}
        </p>
      ) : null}

      <div className="library-controls" role="search">
        <label className="search-field">
          <span className="visually-hidden">Search library</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles and tags"
          />
        </label>
        <label>
          <span className="visually-hidden">Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((tag) => (
              <option key={tag.toLocaleLowerCase()} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>

      {notice ? (
        <p className="action-notice" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      {error ? (
        <section className="library-state library-state--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadFirstPage()}>
            Try again
          </button>
        </section>
      ) : null}

      {loading ? (
        <p className="library-state" role="status">
          Loading your library…
        </p>
      ) : items.length === 0 && !error ? (
        <section className={`library-state${search || category ? "" : " library-empty"}`}>
          {search || category ? (
            <>
              <h2>No matching images</h2>
              <p>Try a different search or category.</p>
            </>
          ) : (
            <>
              <div className="library-empty__visual" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Your library is empty</h2>
              <p>Save the perfect reaction without downloading it first.</p>
              <div className="library-empty__hint">
                <kbd>Right-click</kbd>
                <span>an image, then choose</span>
                <strong>Save to GoPaste</strong>
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          <section className="media-grid" aria-label="Saved images">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onSave={saveItem}
                onDelete={deleteItem}
                renderShareActions={renderShareActions}
              />
            ))}
          </section>
          {nextCursor ? (
            <button
              className="load-more"
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}
