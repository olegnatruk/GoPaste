import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import type { MediaPageQuery, MediaRecord } from "../core/domain/media";
import type { MediaRepository } from "../core/ports/media-repository";
import type { ClipboardWriter } from "../core/ports/platform";
import { BrowserClipboardWriter } from "../infrastructure/clipboard/browser-clipboard-writer";
import { setImageFileDragData } from "../infrastructure/clipboard/portable-drag";
import { BrandMark } from "../shared/BrandMark";
import type { CaptureStatus } from "../shared/messages";

const PAGE_SIZE = 24;

export type PopupLibrary = Pick<MediaRepository, "list">;

export interface PopupShellProps {
  library: PopupLibrary;
  loadCaptureStatus?: () => Promise<CaptureStatus>;
  subscribeToLibraryChanges?: (onChange: () => void) => () => void;
  clipboardWriter?: ClipboardWriter;
  onCopyUsage?: (item: MediaRecord) => void | Promise<void>;
  onDragUsage?: (item: MediaRecord) => void | Promise<void>;
  onOpenDashboard?: () => void;
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
  onCopy: (item: MediaRecord) => void;
  onDragStart: (event: DragEvent<HTMLImageElement>, item: MediaRecord) => void;
}

function MediaCard({ item, onCopy, onDragStart }: MediaCardProps) {
  const imageUrl = useObjectUrl(item.blob);

  return (
    <article className="media-card" aria-label={item.title || "Untitled image"}>
      <div className="media-card__preview">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title || "Saved image"}
            aria-label={`Copy ${item.title || "saved image"} to clipboard; drag to Messenger`}
            draggable
            loading="lazy"
            role="button"
            tabIndex={0}
            title="Click to copy. Drag to Messenger."
            onClick={() => onCopy(item)}
            onDragStart={(event) => onDragStart(event, item)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onCopy(item);
            }}
          />
        ) : (
          <span>Loading preview…</span>
        )}
      </div>
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
      </div>
    </article>
  );
}

export function PopupShell({
  library,
  loadCaptureStatus,
  subscribeToLibraryChanges,
  clipboardWriter,
  onCopyUsage,
  onDragUsage,
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
  const defaultClipboardWriter = useMemo(() => new BrowserClipboardWriter(), []);
  const writer = clipboardWriter ?? defaultClipboardWriter;

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

  function startImageDrag(event: DragEvent<HTMLImageElement>, item: MediaRecord) {
    const result = setImageFileDragData(event.dataTransfer, item);
    if (result === "none") {
      event.preventDefault();
      setNotice("This image could not be prepared for drag and drop.");
      return;
    }
    setNotice(
      result === "file"
        ? "Dragging image file. Drop it into Messenger."
        : "File drag is unavailable; dragging the original image link instead.",
    );
    void onDragUsage?.(item);
  }

  async function copyImage(item: MediaRecord) {
    setNotice("Copying image…");
    try {
      const result = await writer.writeImage(item.blob, undefined, item.id);
      if (result.method !== "binary") {
        throw new Error("Binary clipboard copy was not available.");
      }
      setNotice("Image copied. Paste in Messenger to attach it.");
      void onCopyUsage?.(item);
    } catch {
      setNotice("Chrome could not copy this item as a binary image or GIF.");
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
                onCopy={(target) => void copyImage(target)}
                onDragStart={startImageDrag}
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
