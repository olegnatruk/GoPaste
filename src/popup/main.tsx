import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/styles.css";
import { PopupApp } from "./PopupApp";
import { loadCaptureStatus, popupLibrary, subscribeToLibraryChanges } from "./runtime";
import { chromeCodeChumServices } from "../codechum/ui/services";
import "../codechum/ui/codechum.css";
import { IndexedDbDashboardRepository } from "../infrastructure/indexeddb/dashboard-repository";
import { installAttachmentBridgeInOpenTabs } from "../attachment-bridge-installer";
import { installMessengerDropBridge } from "./messenger-drop-bridge";
import "./popup.css";

const rootElement = document.getElementById("root");
const dashboardRepository = new IndexedDbDashboardRepository();
void installAttachmentBridgeInOpenTabs().catch(() => undefined);
void installMessengerDropBridge().catch(() => undefined);

async function getActiveCodeChumTabId(): Promise<number | undefined> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id !== undefined && activeTab.url) {
    try {
      const source = new URL(activeTab.url);
      if (
        (source.protocol === "https:" || source.protocol === "http:") &&
        (source.hostname === "codechum.com" || source.hostname.endsWith(".codechum.com"))
      ) {
        return activeTab.id;
      }
    } catch {
      // The CodeChum view can list open problem tabs if this URL is not usable.
    }
  }
  return undefined;
}

async function openCodeChumPage(tabId?: number): Promise<void> {
  const page = new URL(chrome.runtime.getURL("codechum.html"));
  if (tabId !== undefined) page.searchParams.set("tabId", String(tabId));
  await chrome.tabs.create({ url: page.href });
}

if (!rootElement) {
  throw new Error("Popup root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupApp
      library={popupLibrary}
      codeChumServices={chromeCodeChumServices}
      getActiveCodeChumTabId={getActiveCodeChumTabId}
      openCodeChumPage={openCodeChumPage}
      loadCaptureStatus={loadCaptureStatus}
      subscribeToLibraryChanges={subscribeToLibraryChanges}
      onCopyUsage={(item) => void dashboardRepository.recordUsage(item.id, "copy")}
      onDragUsage={(item) => void dashboardRepository.recordUsage(item.id, "drag")}
      onOpenDashboard={() =>
        void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") })
      }
    />
  </StrictMode>,
);
