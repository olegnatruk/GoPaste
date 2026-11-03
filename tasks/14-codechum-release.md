# Task 14 — Packaging, privacy, and integrated release

Status: **packaged; automated checks pass; manual Chrome verification and hosted privacy update pending**

Dependencies: tasks 12 and 13.

Owned files: `public/manifest.json`, `vite.config.ts`, `src/background/main.ts`, packaging scripts, `docs/PERMISSIONS_AND_PRIVACY.md`, `docs/USER_GUIDE.md`, `docs/COMPATIBILITY.md`, `GoPaste_privacypolicy/src/main.js`, Chrome Web Store submission notes, and cross-feature integration tests. Coordinator owns this task.

Acceptance criteria:

- One worker and one manifest contain both features with necessary permissions and scoped command routing.
- Privacy page and listing notes accurately describe Supabase, Gemini, and GoPaste's local library.
- ZIP excludes `CODECHUM-HACK/web/`, `admin/`, prior ZIPs, and other project-only files.
- Existing GoPaste workflows and CodeChum workflows pass automated checks, with manual-only checks recorded honestly.
- Package version is incremented and final ZIP manifest/build verified.

Verification: `npm run typecheck`, focused and full tests, `node --test CODECHUM-HACK/tests/*.test.cjs`, production package inspection, and `git diff --check`.
