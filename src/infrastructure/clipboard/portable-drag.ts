import { portableSourceUrl } from "./browser-clipboard-writer";
import type { MediaRecord } from "../../core/domain/media";

export type ImageDragResult = "file" | "url" | "none";
export const GOPASTE_MEDIA_DRAG_TYPE = "application/x-gopaste-media";

type FileDragDataTransfer = Pick<DataTransfer, "setData" | "effectAllowed"> & {
  items: Pick<DataTransferItemList, "add">;
};

function fileName(item: Pick<MediaRecord, "title" | "extension">): string {
  const stem = item.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  return `${stem || "gopaste-image"}.${item.extension}`;
}

function addPortableSourceData(
  dataTransfer: Pick<DataTransfer, "setData">,
  sourceUrl?: string,
  mediaId?: string,
): boolean {
  const url = portableSourceUrl(sourceUrl);
  if (!url) return false;
  const uriList = mediaId ? `# gopaste-media=${encodeURIComponent(mediaId)}\n${url}` : url;
  dataTransfer.setData("text/uri-list", uriList);
  dataTransfer.setData("text/plain", url);
  return true;
}

/**
 * Adds a real image File synchronously during dragstart, which chat targets
 * such as Messenger can receive as an attachment. A source URL is included as
 * a compatibility fallback for targets that only accept links.
 */
export function setImageFileDragData(
  dataTransfer: FileDragDataTransfer | null,
  item: Pick<MediaRecord, "id" | "blob" | "mimeType" | "title" | "extension" | "sourceUrl">,
): ImageDragResult {
  if (!dataTransfer) return "none";

  dataTransfer.effectAllowed = "copy";
  try {
    const imageFile = new File([item.blob], fileName(item), { type: item.mimeType });
    dataTransfer.items.add(imageFile);
    dataTransfer.setData(GOPASTE_MEDIA_DRAG_TYPE, item.id);
    addPortableSourceData(dataTransfer, item.sourceUrl, item.id);
    return "file";
  } catch {
    return addPortableSourceData(dataTransfer, item.sourceUrl) ? "url" : "none";
  }
}

/**
 * Adds only cross-context URL formats. In particular, it never advertises an
 * extension-scoped object URL as a portable file.
 */
export function setPortableDragData(
  dataTransfer: Pick<DataTransfer, "setData" | "effectAllowed"> | null,
  sourceUrl?: string,
): boolean {
  if (!dataTransfer) return false;

  dataTransfer.effectAllowed = "copy";
  return addPortableSourceData(dataTransfer, sourceUrl);
}
