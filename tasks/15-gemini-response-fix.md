# Task 15 — Gemini response failure

Status: implemented; 22 adapter regressions and all 128 tests pass; formatting, lint, typecheck, and production build pass. Requested and verified 2026-10-06. Live authenticated generation remains a manual check.

Scope: use the documented `gemini-3-flash-preview` model first; extract the Gemini request into a typed adapter; preserve account-scoped consent before every request; report HTTP, invalid JSON, prompt blocking, empty output, and token exhaustion accurately. Use Gemini 3's default temperature, ignore thought text, and bound request duration and token retries. Rebuild the unpacked extension and Store ZIP.

Ownership: coordinator owns `src/codechum/worker/gemini.ts`, worker integration, version, docs and packaging. A verification sub-agent owns `tests/unit/codechum-gemini.test.ts` and independently reviews the adapter.

Contract: `requestGeminiText(options, fetcher = fetch): Promise<string>`, exported from `src/codechum/worker/gemini.ts`. Options are `{ apiKey: string; prompt: string; maxOutputTokens: number; signal?: AbortSignal; repair?: boolean; assertConsent: () => Promise<void> }`. First model is `gemini-3-flash-preview`; fallbacks are `gemini-3.1-flash-lite` and `gemini-3.8-flash` (repair prioritizes 3.8 before Flash-Lite). Requests use `x-goog-api-key`, no temperature override, and `thinkingLevel: low`. Only non-thought answer text is returned. Blocked prompts/auth failures/abort stop immediately. Truncation gets one larger-budget retry on the same model. Every unsuccessful response has an explicit reason; the final error includes each attempted model's reason and must redact the configured API key.

Verification: focused adapter tests, full `npm run check`, production ZIP/version inspection. Do not use Playwright. A live authenticated Gemini request remains a separate manual check; do not read or expose credentials from the user's browser.
