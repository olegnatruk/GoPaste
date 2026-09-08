import { afterEach, describe, expect, it, vi } from "vitest";

import { findAttachmentInput, installAttachmentBridge } from "../../src/content/attachment-bridge";

class FakeDataTransfer {
  files = {} as FileList;
  items = {
    add: vi.fn((file: File) => {
      this.files = { 0: file, item: () => file, length: 1 } as unknown as FileList;
    }),
  };
}

const filesDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");

afterEach(() => {
  document.body.replaceChildren();
  if (filesDescriptor) Object.defineProperty(HTMLInputElement.prototype, "files", filesDescriptor);
});

function makeFileSetterWritable() {
  Object.defineProperty(HTMLInputElement.prototype, "files", {
    configurable: true,
    get(this: HTMLInputElement) {
      return (this as HTMLInputElement & { attachedFiles?: FileList }).attachedFiles ?? null;
    },
    set(this: HTMLInputElement, files: FileList) {
      (this as HTMLInputElement & { attachedFiles?: FileList }).attachedFiles = files;
    },
  });
}

function installBridge(
  sendMessage = vi.fn().mockResolvedValue({
    ok: true,
    attachment: { base64: "Z2lm", filename: "reaction.gif", mimeType: "image/gif" },
  }),
) {
  makeFileSetterWritable();
  const notify = vi.fn();
  const cleanup = installAttachmentBridge({
    document,
    sendMessage,
    FileConstructor: File,
    DataTransferConstructor: FakeDataTransfer as unknown as typeof DataTransfer,
    notify,
  });
  return { cleanup, notify, sendMessage };
}

function dropEvent(mediaId: string | undefined) {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      getData: (type: string) => (type === "application/x-gopaste-media-v2" ? (mediaId ?? "") : ""),
    },
  });
  return event;
}

function pasteEvent(mediaId: string | undefined) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) =>
        type === "text/plain" && mediaId ? `gopaste-media-v2:${mediaId}` : "",
    },
  });
  return event;
}

describe("attachment bridge", () => {
  it("attaches a marked GoPaste drop to the matching image input", async () => {
    document.body.innerHTML =
      '<label><div id="drop-zone"><input type="file" accept="image/*" /></div></label>';
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const { cleanup, notify, sendMessage } = installBridge();
    const changed = vi.fn();
    input.addEventListener("change", changed);

    const event = dropEvent("saved-item");
    document.getElementById("drop-zone")!.dispatchEvent(event);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    expect(event.defaultPrevented).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: "attachment/resolve", mediaId: "saved-item" });
    expect(input.files?.[0]).toMatchObject({ name: "reaction.gif", type: "image/gif" });
    expect(notify).toHaveBeenLastCalledWith("Image attached.");
    cleanup();
  });

  it("uses the first enabled image-compatible input when the target is ambiguous", () => {
    document.body.innerHTML = [
      '<input id="document" type="file" accept="application/pdf" />',
      '<input id="avatar" type="file" accept=".png,.jpg,.gif" />',
      '<input id="disabled" type="file" accept="image/*" disabled />',
    ].join("");

    expect(findAttachmentInput(document, document.body)).toBe(document.getElementById("avatar"));
  });

  it("falls back to an enabled file input when a site accepts every file type", () => {
    document.body.innerHTML =
      '<input id="attachment" type="file" accept="application/octet-stream" />';

    expect(findAttachmentInput(document, document.body)).toBe(
      document.getElementById("attachment"),
    );
  });

  it("attaches a marked GoPaste paste", async () => {
    document.body.innerHTML = '<input type="file" accept="image/*" />';
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const { cleanup, sendMessage } = installBridge();
    const changed = vi.fn();
    input.addEventListener("change", changed);

    const event = pasteEvent("copied-item");
    document.body.dispatchEvent(event);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    expect(event.defaultPrevented).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "attachment/resolve",
      mediaId: "copied-item",
    });
    cleanup();
  });

  it("leaves unmarked drops and pages without an image input untouched", () => {
    document.body.innerHTML = '<input type="file" accept="image/*" />';
    const { cleanup, sendMessage } = installBridge();
    const ordinaryDrop = dropEvent(undefined);
    document.body.dispatchEvent(ordinaryDrop);

    document.body.replaceChildren();
    const unsupportedDrop = dropEvent("saved-item");
    document.body.dispatchEvent(unsupportedDrop);

    expect(ordinaryDrop.defaultPrevented).toBe(false);
    expect(unsupportedDrop.defaultPrevented).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    cleanup();
  });

  it("reports an attachment resolution failure after it takes ownership of the event", async () => {
    document.body.innerHTML = '<input type="file" accept="image/*" />';
    const { cleanup, notify } = installBridge(vi.fn().mockResolvedValue({ ok: false }));
    const event = dropEvent("missing-item");
    document.body.dispatchEvent(event);
    await vi.waitFor(() =>
      expect(notify).toHaveBeenLastCalledWith("Image could not be loaded.", true),
    );

    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });
});
