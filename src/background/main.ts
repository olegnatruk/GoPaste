import { CaptureImage, systemClock, uuidGenerator } from "./capture";
import { captureRequestFromContextClick, registerCaptureContextMenu } from "./context-menu";
import { serializeApplicationError } from "../core/domain/errors";
import { IndexedDbCaptureStatusStore } from "../infrastructure/indexeddb/capture-status-store";
import { IndexedDbDashboardRepository } from "../infrastructure/indexeddb/dashboard-repository";
import { IndexedDbMediaRepository } from "../infrastructure/indexeddb/media-repository";
import { ChromePageMediaFetcher } from "../infrastructure/media/chrome-page-media";
import { WebContentHasher, WebMediaFetcher } from "../infrastructure/media/web-media";
import { isAppMessage, MESSAGE_VERSION, type AppResponse } from "../shared/messages";

const repository = new IndexedDbMediaRepository();
const dashboardRepository = new IndexedDbDashboardRepository();
const statusStore = new IndexedDbCaptureStatusStore();
const mediaFetcher = new ChromePageMediaFetcher(
  new WebMediaFetcher(),
  {
    executeScript: (injection) => chrome.scripting.executeScript(injection),
  },
  {
    saveAsMHTML: (details) => chrome.pageCapture.saveAsMHTML(details),
  },
);
const captureImage = new CaptureImage(
  repository,
  mediaFetcher,
  new WebContentHasher(),
  statusStore,
  systemClock,
  uuidGenerator,
);

function attachmentFileName(title: string, extension: string): string {
  const stem = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  return `${stem || "gopaste-image"}.${extension}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function isMessengerAttachmentRequest(
  value: unknown,
): value is { type: "messenger/attachment"; mediaId: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; mediaId?: unknown };
  return candidate.type === "messenger/attachment" && typeof candidate.mediaId === "string";
}

function ensureContextMenu(): void {
  registerCaptureContextMenu({
    remove: (id, callback) => chrome.contextMenus.remove(id, callback),
    create: (properties, callback) => chrome.contextMenus.create(properties, callback),
    consumeLastError: () => void chrome.runtime.lastError,
  });
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);
ensureContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const request = captureRequestFromContextClick(info, tab);
  if (!request) return;

  void captureImage
    .execute(request)
    .then((result) => {
      if (result.status === "created") {
        return chrome.runtime.sendMessage({
          version: MESSAGE_VERSION,
          type: "library/changed",
          payload: { reason: "created", itemIds: [result.record.id] },
        });
      }
    })
    .catch(() => {
      // The durable capture status is surfaced by the popup; avoid logging sensitive URLs.
    });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-dashboard") return;
  void dashboardRepository
    .getPreferences()
    .then((preferences) => {
      if (preferences.shortcutsEnabled) {
        return chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      }
    })
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isMessengerAttachmentRequest(message)) {
    void repository
      .getById(message.mediaId)
      .then(async (media) => {
        if (!media) throw new Error("The saved image no longer exists.");
        sendResponse({
          ok: true,
          attachment: {
            base64: await blobToBase64(media.blob),
            filename: attachmentFileName(media.title, media.extension),
            mimeType: media.mimeType,
          },
        });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (!isAppMessage(message) || message.type === "library/changed") return false;

  const operation = message.type === "capture/status" ? statusStore.get() : repository.getStats();
  void operation
    .then((result) => {
      const response: AppResponse = {
        version: MESSAGE_VERSION,
        correlationId: message.correlationId,
        ok: true,
        result,
      };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const response: AppResponse = {
        version: MESSAGE_VERSION,
        correlationId: message.correlationId,
        ok: false,
        error: serializeApplicationError(error),
      };
      sendResponse(response);
    });
  return true;
});
