import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import type { DashboardCategory, DashboardMediaQuery } from "../core/domain/dashboard";
import type { MediaRecord } from "../core/domain/media";
import type { ClipboardWriter } from "../core/ports/platform";
import { BrowserClipboardWriter } from "../infrastructure/clipboard/browser-clipboard-writer";
import { setImageFileDragData } from "../infrastructure/clipboard/portable-drag";
import { BrandMark } from "../shared/BrandMark";
import type { CaptureStatus } from "../shared/messages";

const PAGE_SIZE = 24;

export interface PopupLibrary {
  list(query: DashboardMediaQuery): Promise<{
    items: MediaRecord[];
    nextCursor?: string;
  }>;
  listCategories(): Promise<DashboardCategory[]>;
}

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
      return undefined;
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
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>();
  const [refreshToken, setRefreshToken] = useState(0);
  const defaultClipboardWriter = useMemo(() => new BrowserClipboardWriter(), []);
  const writer = clipboardWriter ?? defaultClipboardWriter;

  const query = useMemo<DashboardMediaQuery>(
    () => ({
      limit: PAGE_SIZE,
      ...(category ? { categoryIds: [category] } : {}),
    }),
    [category],
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

  const loadCategories = useCallback(async () => {
    try {
      const nextCategories = await library.listCategories();
      setCategories(nextCategories);
      setCategory((current) =>
        current && !nextCategories.some((item) => item.id === current) ? "" : current,
      );
    } catch {
      setCategories([]);
    }
  }, [library]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories, refreshToken]);

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

      <div className="library-controls">
        <label>
          <span className="visually-hidden">Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
        <section className={`library-state${category ? "" : " library-empty"}`}>
          {category ? (
            <>
              <h2>No images in this category</h2>
              <p>Choose another category to browse more saved media.</p>
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
