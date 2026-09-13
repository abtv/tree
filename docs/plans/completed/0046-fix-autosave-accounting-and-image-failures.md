# Fix Overlapping Autosave Accounting and Image Failure Handling

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and authorization

Resolve the three findings from the repository quality assessment:

1. A successful earlier save clears word accounting belonging to a later failed save.
2. Attachment validation accepts a PNG-shaped payload containing no image data.
3. Inline images and previews silently discard attachment-read failures.

The Product Owner requested this plan for another model to implement. The plan was prepared first; the fixes were subsequently implemented and validated as recorded under "Verification evidence". The requested scope includes making image failures visible. Existing autosave policy, attachment storage, and architecture remain the source of truth; do not introduce new save triggers, a new schema, automatic attachment deletion, or a new dependency without applying the repository's approval rules.

## Read before implementation

Read `AGENTS.md`, `docs/PRODUCT.md` §§16–17 and 22, `docs/ARCHITECTURE.md` §§13–14, and `docs/DEVELOPMENT.md` §§8–13. Read completed plan 0044 for the previous autosave fix, but do not repeat its aggregate-counter approach: that approach is the source of finding 1.

Primary files:

* `src/application/editor-store.ts` and its unit/property tests.
* `src/application/persistence-coordinator.ts` and its tests.
* `src/main/ipc-security.ts`, `src/main/ipc-handlers.ts`, and their tests.
* `src/preload/index.test.ts` and `src/infrastructure/renderer/electron-services.test.ts` for boundary contracts.
* `src/renderer/AttachmentPreview.tsx`, its tests, `src/renderer/App.test.tsx`, and `src/renderer/styles.css`.
* `src/infrastructure/renderer/attachment-bytes-cache.ts` and its tests.
* `e2e/persistence-reliability.spec.ts`, `e2e/shutdown-failures.spec.ts`, `e2e/clipboard.spec.ts`, `e2e/preview.spec.ts`, and the shared fixtures.

Implement in the order below. Keep the work focused on these findings. A broad editor refactor, CI setup, packaging, and unrelated recovery behavior are outside this plan.

## 1. Associate autosave accounting with the actual saved snapshot

### Reproduced evidence

The assessment ran the real `EditorStore` with deferred service promises and a controlled clock, without modifying source files:

1. Initialize a saved, empty root and let initialization cleanup settle.
2. Edit its text to `one two three four five six seven eight nine ten `; let save A start, but keep its promise pending.
3. Append the same ten words; save B is requested while A is pending.
4. Resolve A successfully and let B start.
5. Reject B with `second save failed`.
6. Append `eleven ` without advancing the idle clock.

Observed: only two service save calls; the error remains visible. Expected: a third save is requested because eleven words have been inserted since the last successful saved snapshot.

`requestPolicySave` accumulates words in `insertedWordsAtSaveRequest`. `handlePersistenceResult` clears that entire aggregate on any successful coordinator result. A's success therefore erases B's accounting. Cleanup results also share this callback and must not be mistaken for successful document saves.

This is a save-trigger defect, not demonstrated loss of the in-memory document. Idle and quit retry paths must continue to work.

### Implementation guidance

* First add the failing deferred-promise regression to `editor-store.test.ts` using existing test helpers and fake timers.
* Track which inserted words are covered by each actual save snapshot. Capture accounting when the coordinator captures the state for the service call, rather than assuming one request equals one execution; requests can coalesce.
* Prefer bounded scalar bookkeeping, such as cumulative inserted-word watermarks and the watermark acknowledged by the latest successful snapshot. A failed save must not advance the acknowledged watermark. An earlier success must not acknowledge edits made after its snapshot was captured.
* Distinguish document-save completion from attachment-cleanup completion. A cleanup-only success must not reset word accounting; a successful save followed by failed cleanup must still acknowledge the words actually saved while retaining the cleanup error/retry behavior.
* Keep these details within the application layer. If coordinator dependency callbacks change, update every caller and focused coordinator test. No IPC/schema change is needed.
* Preserve coalescing and existing immediate, volume, idle, and quit triggers. Do not fix this by forcing a save on every edit or retaining an unbounded list of requests.

### Acceptance tests

* The six-step reproduction fails before the fix and passes afterward, with the third call saving the latest document.
* Exercise A success/B failure, A failure/B success, both failures followed by success, and both successes.
* Cover several requests coalescing while A is pending, additional edits below threshold while a save is pending, and edits arriving after the snapshot capture.
* Cleanup-only success does not acknowledge pending words; cleanup failure after a successful save does not count already-saved words as unsaved.
* Retain coverage for idle retry, visible save errors, clearing errors after recovery, and flushing the latest document before quit.
* Add a bounded property test for accounting over edits and deferred save outcomes, using an independent reference watermark model. Do not merely assert private implementation fields.
* Add an Electron regression using the existing main-process fault-injection patterns: hold A, request B through editing, succeed A, fail B, insert another word, and observe the volume retry through the real IPC/save boundary. Synchronize on explicit events/counters rather than sleeps. Verify persisted content and quit/restart after recovery.

