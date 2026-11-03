import { describe, expect, it, vi } from "vitest";

import { GeminiBlockedResponseError, requestGeminiText } from "../../src/codechum/worker/gemini";

const apiKey = "test-secret-api-key";

function answer(text: string, finishReason = "STOP") {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function options(overrides: Partial<Parameters<typeof requestGeminiText>[0]> = {}) {
  return {
    apiKey,
    prompt: "Write a program that adds two numbers.",
    maxOutputTokens: 1024,
    assertConsent: vi.fn(async () => undefined),
    ...overrides,
  };
}

function requestedModel(fetcher: ReturnType<typeof vi.fn>, index: number) {
  const url = String(fetcher.mock.calls[index]?.[0]);
  return url.match(/models\/([^:]+):generateContent/)?.[1];
}

describe("CodeChum Gemini requests", () => {
  it("starts with Gemini 3 Flash and keeps the API key out of URLs and bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(answer("int main() {}")));
    const request = options();

    expect(await requestGeminiText(request, fetcher)).toBe("int main() {}");

    const [url, init] = fetcher.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    expect(requestedModel(fetcher, 0)).toBe("gemini-3-flash-preview");
    expect(headers.get("x-goog-api-key")).toBe(apiKey);
    expect(String(url)).not.toContain(apiKey);
    expect(String(init?.body)).not.toContain(apiKey);
    expect(body.generationConfig).not.toHaveProperty("temperature");
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
    expect(request.assertConsent).toHaveBeenCalledOnce();
  });

  it("returns only answer parts and never puts model thoughts into submitted code", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: "PRIVATE REASONING", thought: true },
                { text: "int main() {" },
                { text: " return 0; }" },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await requestGeminiText(options(), fetcher);
    expect(result).toContain("int main() {");
    expect(result).toContain("return 0; }");
    expect(result).not.toContain("PRIVATE REASONING");
  });

  it("asks for independently authored code without disabling provider safeguards", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(answer("original code")));

    await requestGeminiText(options(), fetcher);

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(
      body.systemInstruction.parts.map((part: { text: string }) => part.text).join(" "),
    ).toMatch(/independently|original/i);
    expect(body).not.toHaveProperty("safetySettings");
  });

  it.each([
    ["prompt", { promptFeedback: { blockReason: "SAFETY" } }],
    ["response", answer("NEVER RETURN BLOCKED TEXT", "SAFETY")],
  ])("preserves the typed reason and model of a blocked %s", async (kind, response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    const error = await requestGeminiText(options(), fetcher).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(GeminiBlockedResponseError);
    expect(error).toMatchObject({
      reason: "SAFETY",
      model: "gemini-3-flash-preview",
      target: kind,
    });
    expect(String(error)).not.toContain("NEVER RETURN BLOCKED TEXT");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("discards recitation text and stops without an automatic retry or model fallback", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(answer("NEVER RETURN RECITED CODE", "RECITATION")));
    const request = options({ repair: true });
    const error = await requestGeminiText(request, fetcher).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(GeminiBlockedResponseError);
    expect(error).toMatchObject({ reason: "RECITATION", model: "gemini-3-flash-preview" });
    expect(String(error)).not.toContain("NEVER RETURN RECITED CODE");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(request.assertConsent).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing model", () => jsonResponse({ error: { message: "Model is unavailable" } }, 404)],
    ["empty candidates", () => jsonResponse({ candidates: [] })],
    ["invalid JSON", () => new Response("not valid JSON", { status: 200 })],
    [
      "thought-only output",
      () =>
        jsonResponse({
          candidates: [
            { content: { parts: [{ text: "thinking", thought: true }] }, finishReason: "STOP" },
          ],
        }),
    ],
  ])("tries a usable fallback after %s", async (_reason, failedResponse) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(jsonResponse(answer("complete fallback code")));
    const request = options();

    expect(await requestGeminiText(request, fetcher)).toBe("complete fallback code");
    expect(requestedModel(fetcher, 1)).toBe("gemini-3.1-flash-lite");
    expect(request.assertConsent).toHaveBeenCalledTimes(2);
  });

  it("prioritizes the stronger repair fallback after Gemini 3 Flash", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ candidates: [] }))
      .mockResolvedValueOnce(jsonResponse(answer("repaired code")));

    expect(await requestGeminiText(options({ repair: true }), fetcher)).toBe("repaired code");
    expect(requestedModel(fetcher, 0)).toBe("gemini-3-flash-preview");
    expect(requestedModel(fetcher, 1)).toBe("gemini-3.8-flash");
  });

  it("explains each empty response instead of hiding the cause behind the old generic error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ candidates: [] }));
    const error = await requestGeminiText(options(), fetcher).catch((failure: unknown) => failure);
    const message = String(error);

    expect(message).toMatch(/gemini-3-flash-preview:.*no candidates/i);
    expect(message).toMatch(/gemini-3\.1-flash-lite:.*no candidates/i);
    expect(message).toMatch(/gemini-3\.8-flash:.*no candidates/i);
    expect(message).not.toContain("All Gemini models failed");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries a truncated answer on the same model with a larger token budget", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(answer("incomplete {", "MAX_TOKENS")))
      .mockResolvedValueOnce(jsonResponse(answer("complete {}")));
    const request = options();

    expect(await requestGeminiText(request, fetcher)).toBe("complete {}");
    expect(requestedModel(fetcher, 0)).toBe(requestedModel(fetcher, 1));
    const first = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const second = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(second.generationConfig.maxOutputTokens).toBeGreaterThan(
      first.generationConfig.maxOutputTokens,
    );
    expect(request.assertConsent).toHaveBeenCalledTimes(2);
  });

  it("reports token exhaustion rather than returning truncated code", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse(answer("NEVER SUBMIT THIS TRUNCATED CODE", "MAX_TOKENS")),
      );

    await expect(requestGeminiText(options(), fetcher)).rejects.toThrow(/token|truncat/i);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("preserves useful quota details when every model fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse(
        {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "Daily quota exceeded; retry after 40 seconds",
          },
        },
        429,
      ),
    );

    const error = await requestGeminiText(options(), fetcher).catch((failure: unknown) => failure);
    expect(String(error)).toMatch(/quota exceeded.*40 seconds/i);
    expect(String(error)).toContain("gemini-3-flash-preview");
    expect(String(error)).toContain("gemini-3.1-flash-lite");
    expect(String(error)).toContain("gemini-3.8-flash");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when the prompt is blocked", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ promptFeedback: { blockReason: "SAFETY" } }));

    await expect(requestGeminiText(options(), fetcher)).rejects.toThrow(/SAFETY|blocked/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([401, 403])(
    "does not retry other models after authentication HTTP %s",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ error: { message: "API key is not authorized" } }, status),
        );

      await expect(requestGeminiText(options(), fetcher)).rejects.toThrow(
        /authorized|auth|API key/i,
      );
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("stops on an authentication error even when the error body is not JSON", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("Unauthorized", { status: 401 }));

    await expect(requestGeminiText(options(), fetcher)).rejects.toThrow(/401|auth/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not send a request when the caller has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      requestGeminiText(options({ signal: controller.signal }), fetcher),
    ).rejects.toThrow(/abort|stopped/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops on caller abort during a request rather than falling back", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("The operation was aborted", "AbortError");
    });

    await expect(
      requestGeminiText(options({ signal: controller.signal }), fetcher),
    ).rejects.toThrow(/abort|stopped/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("aborts a timed-out request, uses a fallback, and cleans up timers and caller listeners", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      const request = options({ signal: controller.signal });
      let timedOutSignal: AbortSignal | null | undefined;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async (_url, init) => {
          timedOutSignal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("The operation was aborted", "AbortError"));
              },
              { once: true },
            );
          });
        })
        .mockResolvedValueOnce(jsonResponse(answer("fallback after timeout")));

      const response = requestGeminiText(request, fetcher);
      await Promise.resolve();
      expect(fetcher).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(90_000);

      expect(await response).toBe("fallback after timeout");
      expect(timedOutSignal?.aborted).toBe(true);
      expect(controller.signal.aborted).toBe(false);
      expect(requestedModel(fetcher, 1)).toBe("gemini-3.1-flash-lite");
      expect(request.assertConsent).toHaveBeenCalledTimes(2);
      expect(removeListener).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      removeListener.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks consent again before fallback and stops if consent was revoked", async () => {
    const assertConsent = vi
      .fn(async () => undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Gemini consent was revoked"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ candidates: [] }));

    await expect(requestGeminiText(options({ assertConsent }), fetcher)).rejects.toThrow(
      "Gemini consent was revoked",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(assertConsent).toHaveBeenCalledTimes(2);
  });

  it("sends no prompt without consent", async () => {
    const assertConsent = vi.fn(async () => {
      throw new Error("Gemini consent is required");
    });
    const fetcher = vi.fn<typeof fetch>();

    await expect(requestGeminiText(options({ assertConsent }), fetcher)).rejects.toThrow(
      "Gemini consent is required",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts the configured API key from provider failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse({ error: { message: `Request rejected for key ${apiKey}` } }, 400),
      );
    const error = await requestGeminiText(options(), fetcher).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).toMatch(/rejected|key/i);
  });

  it("redacts the configured API key from thrown network errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`Network failed for ${apiKey}`));
    const error = await requestGeminiText(options(), fetcher).catch((failure: unknown) => failure);

    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).toMatch(/network failed/i);
  });
});
