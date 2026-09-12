Status: Completed
Created: 2026-09-12
Completed: 2026-09-13

# Harden persistence and E2E teardown

## Goal

Eliminate intermittent document-save and attachment persistence failures, make every persistence boundary operation diagnosable, and ensure E2E fixtures observe failures and clean up owned Electron processes without teardown timeouts.

## Current evidence

- Document saves are serialized in both the application store and file services.
- Attachment cleanup is started independently of document persistence and its errors are discarded by the application store.
- File operations use fixed paths but have no operation/path instrumentation.
- E2E fixtures poll visible save errors, but do not observe attachment-cleanup errors from the real boundary.
- Reproduction showed overlapping cleanup could race and produce unlink `ENOENT`; repeated E2E runs showed fixture waits accumulating to a worker teardown timeout.

## Scope

- Reproduce and test rapid edits, overlapping saves, attachment write/cleanup races, shutdown with pending persistence, and transient visible save errors.
- Make persistence and attachment operations serialized and ordered where required by document state and attachment references.
- Instrument save, writeAttachment, readAttachment, and cleanupAttachments with operation names and paths, including failures.
- Preserve the existing persistence format and Electron/React architecture.
- Make E2E and performance fixtures register child processes immediately, observe save and attachment-cleanup errors, and perform bounded idempotent teardown.
- Update development/architecture documentation only where the implemented guarantees change.

## Validation

- Focused unit and contract tests for file services, application persistence, IPC forwarding/error propagation, lifecycle shutdown, and fixture observation helpers.
- E2E regression coverage for rapid edits, overlapping persistence, attachments, shutdown flush, transient errors, and teardown ownership.
- Repeat `npm run check:full` until it exits 0 without test or teardown errors; record any supported-environment limitation.

## Result

The shared file-service queue now serializes document and attachment operations, cleanup failures are surfaced through the application persistence error path, and all requested operation diagnostics include names, phases, and paths. Persistence requests are coalesced during rapid edits so shutdown flushes the latest state without an unbounded save backlog. E2E and performance fixtures retain transient save/cleanup errors, close owned applications before deleting test directories, and use bounded child-process teardown. The final complete validation run passed 172 unit/component tests, 64 E2E tests, and 5 performance tests without visible persistence errors or worker teardown timeouts. The observers also keep a renderer-local history of every visible persistence or operation error, closing the gap where asynchronous cross-process observation could miss a transient red message.
