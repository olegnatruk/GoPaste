import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/styles.css";
import { PopupShell } from "./PopupShell";
import { loadCaptureStatus, popupLibrary, subscribeToLibraryChanges } from "./runtime";
import { MediaShareActions } from "./sharing/MediaShareActions";
import { IndexedDbDashboardRepository } from "../infrastructure/indexeddb/dashboard-repository";
import { installMessengerDropBridge } from "./messenger-drop-bridge";
import "./popup.css";

const rootElement = document.getElementById("root");
const dashboardRepository = new IndexedDbDashboardRepository();
void installMessengerDropBridge().catch(() => undefined);

if (!rootElement) {
  throw new Error("Popup root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupShell
      library={popupLibrary}
      loadCaptureStatus={loadCaptureStatus}
      subscribeToLibraryChanges={subscribeToLibraryChanges}
      renderShareActions={(item) => (
        <MediaShareActions
          item={item}
          onUsage={async (action) => {
            await dashboardRepository.recordUsage(item.id, action);
          }}
        />
      )}
      onOpenDashboard={() =>
        void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") })
      }
    />
  </StrictMode>,
);
