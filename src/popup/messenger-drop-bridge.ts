const MESSENGER_MEDIA_DRAG_TYPE = "application/x-gopaste-media";
const MESSENGER_ATTACHMENT_MESSAGE = "messenger/attachment";

/** Installs a drop bridge in every open Messenger conversation tab. */
export async function installMessengerDropBridge(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return;
  }

  const tabs = await chrome.tabs.query({
    url: [
      "*://messenger.com/*",
      "*://*.messenger.com/*",
      "*://facebook.com/messages/*",
      "*://*.facebook.com/messages/*",
    ],
  });
  await Promise.all(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id as number },
          func: installDropListener,
        }),
      ),
  );
}

function installDropListener() {
  const markerType = "application/x-gopaste-media";
  const messageType = "messenger/attachment";
  const installationKey = "__gopasteMessengerDropBridgeV1";
  const host = window as Window & { [installationKey]?: boolean };
  if (host[installationKey]) return;
  host[installationKey] = true;

  function toast(message: string, isError = false) {
    const existing = document.getElementById("gopaste-messenger-drop-status");
    existing?.remove();
    const notice = document.createElement("div");
    notice.id = "gopaste-messenger-drop-status";
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
    document.documentElement.append(notice);
    window.setTimeout(() => notice.remove(), isError ? 5200 : 2600);
  }

  function attachmentInput(): HTMLInputElement | undefined {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="file"]:not([disabled])'),
    );
    return (
      inputs.find((input) => input.accept.includes("image")) ??
      inputs.find((input) => input.accept === "") ??
      inputs.at(-1)
    );
  }

  function bytesFromBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return buffer;
  }

  function markerFromUriList(value: string): string | undefined {
    const match = value.match(/^#\s*gopaste-media=([^\s]+)/m);
    if (!match?.[1]) return undefined;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return undefined;
    }
  }

  document.addEventListener(
    "drop",
    (event) => {
      const mediaId =
        event.dataTransfer?.getData(markerType) ||
        markerFromUriList(event.dataTransfer?.getData("text/uri-list") ?? "");
      if (!mediaId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("Attaching image…");

      void chrome.runtime
        .sendMessage({ type: messageType, mediaId })
        .then((response: unknown) => {
          const payload = response as {
            ok?: boolean;
            attachment?: { base64: string; filename: string; mimeType: string };
          };
          if (!payload.ok || !payload.attachment) throw new Error("Image could not be loaded.");

          const input = attachmentInput();
          if (!input) throw new Error("Messenger's attachment input was not found.");
          const file = new File(
            [bytesFromBase64(payload.attachment.base64)],
            payload.attachment.filename,
            { type: payload.attachment.mimeType },
          );
          const transfer = new DataTransfer();
          transfer.items.add(file);
          const filesSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "files",
          )?.set;
          if (!filesSetter) throw new Error("This browser cannot attach the image here.");
          filesSetter.call(input, transfer.files);
          input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          toast("Image attached to Messenger.");
        })
        .catch((error: unknown) => {
          toast(error instanceof Error ? error.message : "Image could not be attached.", true);
        });
    },
    true,
  );
}

export const messengerDropBridgeContracts = {
  markerType: MESSENGER_MEDIA_DRAG_TYPE,
  messageType: MESSENGER_ATTACHMENT_MESSAGE,
};
