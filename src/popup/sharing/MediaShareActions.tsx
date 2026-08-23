import { useId, useMemo, useState, type DragEvent } from "react";
import type { MediaRecord } from "../../core/domain/media";
import type { ClipboardWriter } from "../../core/ports/platform";
import { BrowserClipboardWriter } from "../../infrastructure/clipboard/browser-clipboard-writer";
import { setImageFileDragData } from "../../infrastructure/clipboard/portable-drag";

export interface MediaShareActionsProps {
  item: MediaRecord;
  clipboardWriter?: ClipboardWriter;
  onUsage?: (action: "copy" | "drag") => void | Promise<void>;
}

export type ShareState =
  | { state: "idle"; message: string }
  | { state: "copying"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export function MediaShareActions({ item, clipboardWriter, onUsage }: MediaShareActionsProps) {
  const defaultWriter = useMemo(() => new BrowserClipboardWriter(), []);
  const writer = clipboardWriter ?? defaultWriter;
  const statusId = useId();
  const [status, setStatus] = useState<ShareState>({ state: "idle", message: "" });

  async function copyFromUserGesture() {
    setStatus({ state: "copying", message: "Copying…" });
    try {
      const result = await writer.writeImage(item.blob, item.sourceUrl);
      setStatus(
        result.method === "binary"
          ? { state: "success", message: "Binary image copied." }
          : {
              state: "success",
              message: "Original URL copied because binary image copy was unavailable.",
            },
      );
      await onUsage?.("copy");
    } catch {
      setStatus({
        state: "error",
        message: "Could not copy this image or its original URL.",
      });
    }
  }

  function startDrag(event: DragEvent<HTMLButtonElement>) {
    const result = setImageFileDragData(event.dataTransfer, item);
    if (result === "file") {
      setStatus({ state: "success", message: "Dragging image file. Drop it into Messenger." });
      void onUsage?.("drag");
      return;
    }

    if (result === "url") {
      setStatus({
        state: "error",
        message: "File drag is unavailable; dragging the original image link instead.",
      });
      void onUsage?.("drag");
      return;
    }

    event.preventDefault();
    setStatus({ state: "error", message: "This image could not be prepared for file drag." });
  }

  return (
    <div className="media-share-actions" role="group" aria-label={`Share ${item.title}`}>
      <button
        className="button--primary"
        type="button"
        onClick={() => void copyFromUserGesture()}
        disabled={status.state === "copying"}
        aria-describedby={statusId}
      >
        {status.state === "copying" ? "Copying…" : "Copy"}
      </button>
      <button
        className="button--quiet"
        type="button"
        draggable
        onDragStart={startDrag}
        aria-describedby={statusId}
        title="Drag the image file into Messenger or another chat"
      >
        Drag to chat
      </button>
      <span id={statusId} className="media-share-actions__status" role="status">
        {status.message}
      </span>
    </div>
  );
}
