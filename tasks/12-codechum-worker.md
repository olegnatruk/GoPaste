# Task 12 — CodeChum worker integration

Status: **implemented; automated checks pass; manual Chrome verification pending**

Dependencies: task 11 contracts.

Owned files: `src/codechum/worker/**`, `src/background/codechum-adapter.*`, and focused worker tests. Do not edit GoPaste's existing background entry, manifest, popup, or privacy page; report required hookup lines to the coordinator.

Acceptance criteria:

- CodeChum auth, parser, page reader, commands, manual start/stop, checkpoint, and Gemini calls work from a module-compatible worker adapter.
- The CodeChum message listener returns `false` for non-CodeChum messages and does not intercept GoPaste requests.
- CodeChum commands have distinct names and cannot consume `open-dashboard`.
- UI messages can specify a source CodeChum tab ID, which the worker validates before access; an extension UI tab must never be treated as the target problem tab.
- Existing standalone CodeChum source is preserved or any shared edits remain compatible with its original tests.
- No CodeChum request runs automatically on ordinary GoPaste use.
- The combined Store build does not execute arbitrary script strings through `AsyncFunction`/`eval`; it supports the CodeChum editor-assistance path and leaves Check code to the user.

Verification: focused worker tests, `node --test CODECHUM-HACK/tests/*.test.cjs`, `npm run typecheck`, and report manual-only gaps.
