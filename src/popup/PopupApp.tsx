import { useState } from "react";

import { CodeChumPage } from "../codechum/ui/CodeChumPage";
import type { CodeChumServices } from "../codechum/ui/services";
import { PopupShell, type PopupShellProps } from "./PopupShell";

export interface PopupAppProps extends Omit<PopupShellProps, "onOpenCodeChum"> {
  codeChumServices: CodeChumServices;
  getActiveCodeChumTabId: () => Promise<number | undefined>;
  openCodeChumPage: (tabId?: number) => void | Promise<void>;
}

export function PopupApp({
  codeChumServices,
  getActiveCodeChumTabId,
  openCodeChumPage,
  ...libraryProps
}: PopupAppProps) {
  const [view, setView] = useState<"library" | "codechum">("library");
  const [initialTabId, setInitialTabId] = useState<number>();
  const [selectedTabId, setSelectedTabId] = useState<number>();

  async function showCodeChum() {
    try {
      const activeTabId = await getActiveCodeChumTabId();
      setInitialTabId(activeTabId);
      setSelectedTabId(activeTabId);
    } catch {
      setInitialTabId(undefined);
      setSelectedTabId(undefined);
    }
    setView("codechum");
  }

  if (view === "library") {
    return <PopupShell {...libraryProps} onOpenCodeChum={() => void showCodeChum()} />;
  }

  return (
    <div className="popup-codechum-shell">
      <nav className="popup-codechum-nav" aria-label="Popup views">
        <button type="button" onClick={() => setView("library")}>
          ← GoPaste library
        </button>
        <button type="button" onClick={() => void openCodeChumPage(selectedTabId ?? initialTabId)}>
          Open full page ↗
        </button>
      </nav>
      <div className="popup-codechum-scroll">
        <CodeChumPage
          services={codeChumServices}
          initialTabId={initialTabId}
          onTabSelected={setSelectedTabId}
        />
      </div>
    </div>
  );
}
