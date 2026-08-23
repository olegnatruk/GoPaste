import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DEFAULT_DASHBOARD_PREFERENCES, type DashboardPreferences } from "../core/domain/dashboard";
import type { DashboardRepository } from "../core/ports/dashboard-repository";
import type { MediaRepository } from "../core/ports/media-repository";
import { IndexedDbDashboardRepository } from "../infrastructure/indexeddb/dashboard-repository";
import { IndexedDbMediaRepository } from "../infrastructure/indexeddb/media-repository";
import "../shared/styles.css";
import "./dashboard.css";
import { DashboardShell, type DashboardLibraryService } from "./DashboardShell";
import { DashboardSections } from "./DashboardSections";
import { installMessengerDropBridge } from "../popup/messenger-drop-bridge";

interface DashboardAppProps {
  repository: DashboardRepository;
  mediaRepository: MediaRepository;
}

export function DashboardApp({ repository, mediaRepository }: DashboardAppProps) {
  const [preferences, setPreferences] = useState<DashboardPreferences>({
    ...DEFAULT_DASHBOARD_PREFERENCES,
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void repository
      .getPreferences()
      .then(setPreferences)
      .catch(() => undefined);
  }, [repository]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return (
    <DashboardShell
      key={revision}
      service={repository}
      initialView={preferences.viewMode}
      initialDensity={preferences.gridDensity}
      initialDefaultAction={preferences.defaultAction}
      renderSection={(section, items) => (
        <DashboardSections
          section={section}
          items={items}
          repository={repository}
          mediaRepository={mediaRepository}
          onLibraryChanged={refresh}
          onPreferencesChanged={setPreferences}
        />
      )}
    />
  );
}

function mountDashboard(
  rootElement: HTMLElement,
  service: DashboardLibraryService = new IndexedDbDashboardRepository(),
  mediaRepository: MediaRepository = new IndexedDbMediaRepository(),
): Root {
  const repository = service as DashboardRepository;
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <DashboardApp repository={repository} mediaRepository={mediaRepository} />
    </StrictMode>,
  );
  return root;
}

const rootElement = document.getElementById("root");
void installMessengerDropBridge().catch(() => undefined);
if (rootElement) mountDashboard(rootElement);