## 2. Reject invalid PNG attachment payloads before writing files

### Reproduced evidence

`validateAttachmentBytes` accepts the following 45-byte payload, which contains only a signature, IHDR, and IEND, no IDAT data, and placeholder CRC bytes:

```ts
const invalidPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
])
```

The existing IPC-security tests use this structure as a successful fixture. Passing those tests does not prove image validity.

### Implementation guidance

* Add a failing regression for this exact payload before modifying validation.
* Replace invalid success fixtures with a small, genuinely decodable PNG. Audit other attachment-boundary fixtures for the same assumption; arbitrary bytes remain acceptable in tests that intentionally exercise only byte transport or filesystem storage.
* Retain byte-type normalization, the existing 25 MiB limit, attachment-ID checks, and rejection before filesystem writes.
* Strengthen validation beyond recognizing chunk envelopes. Reject absent image data, invalid critical structure/CRC, truncation, and payloads whose image data cannot decode. Do not merely require the string `IDAT` somewhere in the bytes.
* Prefer existing platform capabilities for decoding over implementing a general PNG decoder or adding a package. Keep Electron APIs in the main/infrastructure layer; inject a decoder dependency if necessary to keep the rule unit-testable. The existing IPC handler remains responsible for validating untrusted writes.
* Support ordinary valid PNG variants, including transparent images. Preserve accepted bytes rather than silently re-encoding attachments. Avoid imposing a new product image-dimension limit as an incidental implementation decision.
* If platform decoding is permissive about damaged structures, retain explicit structural checks for those cases rather than treating a non-empty decoder result as proof of every invariant.

### Acceptance tests

* Reject the reproduced payload, truncated chunks, missing/invalid image data, bad CRC, zero dimensions, non-PNG bytes, empty data, and oversized data.
* Accept real small PNGs, transparency, and the supported byte input forms already covered by tests.
* IPC contract tests prove invalid input rejects before `writeAttachment` is called; valid input forwards the same ID and equivalent bytes; filesystem failures propagate.
* Electron tests invoke the exposed preload write method with invalid data and verify rejection and absence of a file. Also paste a real image through the clipboard, verify browser decoding (`naturalWidth > 0`), save, and restart successfully.
* Any new decoder adapter has focused unit/contract coverage plus a real Electron decoding test. Do not stub away the decoder in the only test meant to prove image validity.

## 3. Show image-load failures without breaking the editor

### Inspection evidence and intended behavior

`AttachmentImage` and `ImagePreview` currently use `.catch(() => undefined)` and treat a `null` read as no image. Component tests explicitly expect the silent behavior. This finding was established by code inspection; add failing rendering regressions before claiming reproduction through the UI.

For the requested failure visibility, use a minimal accessible message such as `Image could not be loaded.` in the affected inline image area or preview. Cover missing bytes, rejected reads, and browser image-decode errors. The preview stays closable with its existing button and Escape behavior, and closing restores focus. The rest of the document stays editable. Do not add a new retry workflow, modal, toast system, or automatic file repair as part of this fix.

Update `docs/PRODUCT.md` §17.1 during implementation to record this failure behavior. This makes the requested visibility explicit in the source of truth instead of leaving it only in this plan.

### Implementation guidance

* Represent loading, success, and failure explicitly in the presentation code. Clear the prior URL/error when the attachment changes so another node's image or error cannot remain visible.
* Handle both read rejection/`null` and the rendered image's decode error event.
* Preserve disposal guards: a late response for an old attachment or unmounted component must not update the current view.
* Revoke object URLs when replaced or unmounted. Preserve successful byte-cache reuse; failed/missing reads must remain uncached.
* Use the existing component structure and styling. Keep persistence error state distinct: failure to display an image must not falsely report a document-save failure or automatically delete its attachment.

### Acceptance tests

* Inline and preview components visibly and accessibly report rejected reads, missing bytes, and decode errors.
* Test success after switching to a valid attachment, late success/failure after switching IDs, and unmount cleanup; assert no stale image/message or object-URL leak.
* Preserve the current sizing, byte-cache reuse, focus trap, Escape, close-button, and focus-restoration tests.
* Update tests that previously required silence; replace those assertions with the authorized visible behavior rather than deleting failure coverage.
* Add Electron coverage for a real missing/read-failed attachment and for corrupt stored bytes reaching browser decoding. Seed faults after startup validation as necessary and use a fresh attachment ID or a fresh process so a warm cache cannot hide the fault.
* Verify the failure message, continued text editing, and preview close/focus behavior. Use the fixture's explicit expected-error mechanism if needed; do not disable its general error guard.

