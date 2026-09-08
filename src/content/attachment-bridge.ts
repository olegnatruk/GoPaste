const GOPASTE_MEDIA_DRAG_TYPE = "application/x-gopaste-media-v2";
const GOPASTE_MEDIA_URI_MARKER = "gopaste-media-v2";
const GOPASTE_CLIPBOARD_MEDIA_PREFIX = "gopaste-media-v2:";
const ATTACHMENT_RESOLVE_MESSAGE = "attachment/resolve";
const TOAST_ID = "gopaste-attachment-status";
const IMAGE_FILE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const CONTEXT_INVALIDATED_MESSAGE = "GoPaste was updated. Open its popup once, then try again.";

function isMessengerPage(): boolean {
  return (
    /(^|\.)messenger\.com$/.test(location.hostname) ||
    (/(^|\.)facebook\.com$/.test(location.hostname) && location.pathname.startsWith("/messages"))
  );
}

type AttachmentResolveResponse = {
  ok?: boolean;
  attachment?: { base64: string; filename: string; mimeType: string };
};

type FileConstructor = new (bits: BlobPart[], name: string, options?: FilePropertyBag) => File;
type DataTransferConstructor = new () => DataTransfer;

export interface AttachmentBridgeOptions {
  document: Document;
  sendMessage: (message: {
    type: typeof ATTACHMENT_RESOLVE_MESSAGE;
    mediaId: string;
  }) => Promise<unknown>;
  FileConstructor: FileConstructor;
  DataTransferConstructor: DataTransferConstructor;
  notify: (message: string, isError?: boolean) => void;
}

function markerFromUriList(value: string): string | undefined {
  const match = value.match(new RegExp(`^#\\s*${GOPASTE_MEDIA_URI_MARKER}=([^\\s]+)`, "m"));
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function markerFromClipboard(value: string): string | undefined {
  if (!value.startsWith(GOPASTE_CLIPBOARD_MEDIA_PREFIX)) return undefined;
  const mediaId = value.slice(GOPASTE_CLIPBOARD_MEDIA_PREFIX.length).trim();
  return mediaId || undefined;
}

function acceptsImageFile(input: HTMLInputElement): boolean {
  const acceptedTypes = input.accept
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    acceptedTypes.length === 0 ||
    acceptedTypes.some(
      (value) =>
        value === "*/*" ||
        value === "image/*" ||
        value.startsWith("image/") ||
        IMAGE_FILE_EXTENSIONS.has(value),
    )
  );
}

function isEnabledFileInput(input: HTMLInputElement): boolean {
  return input.type === "file" && !input.disabled;
}

function isAttachmentInput(input: HTMLInputElement): boolean {
  return isEnabledFileInput(input) && acceptsImageFile(input);
}

function inputFromElement(
  element: Element,
  matches: (input: HTMLInputElement) => boolean,
): HTMLInputElement | undefined {
  if (element instanceof HTMLInputElement && matches(element)) return element;

  const labelInput = element
    .closest("label")
    ?.querySelector<HTMLInputElement>('input[type="file"]');
  return labelInput && matches(labelInput) ? labelInput : undefined;
}

export function findAttachmentInput(
  documentRef: Document,
  target: EventTarget | null,
  path: readonly EventTarget[] = [],
): HTMLInputElement | undefined {
  const inspected = new Set<EventTarget>();
  for (const candidate of [...path, target].filter((value): value is EventTarget =>
    Boolean(value),
  )) {
    if (inspected.has(candidate)) continue;
    inspected.add(candidate);
    if (candidate instanceof Element) {
      const input = inputFromElement(candidate, isEnabledFileInput);
      if (input) return input;
    }
  }

  const inputs = Array.from(documentRef.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return inputs.find(isAttachmentInput) ?? inputs.find(isEnabledFileInput);
}

function bytesFromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

function isAttachmentResponse(value: unknown): value is Required<AttachmentResolveResponse> {
  if (!value || typeof value !== "object") return false;
  const response = value as AttachmentResolveResponse;
  return Boolean(
    response.ok &&
    response.attachment &&
    typeof response.attachment.base64 === "string" &&
    typeof response.attachment.filename === "string" &&
    typeof response.attachment.mimeType === "string",
  );
}

function defaultNotify(documentRef: Document, message: string, isError = false): void {
  documentRef.getElementById(TOAST_ID)?.remove();
  const notice = documentRef.createElement("div");
  notice.id = TOAST_ID;
  notice.textContent = `GoPaste: ${message}`;
  notice.setAttribute("role", "status");
  Object.assign(notice.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    maxWidth: "280px",
    padding: "10px 12px",
    border: "1px solid",
    borderRadius: "8px",
    color: isError ? "#6f211c" : "#183622",
    background: isError ? "#f9e8e5" : "#bdf45d",
    font: "700 12px/1.4 system-ui, sans-serif",
  });
  documentRef.documentElement.append(notice);
  window.setTimeout(() => notice.remove(), isError ? 5200 : 2600);
}

