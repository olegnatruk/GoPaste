const ATTACHMENT_BRIDGE_FILE = "assets/attachment-bridge.js";

export interface AttachmentBridgeInstallerEnvironment {
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  };
  scripting: {
    executeScript(injection: {
      target: { tabId: number; allFrames: boolean };
      files: string[];
    }): Promise<unknown>;
  };
}

/** Installs the bridge in already-open pages after an extension reload or update. */
export async function installAttachmentBridgeInOpenTabs(
  environment: AttachmentBridgeInstallerEnvironment = chrome,
): Promise<void> {
  const tabs = await environment.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
      .map((tab) =>
        environment.scripting
          .executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: [ATTACHMENT_BRIDGE_FILE],
          })
          .catch(() => undefined),
      ),
  );
}
