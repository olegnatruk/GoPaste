# CodeChum integration contract

Status: integrated and automated checks passing; manual Chrome verification pending. See `PLAN.md` and tasks 11–14.

## Included and excluded sources

- Port the solver's authentication, background behavior, CodeChum page reader, and user controls from `CODECHUM-HACK/auth/`, `background/`, `content/`, and `popup/` into `src/codechum/`.
- Exclude `CODECHUM-HACK/web/`, `admin/`, `oldver/`, prebuilt ZIPs, and packaging scripts from the GoPaste extension artifact.
- Preserve the original CodeChum project as an ignored local reference; `src/codechum/` contains the source to commit and ship.

## Runtime boundaries

- One manifest and one module service worker: GoPaste's `src/background/main.ts` remains the entry. CodeChum commands and messages must register within it without claiming unrelated GoPaste messages.
- GoPaste's `popup.html` remains the toolbar popup. A visible **CodeChum** control switches to the assistant controls inside it. **Open full page** opens the optional bundled `codechum.html` extension page.
- The active CodeChum tab ID is passed into either view. CodeChum UI messages carry the selected ID; the worker validates the tab URL before reading or changing it. Otherwise an extension UI tab could be mistaken for the problem tab.
- The shortcut section shows Chrome's actual command assignments. Start and Stop have default chords; speed commands are available for manual binding in Chrome's shortcut settings.
- CodeChum operations are user-initiated and restricted to a CodeChum tab. Page reading, Gemini calls, and typing do not run merely because the extension is installed or a page opens.
- The original generic console runner's arbitrary-string execution is not part of the combined Store build by default. The solver may put generated code in CodeChum's editor, but the user invokes CodeChum's own Check code action. Any restored arbitrary-code feature needs a policy-compatible API and a separate design review.
- CodeChum storage keys use `chrome.storage.local`. GoPaste library records stay in IndexedDB. The two datasets are not mixed or uploaded together.
- CodeChum auth talks to its existing Supabase project. A solver run sends the visible challenge content, selected tests, and feedback to the Gemini API using the member's configured API key. This must be disclosed before use. GoPaste media blobs never enter those requests.
- Gemini requests start with `gemini-3-flash-preview`, then documented Gemini 3.x fallbacks if the model is unavailable or returns unusable output. Requests keep Google's default temperature, exclude thought parts from candidate code, and report blocked prompts, quota/access errors, missing text, and token exhaustion explicitly. Token exhaustion permits one larger-budget retry per model; requests time out after 90 seconds. Account consent is rechecked before every attempt. See task 15 and the typed `worker/gemini.ts` adapter.
- All generation requests ask for an independently written implementation. `RECITATION` stops that request and discards any attached output; it never triggers automatic model fallback. The worker publishes `needs_original_solution` so the popup can offer implementation notes and a deliberate new request. Notes and candidate code are disclosed as Gemini request context, stored locally, and notes are cleared on sign-out/account change. See task 16.

## Store and privacy boundary

The combined extension cannot be described as device-only or solely an image library. Store listing, permissions explanations, and the hosted privacy page must describe both features, CodeChum account data, Gemini transfers, and user controls. An honest combined listing can still be rejected under Chrome's single-purpose policy; no implementation can promise approval. See [Chrome's quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines) and [disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements).

## Verification record

Automated checks must cover message routing, command coexistence, UI entry, and package contents. Manual Chrome checks must cover GoPaste capture/copy/drag, CodeChum sign-in, solver start/stop, manual-check/resume, and behavior after a service worker restart. Record actual results in `docs/COMPATIBILITY.md`; do not label them tested based on mocks.