function runtimeCanSendMessages(): boolean {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
  } catch {
    return false;
  }
}

function defaultOptions(): AttachmentBridgeOptions | undefined {
  if (
    !runtimeCanSendMessages() ||
    typeof document === "undefined" ||
    typeof File === "undefined" ||
    typeof DataTransfer === "undefined"
  ) {
    return undefined;
  }

  return {
    document,
    sendMessage: (message) => {
      try {
        const runtime = chrome.runtime;
        if (!runtime?.sendMessage) throw new Error(CONTEXT_INVALIDATED_MESSAGE);
        return Promise.resolve(runtime.sendMessage(message));
      } catch (error) {
        return Promise.reject(
          error instanceof Error && error.message === CONTEXT_INVALIDATED_MESSAGE
            ? error
            : new Error(CONTEXT_INVALIDATED_MESSAGE),
        );
      }
    },
    FileConstructor: File,
    DataTransferConstructor: DataTransfer,
    notify: (message, isError) => defaultNotify(document, message, isError),
  };
}

/**
 * Attaches marked GoPaste media to a page's image-compatible file input.
 * Other page drops and pastes are deliberately left to the website.
 */
export function installAttachmentBridge(
  overrides: Partial<AttachmentBridgeOptions> = {},
): () => void {
  if (!overrides.document && isMessengerPage()) return () => undefined;
  const defaults = defaultOptions();
  const options = { ...defaults, ...overrides } as AttachmentBridgeOptions;
  if (
    !options.document ||
    !options.sendMessage ||
    !options.FileConstructor ||
    !options.DataTransferConstructor ||
    !options.notify
  ) {
    return () => undefined;
  }

  async function attachMedia(input: HTMLInputElement, mediaId: string): Promise<void> {
    options.notify("Attaching image…");
    let response: unknown;
    try {
      response = await options.sendMessage({ type: ATTACHMENT_RESOLVE_MESSAGE, mediaId });
    } catch (error) {
      if (error instanceof Error && /context invalidated/i.test(error.message)) {
        throw new Error(CONTEXT_INVALIDATED_MESSAGE);
      }
      throw error;
    }
    if (!isAttachmentResponse(response)) throw new Error("Image could not be loaded.");

    const file = new options.FileConstructor(
      [bytesFromBase64(response.attachment.base64)],
      response.attachment.filename,
      { type: response.attachment.mimeType },
    );
    const transfer = new options.DataTransferConstructor();
    transfer.items.add(file);
    const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    if (!filesSetter) throw new Error("This browser cannot attach the image here.");
    filesSetter.call(input, transfer.files);
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    options.notify("Image attached.");
  }

  function handleMedia(event: DragEvent | ClipboardEvent, mediaId: string | undefined): void {
    if (!mediaId) return;
    const path = event.composedPath?.() ?? [];
    const input = findAttachmentInput(options.document, event.target, path);
    if (!input) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void attachMedia(input, mediaId).catch((error: unknown) => {
      options.notify(error instanceof Error ? error.message : "Image could not be attached.", true);
    });
  }

  const handleDrop = (event: DragEvent) => {
    const mediaId =
      event.dataTransfer?.getData(GOPASTE_MEDIA_DRAG_TYPE) ||
      markerFromUriList(event.dataTransfer?.getData("text/uri-list") ?? "");
    handleMedia(event, mediaId);
  };
  const handlePaste = (event: ClipboardEvent) => {
    handleMedia(event, markerFromClipboard(event.clipboardData?.getData("text/plain") ?? ""));
  };

  options.document.defaultView?.addEventListener("drop", handleDrop, true);
  options.document.defaultView?.addEventListener("paste", handlePaste, true);
  return () => {
    options.document.defaultView?.removeEventListener("drop", handleDrop, true);
    options.document.defaultView?.removeEventListener("paste", handlePaste, true);
  };
}

export const attachmentBridgeContracts = {
  attachmentResolveMessage: ATTACHMENT_RESOLVE_MESSAGE,
  clipboardPrefix: GOPASTE_CLIPBOARD_MEDIA_PREFIX,
  mediaDragType: GOPASTE_MEDIA_DRAG_TYPE,
};
