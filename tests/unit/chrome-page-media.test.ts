import { ApplicationError } from "../../src/core/domain/errors";
import { ChromePageMediaFetcher } from "../../src/infrastructure/media/chrome-page-media";

const fetchFailure = () => new ApplicationError("FETCH_FAILED", "Network failure");

describe("ChromePageMediaFetcher", () => {
  it("returns the direct-fetch result without inspecting the page", async () => {
    const blob = new Blob(["direct"], { type: "image/gif" });
    const primary = { fetch: vi.fn(async () => ({ blob })) };
    const scripting = { executeScript: vi.fn() };
    await expect(
      new ChromePageMediaFetcher(primary, scripting).fetch("https://test/a.gif", { tabId: 2 }),
    ).resolves.toEqual({ blob });
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("tries original and lazy-load DOM sources through the privileged fetcher", async () => {
    const blob = new Blob(["original"], { type: "image/gif" });
    const primary = {
      fetch: vi.fn().mockRejectedValueOnce(fetchFailure()).mockResolvedValueOnce({ blob }),
    };
    const scripting = {
      executeScript: vi.fn(async () => [
        {
          result: {
            candidateUrls: ["blob:https://page.test/generated", "https://cdn.test/original.gif"],
            reason: "Canvas was tainted.",
          },
        },
      ]),
    };
    await expect(
      new ChromePageMediaFetcher(primary, scripting).fetch("blob:https://page.test/generated", {
        tabId: 27,
        frameId: 9,
      }),
    ).resolves.toEqual({ blob });
    expect(primary.fetch).toHaveBeenLastCalledWith("https://cdn.test/original.gif", {
      tabId: 27,
      frameId: 9,
    });
  });

  it("uses already-rendered pixels when no source URL can be fetched", async () => {
    const primary = { fetch: vi.fn(async () => Promise.reject(fetchFailure())) };
    const scripting = {
      executeScript: vi.fn(async () => [
        {
          result: {
            candidateUrls: ["blob:https://page.test/generated"],
            renderedDataUrl: "data:image/png;base64,iVBORw0KGgo=",
            reason: "",
          },
        },
      ]),
    };
    const result = await new ChromePageMediaFetcher(primary, scripting).fetch(
      "blob:https://page.test/generated",
      { tabId: 27 },
    );
    expect(result.declaredMimeType).toBe("image/png");
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("preserves the primary error when no originating tab is available", async () => {
    const error = fetchFailure();
    const primary = { fetch: vi.fn(async () => Promise.reject(error)) };
    const scripting = { executeScript: vi.fn() };
    await expect(
      new ChromePageMediaFetcher(primary, scripting).fetch("blob:https://page.test/generated"),
    ).rejects.toBe(error);
  });

  it("surfaces the DOM/canvas reason when every recovery route fails", async () => {
    const primary = { fetch: vi.fn(async () => Promise.reject(fetchFailure())) };
    const scripting = {
      executeScript: vi.fn(async () => [
        { result: { candidateUrls: [], reason: "The clicked image element was not found." } },
      ]),
    };
    await expect(
      new ChromePageMediaFetcher(primary, scripting).fetch("blob:https://page.test/generated", {
        tabId: 27,
      }),
    ).rejects.toMatchObject({
      code: "FETCH_FAILED",
      details: { reason: "The clicked image element was not found." },
    });
  });
});
