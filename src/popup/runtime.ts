import { IndexedDbCaptureStatusStore } from "../infrastructure/indexeddb/capture-status-store";
import { IndexedDbDashboardRepository } from "../infrastructure/indexeddb/dashboard-repository";
import { isAppMessage } from "../shared/messages";

export const popupLibrary = new IndexedDbDashboardRepository();
const captureStatusStore = new IndexedDbCaptureStatusStore();

export function loadCaptureStatus() {
  return captureStatusStore.get();
}

export function subscribeToLibraryChanges(onChange: () => void): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return () => undefined;
  const listener = (message: unknown) => {
    if (isAppMessage(message) && message.type === "library/changed") onChange();
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
