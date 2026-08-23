import { ApplicationError } from "../../core/domain/errors";
import { LIMITS } from "../../core/domain/limits";
import type { MediaFetchContext, MediaFetcher, MediaFetchResult } from "../../core/ports/platform";
import { extractMediaFromMhtml } from "./mhtml-media";

interface PageInspectionResult {
  candidateUrls: string[];
  renderedDataUrl?: string;
  reason: string;
}

interface ExecuteScriptResult {
  result?: PageInspectionResult;
}

export interface PageScriptApi {
  executeScript(
    injection: chrome.scripting.ScriptInjection<
      [string, number, number],
      Promise<PageInspectionResult>
    >,
  ): Promise<ExecuteScriptResult[]>;
}

export interface PageCaptureApi {
  saveAsMHTML(details: chrome.pageCapture.SaveDetails): Promise<Blob | undefined>;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function canUsePageFallback(
  url: string,
  context?: MediaFetchContext,
): context is MediaFetchContext & { tabId: number } {
  if (context?.tabId === undefined) return false;
  try {
    return ["http:", "https:", "data:", "blob:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export class ChromePageMediaFetcher implements MediaFetcher {
  constructor(
    private readonly primary: MediaFetcher,
    private readonly scripting: PageScriptApi,
    private readonly pageCapture?: PageCaptureApi,
  ) {}

  async fetch(url: string, context?: MediaFetchContext): Promise<MediaFetchResult> {
    try {
      return await this.primary.fetch(url, context);
    } catch (primaryError) {
      if (
        !(primaryError instanceof ApplicationError) ||
        primaryError.code !== "FETCH_FAILED" ||
        !canUsePageFallback(url, context)
      ) {
        throw primaryError;
      }

      try {
        const results = await this.scripting.executeScript({
          target: {
            tabId: context.tabId,
            ...(context.frameId !== undefined ? { frameIds: [context.frameId] } : {}),
          },
          world: "MAIN",
          args: [url, LIMITS.maxMediaBytes, 16_000_000],
          func: async (
            sourceUrl: string,
            maxBytes: number,
            maxPixels: number,
          ): Promise<PageInspectionResult> => {
            const absolute = (value: string | null): string | undefined => {
              if (!value) return undefined;
              try {
                return new URL(value, document.baseURI).href;
              } catch {
                return undefined;
              }
            };
            const selected = Array.from(document.images).find((image) =>
              [image.currentSrc, image.src, image.getAttribute("src")]
                .map(absolute)
                .filter(Boolean)
                .includes(sourceUrl),
            );
            if (!selected) {
              return { candidateUrls: [], reason: "The clicked image element was not found." };
            }

            const candidates = new Set<string>();
            const add = (value: string | null) => {
              const resolved = absolute(value);
              if (resolved) candidates.add(resolved);
            };
            add(selected.currentSrc);
            add(selected.src);
            for (const attribute of [
              "data-src",
              "data-original",
              "data-lazy-src",
              "data-full-src",
              "data-image",
            ]) {
              add(selected.getAttribute(attribute));
            }
            if (selected.srcset && !selected.srcset.trimStart().startsWith("data:")) {
              for (const part of selected.srcset.split(",")) add(part.trim().split(/\s+/, 1)[0]);
            }

            let renderedDataUrl: string | undefined;
            let reason = "The image sources could not be fetched.";
            try {
              const width = selected.naturalWidth;
              const height = selected.naturalHeight;
              if (!selected.complete || width < 1 || height < 1) {
                reason = "The clicked image had not finished rendering.";
              } else if (width * height > maxPixels) {
                reason = "The rendered image is too large for the pixel fallback.";
              } else {
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context2d = canvas.getContext("2d");
                if (!context2d) throw new Error("Canvas is unavailable.");
                context2d.drawImage(selected, 0, 0);
                const renderedBlob = await new Promise<Blob | null>((resolve) =>
                  canvas.toBlob(resolve, "image/png"),
                );
                if (!renderedBlob) throw new Error("Canvas export returned no data.");
                if (renderedBlob.size > maxBytes) {
                  reason = "The rendered image exceeds the 25 MiB item limit.";
                } else {
                  renderedDataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
                    reader.readAsDataURL(renderedBlob);
                  });
                }
              }
            } catch (error) {
              reason = error instanceof Error ? error.message : "Rendered image export failed.";
            }

            return {
              candidateUrls: [...candidates],
              ...(renderedDataUrl ? { renderedDataUrl } : {}),
              reason,
            };
          },
        });
        const inspection = results[0]?.result;
        if (!inspection) throw new Error("The page returned no image data.");

        for (const candidate of inspection.candidateUrls) {
          if (candidate === url) continue;
          try {
            return await this.primary.fetch(candidate, context);
          } catch {
            // Continue through original/lazy-load candidates before using rendered pixels.
          }
        }

        if (this.pageCapture) {
          const snapshot = await this.pageCapture.saveAsMHTML({ tabId: context.tabId });
          if (snapshot) {
            const captured = await extractMediaFromMhtml(snapshot, [
              url,
              ...inspection.candidateUrls,
            ]);
            if (captured) return captured;
          }
        }

        if (inspection.renderedDataUrl) {
          return {
            blob: await dataUrlToBlob(inspection.renderedDataUrl),
            declaredMimeType: "image/png",
          };
        }
        throw new Error(inspection.reason);
      } catch (fallbackError) {
        if (fallbackError instanceof ApplicationError) throw fallbackError;
        const reason =
          fallbackError instanceof Error ? fallbackError.message : "Unknown page error";
        throw new ApplicationError(
          "FETCH_FAILED",
          `The page could not export this image (${reason}). Open the original image in a new tab and try again.`,
          { reason: reason.slice(0, 300) },
          { cause: fallbackError },
        );
      }
    }
  }
}
