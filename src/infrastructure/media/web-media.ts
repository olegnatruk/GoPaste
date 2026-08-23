import { ApplicationError } from "../../core/domain/errors";
import { LIMITS } from "../../core/domain/limits";
import type { ContentHasher, MediaFetcher, MediaFetchResult } from "../../core/ports/platform";
import { readBlobArrayBuffer } from "./validation";

const IMAGE_ACCEPT_HEADER = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8";

function httpFailure(status: number): ApplicationError {
  if (status === 401 || status === 403) {
    return new ApplicationError(
      "FETCH_FAILED",
      `The image server denied access (HTTP ${status}). Open the image in its own tab and try again.`,
      { status },
    );
  }
  if (status === 404 || status === 410) {
    return new ApplicationError(
      "FETCH_FAILED",
      `The selected image is no longer available (HTTP ${status}).`,
      { status },
    );
  }
  return new ApplicationError(
    "FETCH_FAILED",
    `The image server returned HTTP ${status}. Try opening the image in its own tab first.`,
    { status },
  );
}

function networkFailure(error: unknown): ApplicationError {
  return new ApplicationError(
    "FETCH_FAILED",
    "Chrome could not reach the selected image. In GoPaste's extension details, set Site access to On all sites, then try again.",
    undefined,
    { cause: error },
  );
}

export class WebContentHasher implements ContentHasher {
  async sha256(blob: Blob): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await readBlobArrayBuffer(blob));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

export class WebMediaFetcher implements MediaFetcher {
  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async fetch(url: string): Promise<MediaFetchResult> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw networkFailure(error);
    }

    if (!["http:", "https:", "data:", "blob:"].includes(parsedUrl.protocol)) {
      throw new ApplicationError(
        "FETCH_FAILED",
        `GoPaste cannot capture images from ${parsedUrl.protocol} URLs.`,
      );
    }

    const request = (credentials: RequestCredentials) =>
      this.fetchImplementation(url, {
        cache: "no-store",
        credentials,
        headers: { Accept: IMAGE_ACCEPT_HEADER },
      });

    let response: Response;
    try {
      response = await request("omit");
    } catch (error) {
      throw networkFailure(error);
    }

    if ((response.status === 401 || response.status === 403) && parsedUrl.protocol !== "data:") {
      try {
        response = await request("include");
      } catch {
        // Keep the original access-denied response so the user gets an actionable status.
      }
    }

    if (!response.ok) throw httpFailure(response.status);

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > LIMITS.maxMediaBytes) {
      throw new ApplicationError("ITEM_TOO_LARGE", "The image exceeds the 25 MiB item limit.", {
        maxBytes: LIMITS.maxMediaBytes,
        actualBytes: declaredSize,
      });
    }

    try {
      return {
        blob: await response.blob(),
        declaredMimeType: response.headers.get("content-type")?.split(";", 1)[0]?.trim(),
      };
    } catch (error) {
      throw new ApplicationError(
        "FETCH_FAILED",
        "Chrome reached the image server but could not read the response.",
        undefined,
        { cause: error },
      );
    }
  }
}
