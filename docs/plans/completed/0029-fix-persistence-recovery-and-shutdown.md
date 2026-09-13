# Fix Persistence Recovery and Shutdown

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Fix the reliability defects reproduced during the repository quality review and its direct follow-up:

* Attachment cleanup must not clear an unresolved document-save failure.
* Recovery must validate a replacement document and its attachment references before changing stored files.
* A primary document containing JSON `null` must fail safely instead of starting an empty document and overwriting recovery files.
* Normal quit must wait for pending clipboard edits and attachment writes before flushing their resulting saves.

## Scope

Preserve the existing document schema, layer boundaries, clipboard transforms, and shutdown timeout. Update the persistence coordinator, file services, and editor operation tracking inside the current architecture. These fixes enforce Product sections 15–17 and the existing safe-load requirement in Architecture section 13.

## Validation

1. Add failing unit regressions for each reproduced defect, including recovery fallback selection, save-error retention and retry, and delayed/failed clipboard operations during flush.
2. Cover load error propagation and shutdown acknowledgment ordering with focused boundary contract tests.
3. Add real Electron regressions for invalid recovery files, cleanup after a save failure, and quit while image paste is pending; preserve the existing shutdown success, timeout, retry, duplicate-request, window-close, and renderer-unavailability coverage.
4. Confirm the regressions fail before the fixes and pass afterward. Run `npm run check:full` before committing.

No domain transformation changes are planned; existing property tests continue to guard those invariants.

## Progress

* Review diagnostics reproduced all three defects against the original implementation.
* Added unit and Electron regressions that failed against the original implementation for all three defects.
* Recovery now validates fallback schema and attachment availability before replacing the primary file; invalid fallback files remain unchanged.
* Document-save errors survive cleanup and clear only after a successful save.
* Shutdown flushing waits for pending cut/paste operations and the saves they schedule. A further failing unit regression exposed a save-batch handoff race; flushing now follows replacement queue promises until the queue settles.
* Added focused IPC/lifecycle contract coverage and six passing Electron regressions, including failed-image quit cancellation and retry.
* `npm run check:full` passed: type checking, linting, formatting, 245 unit/component/property tests, production build, dependency audit (zero vulnerabilities), 86 Electron E2E tests, and five performance tests. No required tests were skipped.
* The initial local pipeline reached a sandbox DNS failure at the audit step; the audit and complete pipeline passed when rerun with network access. Test mock typing and lint failures encountered during implementation were corrected. No validation failures remain.
* Final unit coverage: 93.55% statements, 85.05% branches, 94.03% functions, and 95.45% lines. Typing paint p95 remained below 34 ms in both performance scenarios.

## Direct Follow-up: Null Primary Document

* Added failing file-service regressions for a JSON `null` primary with and without recovery files, and an Electron regression for preserving the primary and recovery files through quit. Both test levels reproduced the original failure before the fix.
* The file boundary now rejects a JSON `null` primary as unsupported without considering recovery replacements. The first-launch `null` result remains reserved for absent document files. Null recovery candidates remain subject to ordinary fallback validation.
* Extended the load IPC contract to explicitly cover the first-launch sentinel alongside valid results and error propagation. Product and architecture documentation clarify the distinction between missing files and stored JSON `null`.
* Focused validation passed: 25 file-service/IPC tests and the Electron null-primary regression.
* The first full validation run exposed an existing E2E setup race: the initial document read could throw `ENOENT` before autosave created the file. Changed the two initial-save waits in the reliability suite to retry the assertion, including file-read errors, within a bounded timeout.
* The isolated image-paste test and the complete `npm run check:full` rerun passed: 248 unit/component/property tests, 87 Electron E2E tests, five performance tests, type checking, linting, formatting, production build, and dependency audit with zero vulnerabilities. No tests were skipped and no validation failures remain. Coverage is 93.58% statements, 85.14% branches, 94.03% functions, and 95.47% lines; typing paint p95 peaked at 33.5 ms.
