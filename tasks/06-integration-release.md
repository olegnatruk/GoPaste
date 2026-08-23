# Task 06 — Integration, E2E, Hardening, and Release

Status: Blocked by Tasks 02–05  
Dependencies: Tasks 02, 03, 04, and 05  
Primary ownership: integration/E2E tests, packaging, final documentation updates; cross-cutting fixes require coordinator review

## Scope

- Integrate all surfaces and resolve contract mismatches.
- Add loaded-extension E2E coverage where feasible and complete manual checks.
- Audit permissions, CSP, archive safety, cleanup, accessibility, performance, and service-worker restart behavior.
- Finalize README commands, user guide, compatibility results, troubleshooting, and release package.

## Acceptance Criteria

- Lint/format, typecheck, unit/component/integration tests, E2E where feasible, and production build pass.
- The unpacked extension completes capture, organize, copy/fallback, export, and import flows.
- Known platform limitations are documented without overclaiming.
- Production output contains no remote executable code or undeclared permissions.

## Verification

Run the complete documented suite from a clean install, load the production build in Chrome, execute the manual checklist, and inspect the final package.
