/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-nocheck — ported solver workflow; routing and site guard are maintained below.
import { ExtensionAuth } from "./auth";
import { CodeChumCore } from "./core";
import { CodeChumPage } from "./page";
import { GeminiBlockedResponseError, requestGeminiText } from "./gemini";

const CODECHUM_ACTIONS = new Set([
  "START_SCRIPT_MANUAL",
  "STOP_SCRIPT_MANUAL",
  "GET_STATUS",
  "SET_TYPING_SPEED",
  "GET_TEST_CASES",
]);
const CODECHUM_COMMANDS = new Set(["start-script", "stop-script", "speed-up", "speed-down"]);

export function isCodeChumWorkerMessage(message: unknown): boolean {
  return (
    !!message &&
    typeof message === "object" &&
    CODECHUM_ACTIONS.has((message as { action?: string }).action || "")
  );
}

export function installCodeChumWorker(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    const { executionMode, typingSpeed } = await chrome.storage.local.get([
      "executionMode",
      "typingSpeed",
    ]);

    const updates = {};
    if (executionMode === undefined) updates.executionMode = "assist";
    if (typingSpeed === undefined) updates.typingSpeed = "realistic";
    updates.isRunning = false;

    await chrome.storage.local.set(updates);
  });

  const SPEED_LEVELS = [
    { id: "slow", wpm: 30, label: "30 WPM", badge: "30w", color: "#3B82F6" },
    { id: "realistic", wpm: 45, label: "45 WPM", badge: "45w", color: "#10B981" },
    { id: "fast", wpm: 75, label: "75 WPM", badge: "75w", color: "#F59E0B" },
    { id: "turbo", wpm: 130, label: "130 WPM", badge: "130w", color: "#8B5CF6" },
    { id: "instant", wpm: null, label: "Instant", badge: "MAX", color: "#EC4899" },
  ];

  chrome.commands.onCommand.addListener(async (command) => {
    if (!CODECHUM_COMMANDS.has(command)) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
        return;
      }

      if (command === "start-script") {
        await startExecution(tab.id);
      } else if (command === "stop-script") {
        await stopExecution(tab.id);
      } else if (command === "speed-up") {
        await changeTypingSpeed(tab.id, "up");
      } else if (command === "speed-down") {
        await changeTypingSpeed(tab.id, "down");
      }
    } catch (err) {
      console.error("[CodeChum assistant] Command error:", err);
      await chrome.storage.local.set({
        lastError: {
          message: err instanceof Error ? err.message : "The CodeChum shortcut failed.",
          timestamp: Date.now(),
        },
      });
    }
  });

  async function changeTypingSpeed(tabId, direction) {
    const { typingSpeed = "realistic" } = await chrome.storage.local.get("typingSpeed");
    let currentIndex = SPEED_LEVELS.findIndex((s) => s.id === typingSpeed);
    if (currentIndex === -1) currentIndex = 1;

    let newIndex = currentIndex;
    if (direction === "up") {
      newIndex = Math.min(SPEED_LEVELS.length - 1, currentIndex + 1);
    } else if (direction === "down") {
      newIndex = Math.max(0, currentIndex - 1);
    }

    await setTypingSpeed(SPEED_LEVELS[newIndex].id, tabId);
  }

  async function setTypingSpeed(speedId, tabId) {
    const newSpeedObj = SPEED_LEVELS.find((level) => level.id === speedId);
    if (!newSpeedObj) throw new Error("Unknown typing speed.");
    await chrome.storage.local.set({ typingSpeed: speedId });
    const { solverStatus } = await chrome.storage.local.get("solverStatus");
    if (solverStatus?.stage === "typing") {
      await chrome.storage.local.set({
        solverStatus: {
          ...solverStatus,
          typingSpeed: speedId,
          wpm: newSpeedObj.wpm,
          updatedAt: Date.now(),
        },
      });
    }

    // A popup can change the setting while its original tab is still typing.
    // Send the change to every active run, regardless of which tab has focus.
    await Promise.allSettled(
      [...activeRuns.keys()].map((activeTabId) =>
        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          world: "MAIN",
          func: (selectedSpeed) => {
            document.dispatchEvent(
              new CustomEvent("__codechum_assistant_speed__", { detail: { speed: selectedSpeed } }),
            );
          },
          args: [speedId],
        }),
      ),
    );

    // Show visual feedback on extension icon badge
    if (tabId) {
      await chrome.action.setBadgeText({ tabId, text: newSpeedObj.badge });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: newSpeedObj.color });

      // Clear or restore badge after 1.5 seconds
      setTimeout(async () => {
        const { isRunning } = await chrome.storage.local.get("isRunning");
        if (!isRunning) {
          await chrome.action.setBadgeText({ tabId, text: "" });
        } else {
          await chrome.action.setBadgeText({ tabId, text: "TYP" });
          await chrome.action.setBadgeBackgroundColor({ tabId, color: "#10B981" });
        }
      }, 1500);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isCodeChumWorkerMessage(message)) return false;
    (async () => {
      try {
        if (message.action === "START_SCRIPT_MANUAL") {
          const tab = await resolveCodeChumTab(message.tabId);
          if (tab && tab.id && !isRestrictedUrl(tab.url)) {
            const result = await startExecution(tab.id);
            sendResponse(result || { success: true });
          } else {
            sendResponse({
              success: false,
              error: "Open a CodeChum challenge tab to start the solver.",
            });
          }
        } else if (message.action === "STOP_SCRIPT_MANUAL") {
          const tab = await resolveCodeChumTab(message.tabId);
          if (tab && tab.id && !isRestrictedUrl(tab.url)) {
            await stopExecution(tab.id);
            sendResponse({ success: true });
          } else {
            sendResponse({
              success: false,
              error: "Open a CodeChum challenge tab to stop the solver.",
            });
          }
        } else if (message.action === "GET_STATUS") {
          const { isRunning, activeTabId } = await chrome.storage.local.get([
            "isRunning",
            "activeTabId",
          ]);
          const tab = await resolveCodeChumTab(message.tabId);
          const isCurrentRunning = isRunning && activeTabId === tab?.id;
          sendResponse({ isRunning: isCurrentRunning, tabId: tab?.id });
        } else if (message.action === "SET_TYPING_SPEED") {
          const tab = await resolveCodeChumTab(message.tabId);
          if (!tab?.id)
            sendResponse({ success: false, error: "Open a CodeChum challenge tab first." });
          else {
            await setTypingSpeed(message.speed, tab.id);
            sendResponse({ success: true });
          }
        } else if (message.action === "GET_TEST_CASES") {
          const tab = await resolveCodeChumTab(message.tabId);
          if (!tab?.id || isRestrictedUrl(tab.url)) {
            sendResponse({
              success: false,
              error: "Open a CodeChum console problem to choose test cases.",
            });
          } else {
            const problem = await pageCall(tab.id, CodeChumPage.readProblem);
            if (!problem?.title)
              throw new Error("No CodeChum problem was found on the current tab.");
            let cases = CodeChumCore.extractCases(problem);
            let key = CodeChumCore.fingerprint({ ...problem, testCases: cases });
            let requirements = problem.requirements || "";
            const solverCheckpoint = normalizeSolverCheckpoint(
              await readRawSolverCheckpoint(tab.id),
            );
            if (
              solverCheckpoint?.tabId === tab.id &&
              (cases.length < (solverCheckpoint.problemSnapshot?.allCases?.length || 0) ||
                !requirements)
            ) {
              const identity = await pageCall(tab.id, CodeChumPage.getIdentity);
              if (!identityChanges(identity, solverCheckpoint.problemSnapshot).length) {
                if (cases.length < (solverCheckpoint.problemSnapshot?.allCases?.length || 0)) {
                  cases = solverCheckpoint.problemSnapshot.allCases;
                  key = solverCheckpoint.key;
                }
                if (!requirements && solverCheckpoint.problemSnapshot?.requirements) {
                  requirements = solverCheckpoint.problemSnapshot.requirements;
                  key = solverCheckpoint.key;
                }
              }
            }
            const selected = await selectedCasesFor(key, cases);
            sendResponse({
              success: true,
              key,
              title: problem.title,
              requirements,
              requirementBlocks: problem.requirementBlocks || [],
              selected: selected.map((item) => item.number),
              cases: cases.map((item) => ({
                number: item.number,
                description: item.description,
                status:
                  problem.caseBlocks?.find((block) => block.number === item.number)?.status ||
                  "unchecked",
                expectedPreview: item.expectedOutput.slice(0, 120),
              })),
            });
          }
        }
      } catch (err) {
        console.error("[CodeChum assistant] Message error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  });

  function isRestrictedUrl(url) {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return (
        !["http:", "https:"].includes(parsed.protocol) ||
        !(parsed.hostname === "codechum.com" || parsed.hostname.endsWith(".codechum.com"))
      );
    } catch {
      return true;
    }
  }

  async function resolveCodeChumTab(requestedTabId) {
    if (requestedTabId !== undefined) {
      if (!Number.isInteger(requestedTabId) || requestedTabId < 0) return null;
      try {
        const tab = await chrome.tabs.get(requestedTabId);
        return !isRestrictedUrl(tab?.url) ? tab : null;
      } catch {
        return null;
      }
    }
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && !isRestrictedUrl(activeTab.url)) return activeTab;
    return null;
  }

  // Only answers that CodeChum has checked as passing are cached.
  const solutionCache = new Map();
  const activeRuns = new Map();
  const stoppingRuns = new Map();

  function normalizeSolverCheckpoint(checkpoint) {
    if (!checkpoint || (checkpoint.version !== 2 && checkpoint.version !== 3)) return null;
    return checkpoint.version === 2
      ? {
          ...checkpoint,
          version: 3,
          phase: checkpoint.phase === "checking" ? "awaiting_manual_check" : checkpoint.phase,
          progress: Number.isInteger(checkpoint.progress) ? checkpoint.progress : 0,
        }
      : checkpoint;
  }

  function checkpointKey(tabId) {
    return `solverCheckpoint:${tabId}`;
  }

  async function readRawSolverCheckpoint(tabId) {
    const key = checkpointKey(tabId);
    const saved = await chrome.storage.local.get([key, "solverCheckpoint"]);
    return saved[key] || (saved.solverCheckpoint?.tabId === tabId ? saved.solverCheckpoint : null);
  }

  async function removeSolverCheckpoint(tabId, key = null) {
    const saved = await readRawSolverCheckpoint(tabId);
    if (!saved || (key && saved.key !== key)) return;
    await chrome.storage.local.remove(checkpointKey(tabId));
    const { solverCheckpoint } = await chrome.storage.local.get("solverCheckpoint");
    if (solverCheckpoint?.tabId === tabId && (!key || solverCheckpoint.key === key)) {
      await chrome.storage.local.remove("solverCheckpoint");
    }
  }

  async function saveSolverCheckpoint(run, state) {
    assertRunActive(run);
    const checkpoint = { tabId: run.tabId, runId: run.id, ...state };
    const writing = chrome.storage.local.set({
      [checkpointKey(run.tabId)]: checkpoint,
      solverCheckpoint: checkpoint,
    });
    run.checkpointWrite = writing;
    try {
      await writing;
    } finally {
      if (run.checkpointWrite === writing) run.checkpointWrite = null;
    }
    assertRunActive(run);
  }

  async function clearSolverCheckpoint(run, key) {
    assertRunActive(run);
    await removeSolverCheckpoint(run.tabId, key);
  }

  async function selectedCasesFor(key, cases) {
    const { caseSelections = {} } = await chrome.storage.local.get("caseSelections");
    const saved = caseSelections[key];
    if (!Array.isArray(saved)) return cases;
    const selected = cases.filter((item) => saved.includes(item.number));
    return selected.length ? selected : cases;
  }

  async function setSolverStatus(stage, message, extra = {}) {
    await chrome.storage.local.set({
      solverStatus: { stage, message, ...extra, updatedAt: Date.now() },
    });
  }

  function assertRunActive(run) {
    if (run.cancelled || activeRuns.get(run.tabId) !== run) {
      throw new Error("Solver stopped.");
    }
  }

  async function pageCall(tabId, func, args = [], world = "ISOLATED") {
    const [response] = await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func,
      args,
    });
    return response?.result;
  }

  async function assertGeminiConsent() {
    const { codechumGeminiConsentUserId } = await chrome.storage.local.get(
      "codechumGeminiConsentUserId",
    );
    if (typeof codechumGeminiConsentUserId !== "string" || !codechumGeminiConsentUserId) {
      throw new Error("Confirm CodeChum Gemini data sharing in CodeChum settings before starting.");
    }
    const session = await ExtensionAuth.getSession();
    if (!session || session.user?.id !== codechumGeminiConsentUserId) {
      throw new Error("Confirm CodeChum Gemini data sharing for this account before starting.");
    }
  }

  async function fetchGeminiText(apiKey, promptText, maxOutputTokens, signal, repair = false) {
    const { solutionNotes } = await chrome.storage.local.get("solutionNotes");
    const notes = typeof solutionNotes === "string" ? solutionNotes.trim().slice(0, 4000) : "";
    return requestGeminiText({
      apiKey: apiKey || "",
      prompt: notes ? `${promptText}\n\nUser implementation notes:\n${notes}` : promptText,
      maxOutputTokens,
      signal,
      repair,
      assertConsent: assertGeminiConsent,
    });
  }

  async function startExecution(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedUrl(tab?.url))
      throw new Error("Open a CodeChum challenge tab to start the solver.");
    if (stoppingRuns.has(tabId)) await stoppingRuns.get(tabId);
    if (activeRuns.has(tabId)) return { success: true, started: false, alreadyRunning: true };
    await assertGeminiConsent();
    const access = await ExtensionAuth.getAccess();
    if (!access.allowed) {
      const error = access.reason || "Subscription access required.";
      await chrome.storage.local.set({
        lastError: { message: error, time: new Date().toLocaleTimeString(), timestamp: Date.now() },
      });
      throw new Error(error);
    }
    const {
      geminiApiKey,
      executionMode = "assist",
      typingSpeed = "realistic",
    } = await chrome.storage.local.get(["geminiApiKey", "executionMode", "typingSpeed"]);

    // Parallelize non-blocking startup telemetry and badge updates
    await Promise.allSettled([
      chrome.storage.local.remove("lastError"),
      chrome.storage.local.set({
        isRunning: true,
        activeTabId: tabId,
        lastRunTime: Date.now(),
      }),
      chrome.action.setBadgeText({ tabId, text: "RUN" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#10B981" }),
    ]);

    // This Web Store build runs only the disclosed CodeChum solver. It never
    // executes arbitrary script strings supplied by a page or extension UI.
    // A slow WPM setting can take several minutes. Acknowledge the popup now;
    // progress and the final result are published through solverStatus.
    void runCodeChumWorkflow(tabId, {
      apiKey: geminiApiKey,
      executionMode,
      typingSpeed,
    }).catch(async (err) => {
      const errorMsg = err.message || String(err);
      if (errorMsg === "Solver stopped.") return;
      if (err instanceof GeminiBlockedResponseError && err.reason === "RECITATION") {
        await chrome.storage.local.remove("lastError");
        await chrome.storage.local.set({ isRunning: false, activeTabId: null });
        await setSolverStatus(
          "needs_original_solution",
          "Gemini withheld this response because it may resemble existing material. No blocked code was inserted. Add your own algorithm steps in Your approach, then choose Request original solution. Gemini may still decline a request.",
          { verified: false },
        );
        await chrome.action.setBadgeText({ tabId, text: "WAIT" });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#D69B35" });
        return;
      }
      console.error("[CodeChum assistant]", errorMsg);
      await chrome.storage.local.set({
        lastError: {
          message: errorMsg,
          time: new Date().toLocaleTimeString(),
          timestamp: Date.now(),
        },
        isRunning: false,
        activeTabId: null,
      });
      await setSolverStatus("error", errorMsg, { verified: false });
      await chrome.action.setBadgeText({ tabId, text: "ERR" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#EF4444" });
    });
    return { success: true, started: true };
  }

  function identityChanges(current, problem) {
    const changed = [];
    if (!current) changed.push("page identity unavailable");
    else {
      if (current.url !== problem.url) changed.push("URL");
      const normalizedTitle = (value) =>
        String(value || "")
          .replace(/\s+/g, " ")
          .trim();
      if (current.title && normalizedTitle(current.title) !== normalizedTitle(problem.title))
        changed.push("title");
      if (current.itemNumber && current.itemNumber !== problem.itemNumber)
        changed.push("item number");
      if (current.activeFile && problem.activeFile && current.activeFile !== problem.activeFile)
        changed.push("active file");
    }
    return changed;
  }

  async function ensureSameItem(tabId, problem, run) {
    assertRunActive(run);
    const current = await pageCall(tabId, CodeChumPage.getIdentity);
    assertRunActive(run);
    const changed = identityChanges(current, problem);
    if (changed.length) {
      throw new Error(
        `The active CodeChum item changed (${changed.join(", ")}). Solver stopped before reading results or writing more code.`,
      );
    }
  }

  function observedCaseFeedback(caseBlocks, selectedCases) {
    const blocks = new Map((caseBlocks || []).map((block) => [block.number, block]));
    return selectedCases
      .map((testCase) => {
        const block = blocks.get(testCase.number);
        if (!block || block.status !== "failed") return "";
        return (
          `Test case ${testCase.number}: FAILED\n` +
          `Description: ${testCase.description || "None shown"}\n` +
          `Expected Output:\n${testCase.expectedOutput}\n` +
          `Your Output:\n${block.yourOutput ?? "No output shown"}`
        );
      })
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 16000);
  }

  function assessManualCheck(
    result,
    caseBlocks,
    selectedCases,
    focusedSelection,
    hasRequirements,
    requirementBlocks = [],
  ) {
    const blocks = new Map((caseBlocks || []).map((block) => [block.number, block]));
    const selectedStatuses = selectedCases.map(
      (item) => blocks.get(item.number)?.status || "unchecked",
    );
    const selectedComplete =
      selectedStatuses.length > 0 &&
      selectedStatuses.every((status) => status === "passed" || status === "failed");
    const selectedEarned = selectedStatuses.filter((status) => status === "passed").length;
    const failedRequirements = requirementBlocks.filter((block) => block.status === "failed");
    const checkedRequirements = requirementBlocks.filter(
      (block) => block.status === "passed" || block.status === "failed",
    );
    const reportedRequirementsMet = result.minimumRequirements?.met ?? null;
    let requirementsMet = reportedRequirementsMet;
    if (requirementsMet === null) {
      if (failedRequirements.length) requirementsMet = false;
      else if (
        requirementBlocks.length &&
        checkedRequirements.length === requirementBlocks.length &&
        checkedRequirements.every((block) => block.status === "passed")
      )
        requirementsMet = true;
    }
    const minimumRequirements = {
      ...result.minimumRequirements,
      met: requirementsMet,
      score:
        result.minimumRequirements?.score ||
        (reportedRequirementsMet === null &&
        checkedRequirements.length === requirementBlocks.length &&
        requirementBlocks.length
          ? {
              earned: checkedRequirements.filter((block) => block.status === "passed").length,
              total: requirementBlocks.length,
            }
          : null),
    };
    const requirementsUnknown = hasRequirements && requirementsMet === null && !result.passed;
    const passed =
      requirementsMet !== false &&
      !requirementsUnknown &&
      (result.passed ||
        (focusedSelection && selectedComplete && selectedEarned === selectedCases.length));
    const selectedScore =
      focusedSelection && selectedComplete
        ? { earned: selectedEarned, total: selectedCases.length }
        : null;
    const score =
      result.overallScore ||
      (requirementsMet === false && result.score
        ? { earned: 0, total: result.score.total }
        : result.score || selectedScore);
    const failedCases = observedCaseFeedback(caseBlocks, selectedCases);
    const failedRequirementFeedback = (requirementsMet === false ? failedRequirements : [])
      .map((block) => `Minimum requirement failed: ${block.text}`)
      .join("\n");
    const requirementFeedback = result.feedback
      .split("\n")
      .filter((line) =>
        /minimum requirements?|^\s*requirements?\s*:|^\s*score\s*:|should\s+(?:not\s+)?use\s*:|\bMethod\s+public\b/i.test(
          line,
        ),
      )
      .join("\n");
    const feedback = focusedSelection
      ? [
          requirementFeedback,
          failedRequirementFeedback,
          failedCases ||
            (requirementsMet === false ? "CodeChum rejected a minimum requirement." : ""),
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 16000)
      : [result.feedback, failedRequirementFeedback, failedCases]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 16000);
    return {
      passed,
      score,
      selectedScore,
      feedback,
      selectedComplete,
      selectedStatuses,
      requirementsUnknown,
      minimumRequirements,
    };
  }

  async function ensureRequiredMethodDeclarations(
    problem,
    code,
    apiKey,
    run,
    statusContext,
    attempt,
    totalAttempts,
  ) {
    if (!/\bJava\b/i.test(problem.language)) return code;
    const missing = CodeChumCore.missingRequiredMethods(problem.requirements, code);
    if (!missing.length) return code;
    await setSolverStatus("checking_requirements", `Adding required method: ${missing[0]}`, {
      ...statusContext,
      attempt,
      totalAttempts,
      verified: false,
    });
    const feedback =
      `Before typing, the generated code is missing this required method declaration: ${missing.join("; ")}. ` +
      "Add real method bodies with the exact modifiers, return types, names, and parameter types. Keep the rest of the solution working.";
    const revised = await fetchGeminiText(
      apiKey,
      CodeChumCore.codePrompt(problem, "", code, feedback),
      6000,
      run.controller.signal,
      true,
    );
    assertRunActive(run);
    const repaired = revised
      .replace(/^```[a-zA-Z]*\s*/g, "")
      .replace(/\s*```$/g, "")
      .trim();
    const stillMissing = CodeChumCore.missingRequiredMethods(problem.requirements, repaired);
    if (stillMissing.length) {
      throw new Error(
        `Gemini omitted the required CodeChum method: ${stillMissing.join("; ")}. The editor was not changed.`,
      );
    }
    return repaired;
  }

  async function runCodeChumWorkflow(tabId, config) {
    const { apiKey, typingSpeed } = config;
    const previous = activeRuns.get(tabId);
    if (previous) {
      previous.cancelled = true;
      previous.controller.abort();
    }
    const run = {
      tabId,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      cancelled: false,
      controller: new AbortController(),
    };
    run.done = new Promise((resolve) => {
      run.finish = resolve;
    });
    activeRuns.set(tabId, run);

    try {
      await setSolverStatus(
        "reading",
        "Reading the problem, minimum requirements, and CodeChum test cases…",
      );
      const rawCheckpoint = await readRawSolverCheckpoint(tabId);
      const savedCheckpoint = normalizeSolverCheckpoint(rawCheckpoint);
      if (rawCheckpoint?.version === 2 && savedCheckpoint) {
        await chrome.storage.local.set({
          [checkpointKey(tabId)]: savedCheckpoint,
          solverCheckpoint: savedCheckpoint,
        });
      }
      let problem = null;
      let allCases = null;
      let problemSnapshot = null;
      let snapshotAccepted = false;
      let requirementsChanged = false;
      if (
        savedCheckpoint?.version === 3 &&
        savedCheckpoint.tabId === tabId &&
        savedCheckpoint.problemSnapshot?.allCases &&
        savedCheckpoint.key
      ) {
        assertRunActive(run);
        const current = await pageCall(tabId, CodeChumPage.getIdentity);
        assertRunActive(run);
        const snapshot = savedCheckpoint.problemSnapshot;
        if (!identityChanges(current, snapshot).length) {
          problem = { ...snapshot };
          allCases = snapshot.allCases;
          problemSnapshot = snapshot;
          snapshotAccepted = true;
          // Older checkpoints may have been saved before the Tests-panel
          // requirement cards were read. Never continue typing that candidate
          // against a stale prompt when the live item now exposes more rules.
          const live = await pageCall(tabId, CodeChumPage.readProblem, [true]);
          assertRunActive(run);
          const normalize = (value) =>
            String(value || "")
              .replace(/\s+/g, " ")
              .trim();
          if (
            live?.title &&
            live.requirements &&
            normalize(live.requirements) !== normalize(snapshot.requirements)
          ) {
            problem = null;
            allCases = null;
            problemSnapshot = null;
            snapshotAccepted = false;
            requirementsChanged = true;
          }
        }
      }
      if (!problem) {
        const scrapeDeadline = Date.now() + 8000;
        while (Date.now() < scrapeDeadline) {
          assertRunActive(run);
          problem = await pageCall(tabId, CodeChumPage.readProblem);
          if (problem?.title) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (problem?.title) {
          allCases = CodeChumCore.extractCases(problem);
          problemSnapshot = {
            url: problem.url,
            title: problem.title,
            description: problem.description,
            language: problem.language,
            itemNumber: problem.itemNumber,
            activeFile: problem.activeFile,
            fileCount: problem.fileCount,
            requirements: problem.requirements,
            visibleCaseCount: problem.visibleCaseCount,
            allCases,
          };
        }
      }
      if (!problem?.title)
        throw new Error("No CodeChum challenge was found. Open a console problem and try again.");

      problem.testCases = allCases;
      const cacheKey = snapshotAccepted ? savedCheckpoint.key : CodeChumCore.fingerprint(problem);
      if (requirementsChanged && savedCheckpoint?.key && savedCheckpoint.key !== cacheKey) {
        const { caseSelections = {} } = await chrome.storage.local.get("caseSelections");
        if (Array.isArray(caseSelections[savedCheckpoint.key]) && !caseSelections[cacheKey]) {
          await chrome.storage.local.set({
            caseSelections: {
              ...caseSelections,
              [cacheKey]: caseSelections[savedCheckpoint.key],
            },
          });
        }
      }
      const selectedCases = await selectedCasesFor(cacheKey, allCases);
      const focusedSelection = selectedCases.length > 0 && selectedCases.length < allCases.length;
      problem.testCases = selectedCases;
      problem.focusedSelection = focusedSelection;
      const warnings = [];
      if (requirementsChanged)
        warnings.push("New minimum requirements were found; the saved candidate was regenerated.");
      if (!allCases.length || allCases.length < problem.visibleCaseCount) {
        warnings.push("Some visible test cases could not be read before generation.");
      }
      if (problem.fileCount > 1)
        warnings.push("This item has multiple files; only the active file will be edited.");
      const warning = warnings.join(" ");
      const statusContext = {
        cases: allCases.length,
        selectedCases: selectedCases.length,
        focusedSelection,
        warning,
      };
      const totalAttempts = 3;
      const selectedNumbers = selectedCases.map((item) => item.number);
      const resume =
        snapshotAccepted &&
        savedCheckpoint?.version === 3 &&
        savedCheckpoint.tabId === tabId &&
        savedCheckpoint.key === cacheKey &&
        (savedCheckpoint.phase === "awaiting_manual_check" ||
          JSON.stringify(savedCheckpoint.selectedNumbers) === JSON.stringify(selectedNumbers)) &&
        typeof savedCheckpoint.code === "string" &&
        savedCheckpoint.code.length > 0 &&
        Number.isInteger(savedCheckpoint.attempt) &&
        savedCheckpoint.attempt >= 1 &&
        savedCheckpoint.attempt <= totalAttempts &&
        ["typing", "awaiting_manual_check", "repairing"].includes(savedCheckpoint.phase)
          ? savedCheckpoint
          : null;
      if (savedCheckpoint?.tabId === tabId && !resume) await removeSolverCheckpoint(tabId);
      let solutionCode = resume?.code || solutionCache.get(cacheKey) || "";
      let best = resume?.best || null;
      let phase = resume?.phase || "typing";
      let feedback = resume?.feedback || "";
      let firstAttempt = resume?.attempt || 1;
      let progress = Number.isInteger(resume?.progress)
        ? Math.max(0, Math.min(resume.progress, solutionCode.length))
        : 0;

      if (phase === "awaiting_manual_check" || !resume) {
        await ensureSameItem(tabId, problem, run);
        const pageResult = await pageCall(tabId, CodeChumPage.readResult);
        assertRunActive(run);
        const manualResult = CodeChumCore.parseCheckResult(pageResult?.raw || "");
        if (phase === "awaiting_manual_check" && !manualResult.completed) {
          await setSolverStatus(
            "awaiting_check",
            "Click CodeChum Check code yourself. Keep the result open, then press Start to review it.",
            {
              ...statusContext,
              attempt: firstAttempt,
              totalAttempts,
              verified: false,
            },
          );
          await chrome.action.setBadgeText({ tabId, text: "WAIT" });
          return;
        }
        if (manualResult.completed) {
          await ensureSameItem(tabId, problem, run);
          const checkedProblem = await pageCall(tabId, CodeChumPage.readProblem, [true]);
          assertRunActive(run);
          const hasRequirements = Boolean(
            problem.requirements?.trim() &&
            !/^(?:none|no minimum requirements?)\.?$/i.test(problem.requirements.trim()),
          );
          const checked = assessManualCheck(
            manualResult,
            checkedProblem?.caseBlocks,
            selectedCases,
            focusedSelection,
            hasRequirements,
            checkedProblem?.requirementBlocks || [],
          );
          if (
            focusedSelection &&
            !manualResult.passed &&
            (!checked.selectedComplete ||
              checked.selectedStatuses.some((status) => status === "unchecked"))
          ) {
            await setSolverStatus(
              "awaiting_check",
              "The selected case results are not readable yet. Leave the CodeChum result open and press Start again.",
              {
                ...statusContext,
                attempt: firstAttempt,
                totalAttempts,
                verified: false,
              },
            );
            return;
          }
          if (
            checked.requirementsUnknown &&
            focusedSelection &&
            checked.selectedComplete &&
            checked.selectedStatuses.every((status) => status === "passed")
          ) {
            await setSolverStatus(
              "awaiting_check",
              "Selected cases passed, but the minimum-requirement result is unreadable. Review the CodeChum score and press Start again with the result open.",
              {
                ...statusContext,
                attempt: firstAttempt,
                totalAttempts,
                score: checked.score,
                minimumRequirements: checked.minimumRequirements,
                verified: false,
              },
            );
            return;
          }
          const editorCode = await pageCall(tabId, CodeChumPage.readEditorCode, [], "MAIN");
          assertRunActive(run);
          if (resume && editorCode && editorCode !== resume.code) {
            await setSolverStatus(
              "awaiting_check",
              "The editor changed after this candidate was written. Check the current code manually, then press Start again.",
              {
                ...statusContext,
                attempt: firstAttempt,
                totalAttempts,
                verified: false,
              },
            );
            return;
          }
          if (!resume) solutionCode = editorCode || "";
          const checkedAttempt = resume ? firstAttempt : 0;
          const earned = checked.score?.earned ?? (checked.passed ? selectedCases.length || 1 : 0);
          if (solutionCode && (!best || earned > best.earned)) {
            best = {
              code: solutionCode,
              earned,
              score: checked.score,
              minimumRequirements: checked.minimumRequirements,
            };
          }
          if (checked.passed) {
            if (!focusedSelection && solutionCode) solutionCache.set(cacheKey, solutionCode);
            await setSolverStatus(
              focusedSelection ? "focused_pass" : "passed",
              focusedSelection
                ? "Selected cases passed in your manual CodeChum check. Review other cases before finishing."
                : "Your manual CodeChum check passed. Review the result before finishing.",
              {
                ...statusContext,
                warning: "",
                attempt: checkedAttempt || undefined,
                totalAttempts,
                score: checked.score,
                selectedScore: checked.selectedScore,
                minimumRequirements: checked.minimumRequirements,
                verified: !focusedSelection,
              },
            );
            await chrome.action.setBadgeText({ tabId, text: focusedSelection ? "SEL" : "PASS" });
            await chrome.action.setBadgeBackgroundColor({ tabId, color: "#10B981" });
            await clearSolverCheckpoint(run, cacheKey);
            return;
          }
          solutionCache.delete(cacheKey);
          if (resume && firstAttempt === totalAttempts) {
            if (best?.code && best.code !== solutionCode) {
              await ensureSameItem(tabId, problem, run);
              const retry = await pageCall(tabId, CodeChumPage.prepareRetry);
              if (!retry?.ready)
                throw new Error("Could not reopen the editor to restore the best-scoring code.");
              const restored = await pageCall(tabId, CodeChumPage.restoreCode, [best.code], "MAIN");
              if (!restored?.restored)
                throw new Error("Could not restore the best-scoring code in the editor.");
            }
            await setSolverStatus(
              "failed",
              "Three manually checked candidates failed. The best-scoring code is available for review.",
              {
                ...statusContext,
                attempt: totalAttempts,
                totalAttempts,
                score: best?.score || checked.score || null,
                minimumRequirements: best?.minimumRequirements || checked.minimumRequirements,
                verified: false,
              },
            );
            await chrome.action.setBadgeText({ tabId, text: "FAIL" });
            await chrome.action.setBadgeBackgroundColor({ tabId, color: "#EF4444" });
            await clearSolverCheckpoint(run, cacheKey);
            return;
          }
          feedback = checked.feedback;
          firstAttempt = resume ? firstAttempt + 1 : 1;
          phase = solutionCode ? "repairing" : "typing";
          if (solutionCode) {
            await saveSolverCheckpoint(run, {
              version: 3,
              key: cacheKey,
              problemSnapshot,
              selectedNumbers,
              code: solutionCode,
              attempt: firstAttempt,
              phase,
              best,
              feedback,
            });
          }
          await setSolverStatus(
            "retrying",
            checked.minimumRequirements?.met === false
              ? "CodeChum scored zero because a minimum requirement was unmet. Revising the code…"
              : "Your manual check found wrong results. Revising the selected cases…",
            {
              ...statusContext,
              attempt: firstAttempt,
              totalAttempts,
              score: checked.score,
              minimumRequirements: checked.minimumRequirements,
              verified: false,
            },
          );
        }
      }

      if (!resume && !feedback) {
        feedback = observedCaseFeedback(problem.caseBlocks, selectedCases);
        if (feedback && !solutionCode) {
          const currentCode = await pageCall(tabId, CodeChumPage.readEditorCode, [], "MAIN");
          assertRunActive(run);
          if (currentCode) {
            solutionCode = currentCode;
            phase = "repairing";
          }
        }
      }

      if (!feedback)
        await setSolverStatus(
          resume ? "resuming" : "generating",
          resume
            ? `Continuing candidate ${firstAttempt} of ${totalAttempts} from the saved checkpoint…`
            : solutionCode
              ? "Using a previously verified solution…"
              : "Analyzing the selected cases and writing code…",
          {
            ...statusContext,
            attempt: firstAttempt,
            totalAttempts,
          },
        );

      if (!solutionCode) {
        await chrome.action.setBadgeText({ tabId, text: "AI…" });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#6366F1" });
        solutionCode = await fetchGeminiText(
          apiKey,
          CodeChumCore.codePrompt(problem, "", "", feedback),
          6000,
          run.controller.signal,
        );
        assertRunActive(run);
        solutionCode = solutionCode
          .replace(/^```[a-zA-Z]*\s*/g, "")
          .replace(/\s*```$/g, "")
          .trim();
        if (!solutionCode) throw new Error("Gemini returned empty code.");
        solutionCode = await ensureRequiredMethodDeclarations(
          problem,
          solutionCode,
          apiKey,
          run,
          statusContext,
          firstAttempt,
          totalAttempts,
        );
      }

      for (let attempt = firstAttempt; attempt <= totalAttempts; attempt++) {
        if (phase === "repairing") {
          await ensureSameItem(tabId, problem, run);
          if (resume && attempt === firstAttempt) {
            await setSolverStatus("retrying", "Continuing the saved revision…", {
              ...statusContext,
              attempt,
              totalAttempts,
              score: best?.score || null,
            });
          }
          solutionCode = await fetchGeminiText(
            apiKey,
            CodeChumCore.codePrompt(problem, "", solutionCode, feedback),
            6000,
            run.controller.signal,
            true,
          );
          assertRunActive(run);
          solutionCode = solutionCode
            .replace(/^```[a-zA-Z]*\s*/g, "")
            .replace(/\s*```$/g, "")
            .trim();
          if (!solutionCode) throw new Error("Gemini returned empty revised code.");
          solutionCode = await ensureRequiredMethodDeclarations(
            problem,
            solutionCode,
            apiKey,
            run,
            statusContext,
            attempt,
            totalAttempts,
          );
          phase = "typing";
          progress = 0;
        }

        if (phase === "typing") {
          await saveSolverCheckpoint(run, {
            version: 3,
            key: cacheKey,
            problemSnapshot,
            selectedNumbers,
            code: solutionCode,
            attempt,
            phase,
            best,
            progress,
          });
          await ensureSameItem(tabId, problem, run);
          const retry = await pageCall(tabId, CodeChumPage.prepareRetry);
          if (!retry?.ready)
            throw new Error(retry?.error || "Could not reopen the CodeChum editor.");
          await ensureSameItem(tabId, problem, run);

          if (resume?.phase === "typing" && attempt === firstAttempt && progress > 0) {
            const visibleCode = await pageCall(tabId, CodeChumPage.readEditorCode, [], "MAIN");
            assertRunActive(run);
            if (!solutionCode.startsWith(visibleCode || "") || visibleCode.length < progress) {
              const restored = await pageCall(
                tabId,
                CodeChumPage.restoreCode,
                [solutionCode.slice(0, progress)],
                "MAIN",
              );
              if (!restored?.restored)
                throw new Error("Could not restore the saved typing progress.");
            }
          }

          const { typingSpeed: savedSpeed = typingSpeed } =
            await chrome.storage.local.get("typingSpeed");
          const effectiveSpeed = SPEED_LEVELS.some((level) => level.id === savedSpeed)
            ? savedSpeed
            : "realistic";
          await setSolverStatus(
            "typing",
            "Placing candidate " +
              attempt +
              " of " +
              totalAttempts +
              (effectiveSpeed === "instant"
                ? " instantly for your manual check…"
                : " in the editor at " +
                  SPEED_LEVELS.find((level) => level.id === effectiveSpeed).label +
                  "…"),
            {
              ...statusContext,
              attempt,
              totalAttempts,
              typingSpeed: effectiveSpeed,
              wpm: SPEED_LEVELS.find((level) => level.id === effectiveSpeed).wpm,
            },
          );
          await typeSolutionIntoEditor(
            tabId,
            solutionCode,
            effectiveSpeed,
            problem.title,
            problem.activeFile,
            async (completed, total) => {
              assertRunActive(run);
              progress = completed;
              await saveSolverCheckpoint(run, {
                version: 3,
                key: cacheKey,
                problemSnapshot,
                selectedNumbers,
                code: solutionCode,
                attempt,
                phase: "typing",
                best,
                progress,
              });
              const { typingSpeed: currentSpeed = effectiveSpeed } =
                await chrome.storage.local.get("typingSpeed");
              const speedSetting =
                SPEED_LEVELS.find((level) => level.id === currentSpeed) ||
                SPEED_LEVELS.find((level) => level.id === effectiveSpeed);
              await setSolverStatus(
                "typing",
                `Typing candidate ${attempt} of ${totalAttempts}: ${completed}/${total} characters…`,
                {
                  ...statusContext,
                  attempt,
                  totalAttempts,
                  typingSpeed: speedSetting.id,
                  wpm: speedSetting.wpm,
                },
              );
            },
          );
          await ensureSameItem(tabId, problem, run);
          phase = "awaiting_manual_check";
          progress = solutionCode.length;
          await saveSolverCheckpoint(run, {
            version: 3,
            key: cacheKey,
            problemSnapshot,
            selectedNumbers,
            code: solutionCode,
            attempt,
            phase,
            best,
            progress,
          });
        }
        await setSolverStatus(
          "awaiting_check",
          "Candidate ready. Click CodeChum Check code yourself, keep the result open, then press Start to review wrong results.",
          {
            ...statusContext,
            attempt,
            totalAttempts,
            verified: false,
          },
        );
        await chrome.action.setBadgeText({ tabId, text: "WAIT" });
        return;
      }
    } catch (error) {
      if (run.cancelled) throw new Error("Solver stopped.");
      throw error;
    } finally {
      try {
        if (activeRuns.get(tabId) === run) {
          activeRuns.delete(tabId);
          await chrome.storage.local.set({ isRunning: false, activeTabId: null });
        }
      } finally {
        run.finish();
      }
    }
  }

  async function typeSolutionIntoEditor(
    tabId,
    solutionCode,
    typingSpeed,
    expectedTitle,
    expectedFile,
    onProgress,
  ) {
    await chrome.action.setBadgeText({ tabId, text: "TYP" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#10B981" });

    // Each non-instant call is at most 30 characters (12 seconds at 30 WPM).
    // This keeps individual scripting requests short, even for long answers.
    let completed = -1;
    let speed = typingSpeed;
    while (completed < solutionCode.length) {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: async (codeToType, speed, expectedTitle, expectedFile, maxCharacters) => {
          try {
            // Scoped anonymous closure - no window.__* variables created
            const wait = (ms) => new Promise((r) => setTimeout(r, ms));

            // Wait for Ace editor to be ready (progressive poll up to 6s)
            let editor = null;
            let aceEl = null;
            const startPoll = Date.now();
            let pollDelay = 30;

            while (Date.now() - startPoll < 6000) {
              aceEl = document.querySelector(".ace_editor");
              if (aceEl) {
                if (aceEl.env && aceEl.env.editor) {
                  editor = aceEl.env.editor;
                  break;
                } else if (window.ace && typeof window.ace.edit === "function") {
                  editor = window.ace.edit(aceEl);
                  break;
                }
              }
              await wait(pollDelay);
              if (pollDelay < 150) pollDelay += 20;
            }

            if (!editor || !aceEl) {
              throw new Error("Ace Editor was not found on this page after 6 seconds.");
            }
            const sameItem = () => {
              const details =
                document.querySelector('#answerDetails, [data-testid="answerDetails"]') || document;
              const titleEl =
                details.querySelector(
                  ".styles_text___heading___xs__Qdbcu.styles_text___n___700__ekgLG",
                ) || details.querySelector("[class*='styles_text___heading'], h1, h2");
              const activeFile =
                document
                  .querySelector('#answerEditor button[data-testid="tabButton"][class*="active"]')
                  ?.getAttribute("aria-label") || "";
              return (
                (titleEl?.innerText || titleEl?.textContent || "").trim() === expectedTitle &&
                (!expectedFile || activeFile === expectedFile)
              );
            };
            if (!sameItem()) throw new Error("The CodeChum item changed before typing began.");

            let isCancelled = false;
            function onStopSignal() {
              isCancelled = true;
              document.removeEventListener("__codechum_assistant_stop__", onStopSignal);
            }
            document.addEventListener("__codechum_assistant_stop__", onStopSignal);

            // If Instant speed selected:
            if (speed === "instant") {
              try {
                if (isCancelled || !sameItem())
                  throw new Error("The CodeChum item changed before typing began.");
                editor.setValue(codeToType, 1);
                aceEl.dispatchEvent(new Event("input", { bubbles: true }));
                aceEl.dispatchEvent(new Event("change", { bubbles: true }));
              } finally {
                document.removeEventListener("__codechum_assistant_stop__", onStopSignal);
              }
              return { nextIndex: codeToType.length };
            }

            // Pace every character against elapsed time. A word is five characters,
            // including spaces, so the advertised WPM settings have a measurable rate.
            const originalBehaviours = editor.getBehavioursEnabled
              ? editor.getBehavioursEnabled()
              : false;
            let onLiveSpeedShift = null;
            try {
              // Temporarily disable auto-pairing / behaviours to prevent duplicate brackets
              if (editor.setBehavioursEnabled) editor.setBehavioursEnabled(false);

              // Smart Resume Detection: Preserve existing progress if stopped/continued
              const currentText = editor.getValue();
              let startIndex = 0;

              if (currentText && currentText.length > 0) {
                // Exact prefix match (e.g. stopped midway and resumed)
                if (codeToType.startsWith(currentText)) {
                  startIndex = currentText.length;
                  editor.navigateFileEnd();
                }
                // Match ignoring trailing whitespace
                else if (codeToType.startsWith(currentText.trimEnd())) {
                  const trimmed = currentText.trimEnd();
                  startIndex = trimmed.length;
                  if (currentText.length !== trimmed.length) {
                    editor.setValue(trimmed, 1);
                  }
                  editor.navigateFileEnd();
                }
                // Check for substantial prefix match (at least 15 characters)
                else {
                  let maxMatch = 0;
                  const maxCheck = Math.min(currentText.length, codeToType.length);
                  for (let len = maxCheck; len >= 15; len--) {
                    if (codeToType.startsWith(currentText.slice(0, len))) {
                      maxMatch = len;
                      break;
                    }
                  }
                  if (maxMatch > 0) {
                    editor.setValue(currentText.slice(0, maxMatch), 1);
                    editor.navigateFileEnd();
                    startIndex = maxMatch;
                  } else {
                    // Completely new problem or different code -> clear editor
                    editor.setValue("", 1);
                    startIndex = 0;
                  }
                }
              } else {
                editor.setValue("", 1);
                startIndex = 0;
              }

              const rates = { slow: 30, realistic: 45, fast: 75, turbo: 130, instant: Infinity };
              let millisecondsPerCharacter = 60000 / (5 * (rates[speed] || 45));
              let nextCharacterAt = Date.now();
              onLiveSpeedShift = (event) => {
                const selected = event?.detail?.speed;
                if (selected && Object.hasOwn(rates, selected)) {
                  millisecondsPerCharacter = 60000 / (5 * rates[selected]);
                  nextCharacterAt = Date.now();
                }
              };
              document.addEventListener("__codechum_assistant_speed__", onLiveSpeedShift);

              const endIndex = Math.min(codeToType.length, startIndex + maxCharacters);
              let nextIndex = startIndex;
              for (let i = startIndex; i < endIndex; i++) {
                if (isCancelled) break;
                if (i % 25 === 0 && !sameItem())
                  throw new Error("The CodeChum item changed while typing.");
                const char = codeToType[i];

                // Insert raw character into session document buffer
                const cursor = editor.getCursorPosition();
                const newPos = editor.session.insert(cursor, char);
                editor.selection.moveCursorTo(newPos.row, newPos.column);
                editor.clearSelection();
                nextIndex = i + 1;

                if (editor.renderer && typeof editor.renderer.scrollCursorIntoView === "function") {
                  editor.renderer.scrollCursorIntoView();
                }

                if (millisecondsPerCharacter > 0) {
                  // Keep a real interval after a delayed Ace or browser task. Never
                  // "catch up" with a burst of characters at a faster effective WPM.
                  nextCharacterAt =
                    Math.max(nextCharacterAt, Date.now()) + millisecondsPerCharacter;
                  await wait(Math.max(0, nextCharacterAt - Date.now()));
                } else if (i % 100 === 0) {
                  // Yield so Stop and item changes can be observed after switching to Instant.
                  await wait(0);
                }
              }

              if (isCancelled) {
                // Ace may have inserted its own indentation. Save an exact prefix so
                // a later Start can continue from this character, even after a reload.
                if (sameItem()) {
                  editor.setValue(codeToType.slice(0, nextIndex), 1);
                  aceEl.dispatchEvent(new Event("input", { bubbles: true }));
                  aceEl.dispatchEvent(new Event("change", { bubbles: true }));
                }
                throw new Error("Solver stopped.");
              }
              if (!sameItem()) throw new Error("The CodeChum item changed while typing.");
              // Ace may add indentation in a language mode even with paired brackets off.
              // Preserve the visible typing, then ensure the submitted code is exact.
              const expectedText = codeToType.slice(0, endIndex);
              if (editor.getValue() !== expectedText) editor.setValue(expectedText, 1);

              // Ace insert/setValue emit their own change deltas. Only forward DOM events.
              aceEl.dispatchEvent(new Event("input", { bubbles: true }));
              aceEl.dispatchEvent(new Event("change", { bubbles: true }));
              return { nextIndex: endIndex };
            } finally {
              if (editor.setBehavioursEnabled) editor.setBehavioursEnabled(originalBehaviours);
              document.removeEventListener("__codechum_assistant_stop__", onStopSignal);
              if (onLiveSpeedShift)
                document.removeEventListener("__codechum_assistant_speed__", onLiveSpeedShift);
            }
          } catch (error) {
            return { error: error?.message || String(error) };
          }
        },
        args: [
          solutionCode,
          speed,
          expectedTitle,
          expectedFile,
          speed === "instant" ? solutionCode.length : 30,
        ],
      });
      if (injection?.result?.error) throw new Error(injection.result.error);
      let nextIndex = injection?.result?.nextIndex;
      if (!Number.isInteger(nextIndex)) {
        // Chrome may omit an injected result even after Ace accepted a chunk.
        // Read the actual editor before deciding whether typing must stop.
        const [probe] = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (expectedCode, title, file) => {
            const details =
              document.querySelector('#answerDetails, [data-testid="answerDetails"]') || document;
            const titleEl =
              details.querySelector(
                ".styles_text___heading___xs__Qdbcu.styles_text___n___700__ekgLG",
              ) || details.querySelector("[class*='styles_text___heading'], h1, h2");
            const activeFile =
              document
                .querySelector('#answerEditor button[data-testid="tabButton"][class*="active"]')
                ?.getAttribute("aria-label") || "";
            if (
              (titleEl?.innerText || titleEl?.textContent || "").trim() !== title ||
              (file && activeFile !== file)
            ) {
              return { error: "The CodeChum item changed while typing." };
            }
            const aceEl = document.querySelector(".ace_editor");
            const editor =
              aceEl?.env?.editor || (window.ace && aceEl ? window.ace.edit(aceEl) : null);
            if (!editor) return { error: "The CodeChum editor disappeared while typing." };
            const actual = editor.getValue();
            return expectedCode.startsWith(actual)
              ? { nextIndex: actual.length }
              : { error: "CodeChum changed the editor text during typing." };
          },
          args: [solutionCode, expectedTitle, expectedFile],
        });
        if (probe?.result?.error) throw new Error(probe.result.error);
        nextIndex = probe?.result?.nextIndex;
      }
      if (
        !Number.isInteger(nextIndex) ||
        nextIndex <= Math.max(0, completed) ||
        nextIndex > solutionCode.length
      ) {
        throw new Error("CodeChum did not advance the editor during typing.");
      }
      completed = nextIndex;
      if (onProgress) await onProgress(completed, solutionCode.length);
      if (completed < solutionCode.length) {
        const { typingSpeed: selectedSpeed = speed } =
          await chrome.storage.local.get("typingSpeed");
        speed = SPEED_LEVELS.some((level) => level.id === selectedSpeed) ? selectedSpeed : speed;
      }
    }
  }

  function stopExecution(tabId) {
    if (stoppingRuns.has(tabId)) return stoppingRuns.get(tabId);
    const stopping = performStopExecution(tabId);
    stoppingRuns.set(tabId, stopping);
    return stopping.finally(() => {
      if (stoppingRuns.get(tabId) === stopping) stoppingRuns.delete(tabId);
    });
  }

  async function performStopExecution(tabId) {
    const run = activeRuns.get(tabId);
    if (run) {
      run.cancelled = true;
      run.controller.abort();
      activeRuns.delete(tabId);
    }

    // Signal the page first. Then wait for the previous injected typing chunk to
    // finish, so Start cannot race its final Ace normalization.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
          document.dispatchEvent(new CustomEvent("__codechum_assistant_stop__"));
          if (window.__ScriptRunner) window.__ScriptRunner.isRunning = false;
          if (window.__ScriptRunnerLoop) clearInterval(window.__ScriptRunnerLoop);
        },
      });
    } catch (error) {
      console.warn("[CodeChum assistant] Stop signal could not reach the page:", error);
    }

    if (run) {
      let timeoutId;
      try {
        await Promise.race([
          run.done,
          new Promise((resolve) => {
            timeoutId = setTimeout(resolve, 16000);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
      if (run.checkpointWrite) await run.checkpointWrite.catch(() => {});
    }
    let solverCheckpoint = normalizeSolverCheckpoint(await readRawSolverCheckpoint(tabId));
    if (solverCheckpoint?.tabId === tabId && solverCheckpoint.phase === "typing") {
      try {
        const editorCode = await pageCall(tabId, CodeChumPage.readEditorCode, [], "MAIN");
        if (
          editorCode &&
          solverCheckpoint.code.startsWith(editorCode) &&
          editorCode.length > (solverCheckpoint.progress || 0)
        ) {
          const current = await readRawSolverCheckpoint(tabId);
          if (
            current?.tabId === tabId &&
            current.key === solverCheckpoint.key &&
            current.runId === solverCheckpoint.runId &&
            current.phase === "typing"
          ) {
            solverCheckpoint = { ...current, progress: editorCode.length };
            const { solverCheckpoint: legacy } = await chrome.storage.local.get("solverCheckpoint");
            await chrome.storage.local.set({
              [checkpointKey(tabId)]: solverCheckpoint,
              ...(legacy?.tabId === tabId ? { solverCheckpoint } : {}),
            });
          }
        }
      } catch (error) {
        console.warn("[CodeChum assistant] Could not read paused editor progress:", error);
      }
    }

    const resumable = solverCheckpoint?.version === 3 && solverCheckpoint.tabId === tabId;
    if (run || resumable) {
      await setSolverStatus(
        "stopped",
        resumable
          ? solverCheckpoint.phase === "awaiting_manual_check"
            ? `Candidate ${solverCheckpoint.attempt} is ready. Click Check code manually, then press Start to review it.`
            : `Paused candidate ${solverCheckpoint.attempt} of 3. Start again on this item to continue typing.`
          : "Stopped before a candidate was ready. Start again to generate a solution.",
        {
          verified: false,
          resumable,
          attempt: resumable ? solverCheckpoint.attempt : undefined,
          totalAttempts: resumable ? 3 : undefined,
        },
      );
    }
    await chrome.storage.local.set({ isRunning: false, activeTabId: null });

    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}
