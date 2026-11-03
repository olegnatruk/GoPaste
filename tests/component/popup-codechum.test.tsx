import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PopupApp } from "../../src/popup/PopupApp";
import type { CodeChumServices } from "../../src/codechum/ui/services";

function codeChumServices(overrides: Partial<CodeChumServices> = {}): CodeChumServices {
  return {
    getAccess: vi.fn().mockResolvedValue({ allowed: false, signedIn: false, reason: "Sign in." }),
    signIn: vi.fn(),
    signOut: vi.fn(),
    updatePassword: vi.fn(),
    getTabs: vi.fn().mockResolvedValue([{ id: 42, title: "CodeChum challenge" }]),
    getShortcuts: vi.fn().mockResolvedValue([{ name: "start-script", shortcut: "Alt+Shift+S" }]),
    openShortcutSettings: vi.fn(),
    getStoredState: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn(),
    setConsent: vi.fn(),
    saveSelection: vi.fn(),
    getTestCases: vi.fn(),
    getStatus: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    setTypingSpeed: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe("combined extension popup", () => {
  it("opens CodeChum controls in the popup and returns to the GoPaste library", async () => {
    const openPage = vi.fn();
    render(
      <PopupApp
        library={{
          list: vi.fn().mockResolvedValue({ items: [] }),
          listCategories: vi.fn().mockResolvedValue([]),
        }}
        codeChumServices={codeChumServices()}
        getActiveCodeChumTabId={vi.fn().mockResolvedValue(42)}
        openCodeChumPage={openPage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "CodeChum" }));
    expect(await screen.findByRole("heading", { name: "Sign in to CodeChum" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open full page ↗" }));
    expect(openPage).toHaveBeenCalledWith(42);
    fireEvent.click(screen.getByRole("button", { name: "← GoPaste library" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "GoPaste" })).toBeInTheDocument(),
    );
  });

  it("opens the full page on the tab selected inside the popup", async () => {
    const openPage = vi.fn();
    render(
      <PopupApp
        library={{
          list: vi.fn().mockResolvedValue({ items: [] }),
          listCategories: vi.fn().mockResolvedValue([]),
        }}
        codeChumServices={codeChumServices({
          getAccess: vi
            .fn()
            .mockResolvedValue({ allowed: true, signedIn: true, userId: "member-1" }),
          getTabs: vi.fn().mockResolvedValue([
            { id: 42, title: "First challenge" },
            { id: 43, title: "Second challenge" },
          ]),
          getTestCases: vi.fn(async (tabId: number) => ({
            key: `problem-${tabId}`,
            title: tabId === 43 ? "Second challenge" : "First challenge",
            selected: [1],
            cases: [{ number: 1, status: "unchecked" as const }],
          })),
          getStatus: vi.fn().mockResolvedValue({ isRunning: false }),
        })}
        getActiveCodeChumTabId={vi.fn().mockResolvedValue(42)}
        openCodeChumPage={openPage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "CodeChum" }));
    const tab = await screen.findByLabelText("Choose a problem tab");
    fireEvent.change(tab, { target: { value: "43" } });
    await screen.findByText("Second challenge", { selector: ".codechum-challenge-name" });
    fireEvent.click(screen.getByRole("button", { name: "Open full page ↗" }));
    expect(openPage).toHaveBeenCalledWith(43);
  });
});
