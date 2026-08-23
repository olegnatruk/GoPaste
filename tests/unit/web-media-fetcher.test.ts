import { LIMITS } from "../../src/core/domain/limits";
import { WebMediaFetcher } from "../../src/infrastructure/media/web-media";

function imageResponse(status = 200, headers?: HeadersInit): Response {
  return new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), {
    status,
    headers,
  });
}

describe("WebMediaFetcher", () => {
  it("fetches public images without credentials and sends an image accept header", async () => {
    const fetchImplementation = vi.fn(async () =>
      imageResponse(200, { "content-type": "image/gif; charset=binary" }),
    );
    const result = await new WebMediaFetcher(fetchImplementation as typeof fetch).fetch(
      "https://images.test/example.gif",
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://images.test/example.gif",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: expect.stringContaining("image/*") },
      }),
    );
    expect(result.declaredMimeType).toBe("image/gif");
    expect(result.blob.size).toBe(6);
  });

  it("retries access-denied images with the user's browser credentials", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(imageResponse(403))
      .mockResolvedValueOnce(imageResponse());

    await expect(
      new WebMediaFetcher(fetchImplementation as typeof fetch).fetch(
        "https://private-images.test/example.gif",
      ),
    ).resolves.toMatchObject({ blob: expect.any(Blob) });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "https://private-images.test/example.gif",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports a denied response with an actionable HTTP status", async () => {
    const fetchImplementation = vi.fn(async () => imageResponse(403));
    await expect(
      new WebMediaFetcher(fetchImplementation as typeof fetch).fetch(
        "https://images.test/example.gif",
      ),
    ).rejects.toMatchObject({
      code: "FETCH_FAILED",
      message: expect.stringContaining("HTTP 403"),
      details: { status: 403 },
    });
  });

  it("reports network and site-access failures separately from HTTP responses", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      new WebMediaFetcher(fetchImplementation as typeof fetch).fetch(
        "https://images.test/example.gif",
      ),
    ).rejects.toMatchObject({
      code: "FETCH_FAILED",
      message: expect.stringContaining("Site access"),
    });
  });

  it("rejects declared oversized responses before reading their body", async () => {
    const fetchImplementation = vi.fn(async () =>
      imageResponse(200, { "content-length": String(LIMITS.maxMediaBytes + 1) }),
    );
    await expect(
      new WebMediaFetcher(fetchImplementation as typeof fetch).fetch(
        "https://images.test/large.gif",
      ),
    ).rejects.toMatchObject({ code: "ITEM_TOO_LARGE" });
  });
});
