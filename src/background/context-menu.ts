export const CAPTURE_MENU_ID = "gopaste-save-image";

export interface ContextMenuApi {
  remove(id: string, callback: () => void): void;
  create(properties: chrome.contextMenus.CreateProperties, callback?: () => void): string | number;
  consumeLastError?(): void;
}

export function registerCaptureContextMenu(api: ContextMenuApi): void {
  api.remove(CAPTURE_MENU_ID, () => {
    api.consumeLastError?.();
    api.create(
      {
        id: CAPTURE_MENU_ID,
        title: "Save to GoPaste",
        contexts: ["image"],
      },
      () => api.consumeLastError?.(),
    );
  });
}

export function captureRequestFromContextClick(
  info: Pick<chrome.contextMenus.OnClickData, "frameId" | "menuItemId" | "mediaType" | "srcUrl">,
  tab?: Pick<chrome.tabs.Tab, "id" | "url">,
): { sourceUrl: string; pageUrl?: string; tabId?: number; frameId?: number } | undefined {
  if (info.menuItemId !== CAPTURE_MENU_ID || info.mediaType !== "image" || !info.srcUrl) {
    return undefined;
  }
  return {
    sourceUrl: info.srcUrl,
    ...(tab?.url ? { pageUrl: tab.url } : {}),
    ...(tab?.id !== undefined ? { tabId: tab.id } : {}),
    ...(info.frameId !== undefined ? { frameId: info.frameId } : {}),
  };
}
