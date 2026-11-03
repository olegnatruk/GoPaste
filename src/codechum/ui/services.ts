import * as auth from "./auth";
import type { AccessState } from "./auth";

export interface CodeChumTab {
  id: number;
  title: string;
}

export interface CodeChumShortcut {
  name: string;
  shortcut: string;
}

export interface TestCase {
  number: number;
  description?: string;
  expectedPreview?: string;
  status: "passed" | "failed" | "unchecked";
}

export interface TestCatalog {
  key: string;
  title: string;
  requirements?: string;
  selected: number[];
  cases: TestCase[];
}

export interface SolverStatus {
  stage?: string;
  message?: string;
  attempt?: number;
  totalAttempts?: number;
  cases?: number;
  selectedCases?: number;
  focusedSelection?: boolean;
  wpm?: number;
  warning?: string;
}

export interface CodeChumStoredState {
  geminiApiKey?: string;
  solutionNotes?: string;
  executionMode?: "assist" | "autopilot";
  typingSpeed?: string;
  solverStatus?: SolverStatus;
  lastError?: { message: string; time?: string };
  isRunning?: boolean;
  codechumGeminiConsentUserId?: string;
}

export interface CodeChumServices {
  getAccess(): Promise<AccessState>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  updatePassword(currentPassword: string, newPassword: string): Promise<void>;
  getTabs(): Promise<CodeChumTab[]>;
  getShortcuts(): Promise<CodeChumShortcut[]>;
  openShortcutSettings(): Promise<void>;
  getStoredState(): Promise<CodeChumStoredState>;
  saveSettings(settings: Partial<CodeChumStoredState>): Promise<void>;
  setConsent(userId: string | undefined): Promise<void>;
  saveSelection(key: string, numbers: number[]): Promise<void>;
  getTestCases(tabId: number): Promise<TestCatalog>;
  getStatus(tabId: number): Promise<{ isRunning: boolean }>;
  start(tabId: number): Promise<void>;
  stop(tabId: number): Promise<void>;
  setTypingSpeed(tabId: number, speed: string): Promise<void>;
  subscribe(onChange: (state: Partial<CodeChumStoredState>) => void): () => void;
}

async function send<T>(message: {
  action: string;
  tabId: number;
  [key: string]: unknown;
}): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response)
    throw new Error("The CodeChum worker did not respond. Reload the extension and retry.");
  if (response.success === false)
    throw new Error(response.error || "CodeChum could not complete the request.");
  return response as T;
}

export const chromeCodeChumServices: CodeChumServices = {
  ...auth,
  async getTabs() {
    const tabs = await chrome.tabs.query({
      url: ["*://codechum.com/*", "*://*.codechum.com/*"],
    });
    return tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === "number")
      .map((tab) => ({ id: tab.id, title: tab.title || `CodeChum tab ${tab.id}` }));
  },
  async getShortcuts() {
    const commands = await chrome.commands.getAll();
    return commands.map(({ name, shortcut }) => ({ name: name || "", shortcut: shortcut || "" }));
  },
  async openShortcutSettings() {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  },
  async getStoredState() {
    return (await chrome.storage.local.get([
      "geminiApiKey",
      "solutionNotes",
      "executionMode",
      "typingSpeed",
      "solverStatus",
      "lastError",
      "isRunning",
      "codechumGeminiConsentUserId",
    ])) as CodeChumStoredState;
  },
  async saveSettings(settings) {
    await chrome.storage.local.set(settings);
  },
  async setConsent(userId) {
    if (userId) {
      await chrome.storage.local.set({ codechumGeminiConsentUserId: userId });
    } else {
      await chrome.storage.local.remove("codechumGeminiConsentUserId");
    }
  },
  async saveSelection(key, numbers) {
    const { caseSelections = {} } = (await chrome.storage.local.get("caseSelections")) as {
      caseSelections?: Record<string, number[]>;
    };
    await chrome.storage.local.set({ caseSelections: { ...caseSelections, [key]: numbers } });
  },
  async getTestCases(tabId) {
    return await send<TestCatalog>({ action: "GET_TEST_CASES", tabId });
  },
  async getStatus(tabId) {
    return await send<{ isRunning: boolean }>({ action: "GET_STATUS", tabId });
  },
  async start(tabId) {
    await send({ action: "START_SCRIPT_MANUAL", tabId });
  },
  async stop(tabId) {
    await send({ action: "STOP_SCRIPT_MANUAL", tabId });
  },
  async setTypingSpeed(tabId, speed) {
    await send({ action: "SET_TYPING_SPEED", tabId, speed });
  },
  subscribe(onChange) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      const update: Partial<CodeChumStoredState> = {};
      for (const key of ["solverStatus", "lastError", "isRunning", "typingSpeed"] as const) {
        if (changes[key]) Object.assign(update, { [key]: changes[key].newValue });
      }
      if (Object.keys(update).length) onChange(update);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
};
