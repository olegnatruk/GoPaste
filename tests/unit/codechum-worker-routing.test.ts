import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExtensionAuth } from "../../src/codechum/worker/auth";
import { installCodeChumWorker, isCodeChumWorkerMessage } from "../../src/codechum/worker/workflow";

type MessageListener = (
  message: unknown,
  sender: unknown,
  respond: (value: unknown) => void,
) => boolean;

function setupWorker() {
  let messageListener: MessageListener | undefined;
  let commandListener: ((command: string) => void) | undefined;
  const values: Record<string, unknown> = {
    isRunning: true,
    activeTabId: 17,
  };
  const query = vi.fn(async (options?: { active?: boolean }) =>
    options?.active
      ? [{ id: 99, url: "chrome-extension://gopaste/codechum.html" }]
      : [{ id: 17, url: "https://app.codechum.com/item/17" }],
  );
  const getTab = vi.fn(async (id: number) =>
    id === 17
      ? { id, url: "https://app.codechum.com/item/17" }
      : { id, url: "https://example.com/" },
  );
  const executeScript = vi.fn();
  const browser = {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListener = listener;
        }),
      },
    },
    commands: {
      onCommand: {
        addListener: vi.fn((listener: (command: string) => void) => {
          commandListener = listener;
        }),
      },
    },
    tabs: { query, get: getTab },
    storage: {
      local: {
        get: vi.fn(async () => values),
        set: vi.fn(async (updates: Record<string, unknown>) => {
          Object.assign(values, updates);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
        }),
      },
    },
    scripting: { executeScript },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
  };
  vi.stubGlobal("chrome", browser);
  installCodeChumWorker();
  const send = async (message: unknown): Promise<unknown> => {
    if (!messageListener) throw new Error("CodeChum message listener was not registered");
    return new Promise((resolve) => {
      expect(messageListener?.(message, {}, resolve)).toBe(true);
    });
  };
  return { browser, messageListener, commandListener, send, query, getTab, executeScript, values };
}

describe("CodeChum worker routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not claim GoPaste or unknown messages", () => {
    const { messageListener, commandListener, query } = setupWorker();
    expect(isCodeChumWorkerMessage({ type: "attachment/resolve", mediaId: "x" })).toBe(false);
    expect(messageListener?.({ type: "attachment/resolve", mediaId: "x" }, {}, vi.fn())).toBe(
      false,
    );
    expect(messageListener?.({ version: 1, type: "storage/stats" }, {}, vi.fn())).toBe(false);
    expect(messageListener?.({ action: "SOMETHING_ELSE" }, {}, vi.fn())).toBe(false);
    commandListener?.("open-dashboard");
    expect(query).not.toHaveBeenCalled();
  });

  it("uses an explicit CodeChum tab even while the bundled extension page is active", async () => {
    const { send, getTab, query } = setupWorker();
    expect(await send({ action: "GET_STATUS", tabId: 17 })).toEqual({ isRunning: true, tabId: 17 });
    expect(getTab).toHaveBeenCalledWith(17);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not guess a CodeChum tab when the extension page is active", async () => {
    const { send, query } = setupWorker();
    expect(await send({ action: "GET_STATUS" })).toEqual({ isRunning: false, tabId: undefined });
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(query).not.toHaveBeenCalledWith({});
  });

  it("rejects non-CodeChum targets without reading their pages", async () => {
    const { send, executeScript } = setupWorker();
    expect(await send({ action: "GET_TEST_CASES", tabId: 45 })).toEqual({
      success: false,
      error: "Open a CodeChum console problem to choose test cases.",
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("blocks solver start without account-scoped Gemini consent", async () => {
    const { send, executeScript } = setupWorker();
    expect(await send({ action: "START_SCRIPT_MANUAL", tabId: 17 })).toEqual({
      success: false,
      error: "Confirm CodeChum Gemini data sharing in CodeChum settings before starting.",
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("does not carry Gemini consent over to a different signed-in member", async () => {
    const { send, executeScript, values } = setupWorker();
    values.codechumGeminiConsentUserId = "user-before";
    values.authSession = {
      access_token: "access",
      refresh_token: "refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-now", email: "current@example.com" },
    };
    expect(await send({ action: "START_SCRIPT_MANUAL", tabId: 17 })).toEqual({
      success: false,
      error: "Confirm CodeChum Gemini data sharing for this account before starting.",
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("surfaces shortcut start failures to the popup instead of only logging them", async () => {
    const { browser, commandListener, query, values } = setupWorker();
    query.mockResolvedValueOnce([{ id: 17, url: "https://app.codechum.com/item/17" }]);
    commandListener?.("start-script");
    await vi.waitFor(() =>
      expect(values.lastError).toMatchObject({
        message: "Confirm CodeChum Gemini data sharing in CodeChum settings before starting.",
      }),
    );
    expect(browser.storage.local.set).toHaveBeenCalled();
  });

  it("stops cleanly on recitation without inserting blocked code and includes capped notes only after consent", async () => {
    const { send, executeScript, values, browser } = setupWorker();
    vi.spyOn(ExtensionAuth, "getAccess").mockResolvedValue({
      allowed: true,
      signedIn: true,
      email: "member@example.com",
      profile: {},
    });
    const session = vi
      .spyOn(ExtensionAuth, "getSession")
      .mockResolvedValue({ user: { id: "member-1" } });
    values.codechumGeminiConsentUserId = "member-1";
    values.geminiApiKey = "test-key";
    values.solutionNotes = "N".repeat(5000);
    const problem = {
      url: "https://app.codechum.com/item/17",
      title: "Sum two numbers",
      description: "Read two integers and print their sum.",
      language: "C++",
      itemNumber: "17",
      activeFile: "main.cpp",
      fileCount: 1,
      requirements: "",
      visibleCaseCount: 1,
      caseBlocks: [{ number: 1, input: "1 2", expectedOutput: "3" }],
    };
    executeScript.mockImplementation(async ({ func }: { func: { name: string } }) => {
      if (func.name === "readProblem" || func.name === "getIdentity") return [{ result: problem }];
      if (func.name === "readResult") return [{ result: { raw: "" } }];
      throw new Error(`Unexpected editor mutation: ${func.name}`);
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "RECITATION",
              content: { parts: [{ text: "NEVER INSERT BLOCKED CODE" }] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    expect(await send({ action: "START_SCRIPT_MANUAL", tabId: 17 })).toMatchObject({
      success: true,
      started: true,
    });
    await vi.waitFor(() =>
      expect(values.solverStatus).toMatchObject({ stage: "needs_original_solution" }),
    );

    expect(values).toMatchObject({ isRunning: false, activeTabId: null });
    expect(values.lastError).toBeUndefined();
    expect(values.solverCheckpoint).toBeUndefined();
    expect(browser.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 17, text: "WAIT" });
    expect(browser.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: 17, text: "ERR" });
    expect(browser.action.setBadgeBackgroundColor).not.toHaveBeenCalledWith({
      tabId: 17,
      color: "#EF4444",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(session).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("User implementation notes:\n" + "N".repeat(4000));
    expect(prompt).not.toContain("N".repeat(4001));
    expect(executeScript.mock.calls.map(([injection]) => injection.func.name)).not.toContain(
      "prepareRetry",
    );
  });
});
