export interface GeminiTextOptions {
  apiKey: string;
  prompt: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
  repair?: boolean;
  assertConsent: () => Promise<void>;
}

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 65_536;

/** A provider refusal is not a network failure and must never trigger fallback. */
export class GeminiBlockedResponseError extends Error {
  constructor(
    readonly reason: string,
    readonly model?: string,
    readonly target: "prompt" | "response" = "response",
  ) {
    super(`${model ? `${model}: ` : ""}Gemini blocked the ${target} (${reason}).`);
    this.name = "GeminiBlockedResponseError";
  }
}

class GeminiAttemptError extends Error {
  constructor(
    message: string,
    readonly terminal = false,
    readonly truncated = false,
  ) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeDetail(value: unknown, apiKey: string): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.split(apiKey).join("[redacted API key]").slice(0, 700);
}

function answerText(data: Record<string, unknown>): string {
  const feedback = record(data.promptFeedback);
  if (feedback.blockReason && feedback.blockReason !== "BLOCK_REASON_UNSPECIFIED") {
    throw new GeminiBlockedResponseError(String(feedback.blockReason), undefined, "prompt");
  }
  if (!Array.isArray(data.candidates) || !data.candidates.length) {
    throw new GeminiAttemptError("Gemini returned no candidates or answer text.");
  }

  const candidate = record(data.candidates[0]);
  const reason = candidate.finishReason;
  if (reason === "MAX_TOKENS") {
    throw new GeminiAttemptError(
      "The output token limit was reached before completion.",
      false,
      true,
    );
  }
  if (
    ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY", "RECITATION", "SPII"].includes(
      String(reason),
    )
  ) {
    throw new GeminiBlockedResponseError(String(reason));
  }
  if (reason && reason !== "STOP") {
    throw new GeminiAttemptError(`Gemini stopped without a complete answer (${reason}).`);
  }

  const parts = record(candidate.content).parts;
  const text = Array.isArray(parts)
    ? parts
        .map(record)
        .filter((part) => part.thought !== true && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("")
        .trim()
    : "";
  if (!text)
    throw new GeminiAttemptError(
      "Gemini returned no usable answer text (empty or thought-only response).",
    );
  return text;
}

async function generate(
  model: string,
  budget: number,
  options: GeminiTextOptions,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    if (options.signal?.aborted) throw new Error("Solver stopped.");
    const response = await fetcher(`${API_ROOT}${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Develop an independently written implementation by reasoning from the supplied requirements and user implementation notes. Do not reproduce published, memorized, or copyrighted solutions or quote the problem description. Preserve required interfaces and exact output formats. Return only the complete program code.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig: {
          maxOutputTokens: budget,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });

    let data: Record<string, unknown>;
    try {
      data = record(await response.json());
    } catch {
      if (response.status === 401 || response.status === 403) {
        throw new GeminiAttemptError(
          `Gemini API key or access error (HTTP ${response.status}): the server returned invalid JSON.`,
          true,
        );
      }
      throw new GeminiAttemptError(`Gemini returned invalid JSON (HTTP ${response.status}).`);
    }
    if (options.signal?.aborted) throw new Error("Solver stopped.");
    if (timedOut) throw new Error("Gemini request timed out after 90 seconds.");

    const apiError = record(data.error);
    if (!response.ok || data.error) {
      const detail = safeDetail(
        apiError.message || response.statusText || "Request failed",
        apiKey,
      );
      const invalidKey = /api.?key.*(?:invalid|expired|not valid)/i.test(detail);
      if (response.status === 401 || response.status === 403 || invalidKey) {
        throw new GeminiAttemptError(
          `Gemini API key or access error (HTTP ${response.status}): ${detail}`,
          true,
        );
      }
      const hint = response.status === 429 ? "Quota or rate limit exceeded. " : "";
      throw new GeminiAttemptError(`HTTP ${response.status}: ${hint}${detail}`);
    }
    return answerText(data);
  } catch (error) {
    if (options.signal?.aborted) throw new Error("Solver stopped.");
    if (timedOut) throw new GeminiAttemptError("Gemini request timed out after 90 seconds.");
    if (error instanceof GeminiAttemptError || error instanceof GeminiBlockedResponseError)
      throw error;
    throw new GeminiAttemptError(`Network request failed: ${safeDetail(error, apiKey)}`);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

/** Generate complete candidate text; never return partial code or private thought parts. */
export async function requestGeminiText(
  options: GeminiTextOptions,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("No Gemini API key found. Add your key in the CodeChum page.");
  if (options.signal?.aborted) throw new Error("Solver stopped.");

  const models = options.repair
    ? ["gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.1-flash-lite"]
    : ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
  const initialBudget = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(
      8192,
      Number.isFinite(options.maxOutputTokens) ? Math.ceil(options.maxOutputTokens) : 8192,
    ),
  );
  const failures: string[] = [];

  for (const model of models) {
    let budget = initialBudget;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (options.signal?.aborted) throw new Error("Solver stopped.");
      await options.assertConsent();
      try {
        return await generate(model, budget, options, apiKey, fetcher);
      } catch (error) {
        if (
          options.signal?.aborted ||
          (error instanceof Error && error.message === "Solver stopped.")
        ) {
          throw new Error("Solver stopped.");
        }
        const detail = safeDetail(error, apiKey);
        if (error instanceof GeminiBlockedResponseError) {
          throw new GeminiBlockedResponseError(
            safeDetail(error.reason, apiKey),
            model,
            error.target,
          );
        }
        if (error instanceof GeminiAttemptError && error.terminal) {
          throw new Error(`${model}: ${detail}`);
        }
        if (
          error instanceof GeminiAttemptError &&
          error.truncated &&
          attempt === 0 &&
          budget < MAX_OUTPUT_TOKENS
        ) {
          budget = Math.min(MAX_OUTPUT_TOKENS, Math.max(32_768, budget * 2));
          continue;
        }
        failures.push(`${model}: ${detail}`);
        break;
      }
    }
  }
  throw new Error(`Unable to get a Gemini response. ${failures.join(" | ")}`);
}
