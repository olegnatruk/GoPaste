# Task 16 — Original solution and recitation recovery

Status: implemented; all 138 tests pass (42 targeted Gemini/UI/routing regressions), formatting, lint, typecheck, extension and privacy builds pass. Requested and verified 2026-10-06. Live Gemini/Chrome verification remains pending.

Scope: Gemini system instructions request independently written programs from the supplied requirements. Preserve a typed `GeminiBlockedResponseError` with `reason` and optional `model`; a RECITATION response never returns code or triggers model fallback. The worker stops cleanly with `needs_original_solution` status and no red runtime-error badge for this recoverable provider outcome. The user may add their own implementation notes and explicitly request a new original solution. Existing editor code/checkpoints are preserved; the blocked output is never typed or cached.

Ownership: coordinator owns adapter, worker, UI, services/auth/storage declarations, docs and version/package. Verification sub-agent owns additions to `tests/unit/codechum-gemini.test.ts`, `tests/component/codechum-page.test.tsx`, and `tests/unit/codechum-worker-routing.test.ts`, and independently reviews worker handling. No overlapping source edits.

Implementation notes: optional `solutionNotes` string (maximum 4,000 characters) is stored locally and sent as additional task context only after the same AI consent and Start action. Sign-out/account change clears these notes. Update in-product consent and policy sources to disclose code/notes alongside the existing challenge context. System instructions do not weaken safety settings or request copyrighted solutions. RECITATION is terminal for the current request; regeneration is a deliberate user action, not an automatic attempt to bypass the block.

Verification: regression tests reject even a blocked response that includes text, preserve typed reason/model, verify original system instruction and absence of disabled safety settings, and verify the popup offers a recoverable state with a manual Start action and notes. Run `npm run check`, inspect ZIP version, and record live Gemini success as pending until observed.
