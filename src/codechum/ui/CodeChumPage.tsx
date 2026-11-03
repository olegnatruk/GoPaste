import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type { AccessState } from "./auth";
import type {
  CodeChumServices,
  CodeChumShortcut,
  CodeChumStoredState,
  CodeChumTab,
  SolverStatus,
  TestCatalog,
} from "./services";

interface CodeChumPageProps {
  services: CodeChumServices;
  initialTabId?: number;
  onTabSelected?: (tabId: number | undefined) => void;
}

const SPEEDS = [
  ["slow", "30 WPM"],
  ["realistic", "45 WPM"],
  ["fast", "75 WPM"],
  ["turbo", "130 WPM"],
  ["instant", "Instant"],
];

const CODECHUM_SHORTCUTS = [
  { name: "start-script", label: "Start / resume" },
  { name: "stop-script", label: "Stop" },
  { name: "speed-up", label: "Speed up" },
  { name: "speed-down", label: "Speed down" },
];

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function statusLabel(status?: SolverStatus): string {
  if (!status?.stage) return "Ready";
  const names: Record<string, string> = {
    passed: "Verified",
    focused_pass: "Selected tests passed",
    awaiting_check: "Waiting for your check",
    checking_requirements: "Checking requirements",
    failed: "Needs review",
    needs_original_solution: "Original solution needed",
    error: "Error",
  };
  return names[status.stage] || status.stage.replaceAll("_", " ");
}