## Performance assessment and guards

Required by Product §22.1. Recorded after implementation.

* **Disk writes and syncs:** the save-accounting change adds no save trigger. It removes a spurious missing retry and prevents lost retries; it cannot add writes for ordinary editing. The PNG change rejects invalid payloads before `writeAttachment`, so invalid attachments produce zero writes and no file. Display failures perform no document writes or cleanup and cannot loop reads. Measured image-insertion `write-attachment` latency (validation + decode + write) was 0.65 ms for a 32×32 image and 0.65 ms for a 512×512 image in the new performance scenario.
* **Interactive CPU:** accounting is two integers per store; every edit and result handles them in O(1) with no document, history, or request-list traversal. PNG validation scans O(B) encoded bytes once per insertion, verifies chunk CRCs and structure, and decodes through the platform decoder once; the IPC contract test asserts the decoder is invoked exactly once per accepted write and never on `hasAttachment`/`readAttachment`. Validation and decoding are not repeated on typing or attachment-existence checks.
* **Memory:** accounting is a fixed pair of scalars regardless of edit or request count. The renderer keeps its bounded byte-cache budget, revokes object URLs when an image is replaced or a component unmounts, and revokes again on a decode failure. No decoded platform image or duplicate byte buffer is retained after validation; the decoder adapter converts to a temporary `Buffer` inside the handler and returns only a boolean.
* **Automated guards:** deterministic `editor-store.test.ts` save-count tests cover A-success/B-failure, A-failure/B-success, consecutive failures, both successes, below-threshold edits while a save is pending, and cleanup success/failure separation. `EditorStore save accounting` in `editor-store.property.test.ts` checks 200 random edit/outcome sequences against an independent watermark model. `ipc-handlers.test.ts` asserts a single decode per accepted attachment write, that invalid bytes reject before the filesystem call, and that write failures propagate. `AttachmentPreview.test.tsx` asserts message visibility, late-response disposal, URL release, and cache reuse. The performance suite's ninth scenario measures insertion decode latency.

## Verification evidence

* **Finding 1:** the deferred-promise regression `requests a save for words inserted after an earlier successful snapshot when a later save fails` failed against pre-fix `editor-store.ts`/`persistence-coordinator.ts` with 2 saves instead of 3. Four focused store tests plus the coordinator cleanup tests also failed pre-fix and pass after the fix. The new Electron regression holds save A, coalesces B through editing, succeeds A, fails B, inserts another word, observes the volume retry through the real IPC boundary, then verifies the persisted content and a restart.
* **Finding 2:** the exact 45-byte signature/IHDR/IEND payload is now rejected by `isPng` (placeholder CRCs fail); the strengthened validator additionally rejects truncated chunks, missing `IDAT`, bad CRCs, zero dimensions, and structurally valid payloads whose data cannot decode, while accepting real one-pixel and transparent PNGs. The `nativeImage` adapter is `src/main/png-decoder.ts` and is injected through `IpcHandlerDependencies`.
* **Finding 3:** both inline and preview components now expose `Image could not be loaded.` for missing bytes, rejected reads, and browser decode errors; the plan's silence assertions were replaced with visible-behavior assertions. Electron tests cover a real read failure and corrupt stored bytes after restart, and confirm the editor stays usable.

## Validation and documentation

1. Findings were reproduced with failing tests before implementation (recorded above).
2. Focused tests pass; the regression was confirmed to fail against the pre-fix implementation.
3. Product §17.1, Architecture §§7 and 13, and Development §12 were updated.
4. Affected Product §§16–17 and 22 coverage was reviewed and extended at unit, contract, and Electron levels; existing shutdown tests were retained.
5. `npm run check:full` passed on macOS with a display: type checking, lint, format check, 401 coverage-enforced unit/component/property tests, production build, dependency audit, 97 Electron E2E tests, and 9 performance tests. No required test was skipped.
6. The plan is marked Completed and moved to `docs/plans/completed/` without copying.

## Execution checklist

* [x] Reproduce and fix overlapping-save accounting, including cleanup-result distinctions.
* [x] Add deferred-save, property, contract, and Electron regressions.
* [x] Reject invalid PNGs and replace invalid positive fixtures.
* [x] Verify real decoder and write-boundary behavior.
* [x] Add accessible inline/preview image failure states and lifecycle regressions.
* [x] Update product, architecture, and development documentation.
* [x] Record the performance assessment and pass automated guards.
* [x] Pass `npm run check:full` with no required tests skipped.
* [x] Record evidence, complete and move this plan, and commit implementation.
