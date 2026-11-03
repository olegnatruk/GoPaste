import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeChumPage } from "../../src/codechum/ui/CodeChumPage";
import type { CodeChumServices, CodeChumStoredState } from "../../src/codechum/ui/services";

function services(overrides: Partial<CodeChumServices> = {}): CodeChumServices {
  return {
    getAccess: vi.fn().mockResolvedValue({
      allowed: true,
      signedIn: true,
      userId: "member-1",
      email: "member@example.com",
    }),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    getTabs: vi.fn().mockResolvedValue([{ id: 42, title: "CodeChum problem" }]),
    getShortcuts: vi.fn().mockResolvedValue([
      { name: "start-script", shortcut: "Alt+Shift+S" },
      { name: "stop-script", shortcut: "Alt+Shift+X" },
      { name: "speed-up", shortcut: "" },
      { name: "speed-down", shortcut: "" },
    ]),
    openShortcutSettings: vi.fn().mockResolvedValue(undefined),
    getStoredState: vi.fn().mockResolvedValue({ geminiApiKey: "test-key" }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    setConsent: vi.fn().mockResolvedValue(undefined),
    saveSelection: vi.fn().mockResolvedValue(undefined),
    getTestCases: vi.fn().mockResolvedValue({
      key: "problem-1",
      title: "A challenge",
      selected: [1],
      cases: [{ number: 1, description: "Sample", status: "unchecked" }],
    }),
    getStatus: vi.fn().mockResolvedValue({ isRunning: false }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    setTypingSpeed: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe("CodeChumPage", () => {
  it("shows actual Chrome shortcut assignments and opens the shortcut settings", async () => {
    const api = services();
    render(<CodeChumPage services={api} initialTabId={42} />);

    expect(await screen.findByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(await screen.findByText("Alt+Shift+S")).toBeInTheDocument();
    expect(screen.getByText("Alt+Shift+X")).toBeInTheDocument();
    expect(screen.getAllByText("Not assigned")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Configure ↗" }));
    expect(api.openShortcutSettings).toHaveBeenCalledOnce();
  });

  it("requires account-scoped Gemini consent before starting and allows revocation", async () => {
    const api = services();
    render(<CodeChumPage services={api} initialTabId={42} />);

    expect(await screen.findByText("A challenge")).toBeInTheDocument();
    expect(
      screen.getByText(/challenge text, visible test cases, and Check code feedback/),
    ).toBeInTheDocument();
    const start = screen.getByRole("button", { name: "Start / resume" });
    expect(start).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /I agree to send this CodeChum challenge/ }),
    );
    expect(start).toBeEnabled();
    fireEvent.click(start);
    await waitFor(() => expect(api.setConsent).toHaveBeenCalledWith("member-1"));
    expect(api.start).toHaveBeenCalledWith(42);

    fireEvent.click(screen.getByRole("button", { name: "Revoke consent" }));
    await waitFor(() => expect(api.setConsent).toHaveBeenCalledWith(undefined));
  });

  it("shows Supabase sign-in disclosure and a clear missing-tab state", async () => {
    const api = services({
      getAccess: vi.fn().mockResolvedValue({
        allowed: false,
        signedIn: false,
        reason: "Sign in to use CodeChum.",
      }),
      getTabs: vi.fn().mockResolvedValue([]),
    });
    const view = render(<CodeChumPage services={api} />);
    expect(await screen.findByRole("heading", { name: "Sign in to CodeChum" })).toBeInTheDocument();
    expect(screen.getByText(/email and password are sent to Supabase/)).toBeInTheDocument();
    view.unmount();

    render(<CodeChumPage services={services({ getTabs: vi.fn().mockResolvedValue([]) })} />);
    expect(await screen.findByText(/Open a CodeChum problem tab/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start / resume" })).toBeDisabled();
  });

  it("loads saved approach notes and saves edits locally on blur", async () => {
    const api = services({
      getStoredState: vi.fn().mockResolvedValue({ solutionNotes: "Use a running total." }),
    });
    render(<CodeChumPage services={api} initialTabId={42} />);

    const notes = await screen.findByRole("textbox", { name: "Your approach (optional)" });
    expect(notes).toHaveValue("Use a running total.");
    expect(notes).toHaveAttribute("maxlength", "4000");
    fireEvent.change(notes, { target: { value: "Read each value and accumulate its sum." } });
    fireEvent.blur(notes);

    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        solutionNotes: "Read each value and accumulate its sum.",
      }),
    );
    expect(api.start).not.toHaveBeenCalled();
  });

  it("saves the current approach before an explicit Start action", async () => {
    const api = services({
      getStoredState: vi
        .fn()
        .mockResolvedValue({ geminiApiKey: "test-key", codechumGeminiConsentUserId: "member-1" }),
    });
    render(<CodeChumPage services={api} initialTabId={42} />);

    const notes = await screen.findByRole("textbox", { name: "Your approach (optional)" });
    fireEvent.change(notes, { target: { value: "Use a loop instead of recursion." } });
    fireEvent.click(screen.getByRole("button", { name: "Start / resume" }));

    await waitFor(() => expect(api.start).toHaveBeenCalledWith(42));
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ solutionNotes: "Use a loop instead of recursion." }),
    );
    expect(vi.mocked(api.saveSettings).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.start).mock.invocationCallOrder[0]!,
    );
  });

  it("offers a manual original-solution request after recitation without a runtime error alert", async () => {
    const api = services({
      getStoredState: vi.fn().mockResolvedValue({
        geminiApiKey: "test-key",
        codechumGeminiConsentUserId: "member-1",
        isRunning: false,
        solverStatus: {
          stage: "needs_original_solution",
          message: "Add your approach and request a new original solution.",
        },
      }),
    });
    render(<CodeChumPage services={api} initialTabId={42} />);

    expect(await screen.findByText("Original solution needed")).toBeInTheDocument();
    const restart = screen.getByRole("button", { name: "Request original solution" });
    expect(restart).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.start).not.toHaveBeenCalled();
    fireEvent.click(restart);
    await waitFor(() => expect(api.start).toHaveBeenCalledWith(42));
  });

  it("replaces a stale error with the live original-solution recovery state", async () => {
    let publish: ((update: Partial<CodeChumStoredState>) => void) | undefined;
    const api = services({
      subscribe: vi.fn((listener) => {
        publish = listener;
        return () => undefined;
      }),
    });
    render(<CodeChumPage services={api} initialTabId={42} />);
    expect(await screen.findByText("A challenge")).toBeInTheDocument();
    act(() => publish?.({ lastError: { message: "A previous request failed." } }));
    expect(screen.getByRole("alert")).toHaveTextContent("A previous request failed.");

    act(() =>
      publish?.({
        isRunning: false,
        solverStatus: {
          stage: "needs_original_solution",
          message: "Please add your own approach.",
        },
      }),
    );

    expect(screen.getByText("Original solution needed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request original solution" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.start).not.toHaveBeenCalled();
  });

  it("turns a saved legacy recitation error into the original-solution recovery state", async () => {
    const api = services({
      getStoredState: vi.fn().mockResolvedValue({
        geminiApiKey: "test-key",
        isRunning: false,
        solverStatus: { stage: "error" },
        lastError: { message: "gemini-3-flash-preview: Gemini blocked the response (RECITATION)." },
      }),
    });
    render(<CodeChumPage services={api} initialTabId={42} />);

    expect(await screen.findByText("Original solution needed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request original solution" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.start).not.toHaveBeenCalled();
  });
});