export function CodeChumPage({ services, initialTabId, onTabSelected }: CodeChumPageProps) {
  const [access, setAccess] = useState<AccessState>();
  const [tabs, setTabs] = useState<CodeChumTab[]>([]);
  const [shortcuts, setShortcuts] = useState<CodeChumShortcut[]>();
  const [shortcutsUnavailable, setShortcutsUnavailable] = useState(false);
  const [tabId, setTabId] = useState<number>();
  const [catalog, setCatalog] = useState<TestCatalog>();
  const [status, setStatus] = useState<SolverStatus>();
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [solutionNotes, setSolutionNotes] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [mode, setMode] = useState<"assist" | "autopilot">("assist");
  const [speed, setSpeed] = useState("realistic");
  const [consentUserId, setConsentUserId] = useState<string>();
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const selectionSave = useRef<Promise<void>>(Promise.resolve());

  const consented = Boolean(access?.userId && consentUserId === access.userId);

  useEffect(() => {
    if (tabId !== undefined) onTabSelected?.(tabId);
  }, [onTabSelected, tabId]);

  useEffect(() => {
    let active = true;
    void services
      .getShortcuts()
      .then((items) => {
        if (active) setShortcuts(items);
      })
      .catch(() => {
        if (active) setShortcutsUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [services]);

  const refreshTabs = useCallback(async () => {
    try {
      const nextTabs = await services.getTabs();
      setTabs(nextTabs);
      setTabId((current) => {
        if (current && nextTabs.some((tab) => tab.id === current)) return current;
        if (initialTabId && nextTabs.some((tab) => tab.id === initialTabId)) return initialTabId;
        return nextTabs[0]?.id;
      });
    } catch (cause) {
      setError(messageFrom(cause, "Could not find CodeChum tabs."));
    }
  }, [initialTabId, services]);

  const refreshCases = useCallback(async () => {
    if (!tabId || !access?.allowed) return;
    setLoadingCases(true);
    try {
      await selectionSave.current;
      const next = await services.getTestCases(tabId);
      setCatalog(next);
      setError("");
    } catch (cause) {
      setCatalog(undefined);
      setError(messageFrom(cause, "Could not read the visible test cases."));
    } finally {
      setLoadingCases(false);
    }
  }, [access?.allowed, services, tabId]);

  useEffect(() => {
    let active = true;
    void Promise.all([services.getAccess(), services.getStoredState(), services.getTabs()])
      .then(([nextAccess, stored, nextTabs]) => {
        if (!active) return;
        setAccess(nextAccess);
        setTabs(nextTabs);
        setTabId(
          initialTabId && nextTabs.some((tab) => tab.id === initialTabId)
            ? initialTabId
            : nextTabs[0]?.id,
        );
        setApiKey(stored.geminiApiKey || "");
        setSolutionNotes((stored.solutionNotes || "").slice(0, 4000));
        setMode(stored.executionMode || "assist");
        setSpeed(stored.typingSpeed || "realistic");
        // Older builds stored provider recitation blocks as generic runtime errors.
        const previousRecitation =
          !stored.isRunning &&
          /Gemini blocked the (?:response|prompt) \(RECITATION\)/.test(
            stored.lastError?.message || "",
          );
        setStatus(
          previousRecitation
            ? {
                stage: "needs_original_solution",
                message:
                  "Gemini withheld the previous response. Add your own algorithm steps in Your approach, then choose Request original solution. No blocked output will be inserted.",
              }
            : stored.solverStatus,
        );
        setRunning(Boolean(stored.isRunning));
        setConsentUserId(stored.codechumGeminiConsentUserId);
        if (
          stored.lastError?.message &&
          !previousRecitation &&
          stored.solverStatus?.stage !== "needs_original_solution"
        )
          setError(stored.lastError.message);
      })
      .catch((cause) => {
        if (!active) return;
        setAccess({ allowed: false, signedIn: false, reason: "Could not check CodeChum access." });
        setError(messageFrom(cause, "Could not initialize CodeChum."));
      });
    const unsubscribe = services.subscribe((update: Partial<CodeChumStoredState>) => {
      if (update.solverStatus !== undefined) {
        setStatus(update.solverStatus);
        if (update.solverStatus.stage === "needs_original_solution") {
          setError("");
          setNotice("");
        }
      }
      if (update.isRunning !== undefined) setRunning(Boolean(update.isRunning));
      if (update.lastError?.message) setError(update.lastError.message);
      if (update.typingSpeed) setSpeed(update.typingSpeed);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [initialTabId, services]);

  useEffect(() => {
    if (!tabId || !access?.allowed) return;
    void refreshCases();
    void services
      .getStatus(tabId)
      .then((next) => setRunning(next.isRunning))
      .catch(() => undefined);
  }, [access?.allowed, refreshCases, services, tabId]);

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await services.signIn(email, password);
      setPassword("");
      const nextAccess = await services.getAccess();
      setAccess(nextAccess);
      const stored = await services.getStoredState();
      setApiKey(stored.geminiApiKey || "");
      setSolutionNotes((stored.solutionNotes || "").slice(0, 4000));
      setConsentUserId(stored.codechumGeminiConsentUserId);
      setConsentChecked(false);
      if (!nextAccess.allowed)
        setError(nextAccess.reason || "This account has no CodeChum access.");
    } catch (cause) {
      setError(messageFrom(cause, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await services.signOut();
      setAccess({ allowed: false, signedIn: false, reason: "Sign in to use CodeChum." });
      setApiKey("");
      setSolutionNotes("");
      setStatus(undefined);
      setError("");
      setCatalog(undefined);
      setConsentUserId(undefined);
      setConsentChecked(false);
      setNotice("Signed out of CodeChum.");
    } catch (cause) {
      setError(messageFrom(cause, "Could not sign out."));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await services.updatePassword(
        String(data.get("currentPassword") || ""),
        String(data.get("newPassword") || ""),
      );
      form.reset();
      setNotice("Password updated.");
    } catch (cause) {
      setError(messageFrom(cause, "Could not update the password."));
    } finally {
      setBusy(false);
    }
  }

  async function chooseCases(numbers: number[]) {
    if (!catalog || !numbers.length) {
      setError("Select at least one test case.");
      return;
    }
    const before = catalog.selected;
    setCatalog({ ...catalog, selected: numbers });
    setError("");
    selectionSave.current = selectionSave.current.then(() =>
      services.saveSelection(catalog.key, numbers),
    );
    try {
      await selectionSave.current;
    } catch (cause) {
      setCatalog((current) =>
        current?.key === catalog.key ? { ...current, selected: before } : current,
      );
      setError(messageFrom(cause, "Could not save test selection."));
      selectionSave.current = Promise.resolve();
    }
  }

  async function start() {
    if (!tabId || !access?.allowed || busy || (!consented && !consentChecked)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await selectionSave.current;
      await services.saveSettings({
        geminiApiKey: apiKey.trim(),
        solutionNotes: solutionNotes.trim().slice(0, 4000),
        executionMode: mode,
        typingSpeed: speed,
      });
      if (!consented && access.userId) {
        await services.setConsent(access.userId);
        setConsentUserId(access.userId);
      }
      await services.start(tabId);
      setRunning(true);
      setNotice(
        "CodeChum started. Follow the status below; run Check code in CodeChum when prompted.",
      );
    } catch (cause) {
      setError(messageFrom(cause, "Could not start CodeChum."));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!tabId || busy) return;
    setBusy(true);
    setError("");
    try {
      await services.stop(tabId);
      setRunning(false);
      setNotice("CodeChum stopped.");
    } catch (cause) {
      setError(messageFrom(cause, "Could not stop CodeChum."));
    } finally {
      setBusy(false);
    }
  }

  async function revokeConsent() {
    setBusy(true);
    try {
      await services.setConsent(undefined);
      setConsentUserId(undefined);
      setConsentChecked(false);
      if (running && tabId) {
        try {
          await services.stop(tabId);
          setRunning(false);
        } catch (cause) {
          setError(
            messageFrom(cause, "Consent was revoked, but the current run could not be stopped."),
          );
        }
      }
      setNotice("Gemini consent revoked. Start is disabled until you agree again.");
    } catch (cause) {
      setError(messageFrom(cause, "Could not revoke consent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="codechum-page">
      <header className="codechum-header">
        <div>
          <p className="codechum-eyebrow">GoPaste / CodeChum</p>
          <h1>CodeChum assistant</h1>
          <p>Review a CodeChum challenge, prepare a solution, and check it in CodeChum.</p>
        </div>
        {access?.signedIn ? (
          <div className="codechum-account">
            <span>{access.email}</span>
            <button type="button" onClick={() => void signOut()} disabled={busy}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <div className="codechum-notices" aria-live="polite">
        {error ? (
          <p className="codechum-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="codechum-notice" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      {!access ? (
        <p role="status">Checking CodeChum access…</p>
      ) : !access.allowed ? (
        <section className="codechum-panel codechum-auth" aria-labelledby="sign-in-title">
          <p className="codechum-eyebrow">Member access</p>
          <h2 id="sign-in-title">Sign in to CodeChum</h2>
          <p>
            Your email and password are sent to Supabase for authentication. GoPaste images stay in
            your local library and are not part of CodeChum requests.
          </p>
          {access.reason ? <p className="codechum-access-reason">{access.reason}</p> : null}
          <form onSubmit={(event) => void submitSignIn(event)}>
            <label htmlFor="codechum-email">Email</label>
            <input
              id="codechum-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="codechum-password">Password</label>
            <input
              id="codechum-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="codechum-primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      ) : (
        <div className="codechum-workspace">
          <section className="codechum-panel" aria-labelledby="challenge-title">
            <div className="codechum-section-heading">
              <div>
                <p className="codechum-eyebrow">01 / Challenge</p>
                <h2 id="challenge-title">CodeChum tab</h2>
              </div>
              <button type="button" onClick={() => void refreshTabs()}>
                Refresh tabs
              </button>
            </div>
            {tabs.length ? (
              <label className="codechum-field" htmlFor="codechum-tab">
                <span>Choose a problem tab</span>
                <select
                  id="codechum-tab"
                  value={tabId || ""}
                  onChange={(event) => {
                    setCatalog(undefined);
                    setTabId(Number(event.target.value));
                  }}
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="codechum-empty">
                Open a CodeChum problem tab, then choose Refresh tabs. CodeChum works only on
                CodeChum challenge pages.
              </p>
            )}
          </section>

          <section className="codechum-panel" aria-labelledby="tests-title">
            <div className="codechum-section-heading">
              <div>
                <p className="codechum-eyebrow">02 / Review</p>
                <h2 id="tests-title">Visible test cases</h2>
              </div>
              <button
                type="button"
                onClick={() => void refreshCases()}
                disabled={!tabId || loadingCases}
              >
                {loadingCases ? "Reading…" : "Refresh cases"}
              </button>
            </div>
            {catalog ? (
              <>
                <p className="codechum-challenge-name">{catalog.title}</p>
                {catalog.requirements ? (
                  <details className="codechum-requirements">
                    <summary>Minimum requirements</summary>
                    <pre>{catalog.requirements}</pre>
                  </details>
                ) : null}
                {catalog.cases.length ? (
                  <>
                    <div className="codechum-test-actions">
                      <span>
                        {catalog.selected.length} of {catalog.cases.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => void chooseCases(catalog.cases.map((item) => item.number))}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        disabled={!catalog.cases.some((item) => item.status === "failed")}
                        onClick={() =>
                          void chooseCases(
                            catalog.cases
                              .filter((item) => item.status === "failed")
                              .map((item) => item.number),
                          )
                        }
                      >
                        Only failed
                      </button>
                    </div>
                    <div className="codechum-tests">
                      {catalog.cases.map((item) => (
                        <label className="codechum-test" key={item.number}>
                          <input
                            type="checkbox"
                            checked={catalog.selected.includes(item.number)}
                            onChange={() => {
                              const next = catalog.selected.includes(item.number)
                                ? catalog.selected.filter((number) => number !== item.number)
                                : [...catalog.selected, item.number];
                              void chooseCases(next);
                            }}
                          />
                          <span>
                            <strong>Test case {item.number}</strong>
                            <small>{item.status === "unchecked" ? "Not run" : item.status}</small>
                            <span>
                              {item.description || item.expectedPreview || "No description shown"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>
                    No complete visible cases found. Review the problem description and check your
                    work manually.
                  </p>
                )}
              </>
            ) : (
              <p>
                {tabId
                  ? "Select Refresh cases to read the current challenge."
                  : "Choose a CodeChum tab first."}
              </p>
            )}
          </section>

          <section className="codechum-panel" aria-labelledby="settings-title">
            <p className="codechum-eyebrow">03 / Settings</p>
            <h2 id="settings-title">Prepare a run</h2>
            <div className="codechum-settings">
              <label className="codechum-field" htmlFor="gemini-key">
                <span>Gemini API key</span>
                <input
                  id="gemini-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  onBlur={() =>
                    void services
                      .saveSettings({ geminiApiKey: apiKey.trim() })
                      .catch((cause) => setError(messageFrom(cause, "Could not save the API key.")))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? "Hide key" : "Show key"}
              </button>
              <label className="codechum-field" htmlFor="codechum-mode">
                <span>Execution mode</span>
                <select
                  id="codechum-mode"
                  value={mode}
                  onChange={(event) => {
                    const value = event.target.value as "assist" | "autopilot";
                    setMode(value);
                    void services
                      .saveSettings({ executionMode: value })
                      .catch((cause) => setError(messageFrom(cause, "Could not save the mode.")));
                  }}
                >
                  <option value="assist">Assist</option>
                  <option value="autopilot">Auto pilot</option>
                </select>
              </label>
              <label className="codechum-field" htmlFor="codechum-speed">
                <span>Typing speed</span>
                <select
                  id="codechum-speed"
                  value={speed}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSpeed(value);
                    if (tabId)
                      void services
                        .setTypingSpeed(tabId, value)
                        .catch((cause) =>
                          setError(messageFrom(cause, "Could not change typing speed.")),
                        );
                    else
                      void services
                        .saveSettings({ typingSpeed: value })
                        .catch((cause) =>
                          setError(messageFrom(cause, "Could not save typing speed.")),
                        );
                  }}
                >
                  {SPEEDS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="codechum-field codechum-notes" htmlFor="codechum-notes">
              <span>Your approach (optional)</span>
              <textarea
                id="codechum-notes"
                aria-label="Your approach (optional)"
                aria-describedby="codechum-notes-help"
                maxLength={4000}
                value={solutionNotes}
                placeholder="Describe your own algorithm steps or implementation choices."
                onChange={(event) => setSolutionNotes(event.target.value)}
                onBlur={() =>
                  void services
                    .saveSettings({ solutionNotes: solutionNotes.trim().slice(0, 4000) })
                    .catch((cause) => setError(messageFrom(cause, "Could not save your approach.")))
                }
              />
              <small id="codechum-notes-help">
                Saved on this device. Included in Gemini requests when you start.
              </small>
            </label>

            <div className="codechum-disclosure">
              <h3>Before you start</h3>
              <p>
                When you press Start, CodeChum reads the selected CodeChum challenge text, visible
                test cases, and Check code feedback, then sends those details to Google Gemini using
                your API key. Candidate code and your implementation notes are included when
                relevant. Your GoPaste image library is never included.
              </p>
              {consented ? (
                <div className="codechum-consent-saved">
                  <span>Gemini processing is enabled for this account.</span>
                  <button type="button" onClick={() => void revokeConsent()} disabled={busy}>
                    Revoke consent
                  </button>
                </div>
              ) : (
                <label className="codechum-consent">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(event) => setConsentChecked(event.target.checked)}
                  />
                  <span>
                    I agree to send this CodeChum challenge and check feedback to Google Gemini when
                    I start the solver, including candidate code and my implementation notes when
                    relevant.
                  </span>
                </label>
              )}
            </div>
            <div className="codechum-controls">
              <button
                className="codechum-primary"
                type="button"
                onClick={() => void start()}
                disabled={
                  !tabId ||
                  !apiKey.trim() ||
                  !access.userId ||
                  (!consented && !consentChecked) ||
                  busy ||
                  running
                }
              >
                {busy
                  ? "Working…"
                  : status?.stage === "needs_original_solution"
                    ? "Request original solution"
                    : "Start / resume"}
              </button>
              <button
                type="button"
                onClick={() => void stop()}
                disabled={!tabId || busy || !running}
              >
                Stop
              </button>
            </div>
            <p className="codechum-footnote">
              Run CodeChum’s Check code yourself when prompted. Keep its result open, then press
              Start / resume to review the feedback.
            </p>
          </section>

          <section className="codechum-panel codechum-status" aria-labelledby="status-title">
            <p className="codechum-eyebrow">04 / Activity</p>
            <h2 id="status-title">{statusLabel(status)}</h2>
            <p role="status">
              {status?.message || (running ? "CodeChum is running." : "Ready when you are.")}
            </p>
            {status?.attempt ? (
              <small>
                Candidate {status.attempt} of {status.totalAttempts || "?"}
              </small>
            ) : null}
            {status?.warning ? <small>{status.warning}</small> : null}
          </section>

          <details className="codechum-panel codechum-password">
            <summary>Change account password</summary>
            <form onSubmit={(event) => void changePassword(event)}>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <button type="submit" disabled={busy}>
                Update password
              </button>
            </form>
          </details>
        </div>
      )}

      <section
        className="codechum-panel codechum-shortcuts"
        aria-labelledby="codechum-shortcuts-title"
      >
        <div className="codechum-section-heading">
          <div>
            <p className="codechum-eyebrow">Quick controls</p>
            <h2 id="codechum-shortcuts-title">Keyboard shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={() =>
              void services
                .openShortcutSettings()
                .catch((cause) => setError(messageFrom(cause, "Could not open Chrome shortcuts.")))
            }
          >
            Configure ↗
          </button>
        </div>
        <p>
          Use these on an active CodeChum tab. Start still requires sign-in, a Gemini key, and
          consent.
        </p>
        <dl>
          {CODECHUM_SHORTCUTS.map(({ name, label }) => {
            const shortcut = shortcuts?.find((item) => item.name === name)?.shortcut;
            return (
              <div key={name}>
                <dt>{label}</dt>
                <dd>
                  {shortcut ? (
                    <kbd>{shortcut}</kbd>
                  ) : (
                    <span>
                      {shortcutsUnavailable
                        ? "Unavailable"
                        : shortcuts
                          ? "Not assigned"
                          : "Checking…"}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </main>
  );
}
