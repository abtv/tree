# Fix Overlapping Autosave Accounting and Image Failure Handling

Status: Active
Created: 2026-09-13

## Goal and authorization

Resolve the three findings from the repository quality assessment:

1. A successful earlier save clears word accounting belonging to a later failed save.
2. Attachment validation accepts a PNG-shaped payload containing no image data.
3. Inline images and previews silently discard attachment-read failures.

The Product Owner requested a committed active plan for another model to implement. This commit is planning only: no fixes have been implemented. The requested scope includes making image failures visible. Existing autosave policy, attachment storage, and architecture remain the source of truth; do not introduce new save triggers, a new schema, automatic attachment deletion, or a new dependency without applying the repository's approval rules.

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

Record final measurements and any deviations here before completion, as required by Product §22.1.

* **Disk writes and syncs:** autosave should add only the policy-required retries missing today. No per-keystroke saves. Invalid attachments must produce zero attachment writes. Display errors must produce no document writes, cleanup requests, or automatic read loops.
* **Interactive CPU:** save accounting should be O(1) per edit/completion, without document/history traversal. PNG validation may scan O(B) encoded bytes and decode image pixels on insertion; do not repeat decoding on typing or attachment existence checks. Measure representative small and larger valid images and report main-process latency. Encoded size alone does not bound decoded pixel memory; assess that risk explicitly without silently adding a new product limit.
* **Memory:** keep save bookkeeping bounded regardless of edit/request count. Retain the byte-cache budget and release object URLs. Avoid retaining decoded platform images or duplicate byte buffers after validation finishes.
* **Automated guards:** deterministic tests must assert save/write/read counts, bounded accounting over repeated cycles, and cache/URL lifecycle. Add a focused guard against repeated validation/decoding per insertion. Run the existing eight performance scenarios; add a measured insertion guard if the decoder changes work at scale. Do not weaken budgets to accommodate a regression.

## Validation and documentation

1. Reproduce each finding with a failing test before its implementation change. Record test names and observed failures in this plan.
2. Implement and run the focused tests. Where practical, bypass the fix to confirm the regression fails again.
3. Update Product §17.1 for image failure visibility, Architecture §13 for actual save acknowledgment semantics, and the development guide for the new guards. Document decoder wiring if it changes technical responsibilities within the existing boundaries.
4. Review affected Product §§16–17 and 22 against unit, contract, and E2E coverage. Preserve existing shutdown success/failure/timeout/retry/duplicate-request/menu/window-close/renderer-unavailable tests; add coverage where changed behavior exposes a gap.
5. Run `npm run check:full` on supported macOS with a display. All unit, boundary, E2E, and performance checks must execute; report exact failures or environment blockers. Follow the suite-owned Electron cleanup rules on launch failures.
6. Review the diff, record verification/performance evidence, mark this same plan Completed with its completion date, and move it to `docs/plans/completed/` without copying it.
7. Commit the completed implementation and provide the required session handoff. The planning commit is separate; do not amend it merely because implementation follows this plan.

## Planning baseline

The quality-assessment run on 2026-09-13 passed `npm run check:full`: 380 unit/component/property tests, 92 Electron E2E tests, and 8 performance tests; type checking, lint, formatting, coverage enforcement, build, and dependency audit also passed. Statement coverage was 96.86% and branch coverage 90.79%. These passing results coexist with the reproduced gaps above and are not evidence that this plan is implemented.

## Execution checklist

* [ ] Reproduce and fix overlapping-save accounting, including cleanup-result distinctions.
* [ ] Add deferred-save, property, contract, and Electron regressions.
* [ ] Reject invalid PNGs and replace invalid positive fixtures.
* [ ] Verify real decoder and write-boundary behavior.
* [ ] Add accessible inline/preview image failure states and lifecycle regressions.
* [ ] Update product, architecture, and development documentation.
* [ ] Record the performance assessment and pass automated guards.
* [ ] Pass `npm run check:full` with no required tests skipped.
* [ ] Record evidence, complete and move this plan, and commit implementation.
