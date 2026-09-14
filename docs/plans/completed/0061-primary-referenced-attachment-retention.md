# Keep Attachments Referenced by the Primary Document During Cleanup

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Fix a persistence defect where attachment cleanup can delete an image that the newest committed document on disk still references. The approved behavior is in `docs/PRODUCT.md` §17: an attachment is no longer referenced only after every live document reference, every retained runtime reference, and every valid retained recovery document reference is gone, and cleanup must not remove an attachment that a valid recovery document still references. The current primary file is a valid recovery document: it is the document the application loads.

## Defect

The renderer's keep set is derived from the live document, runtime history, and pending attachment writes. The main-process cleanup extends that set with the temporary file and retained generations but not the primary file, relying on the coordinator to run cleanup against a saved-state keep set.

That assumption breaks when document changes land while a save is in flight:

1. An edit that only exists in history requests cleanup, and the cleanup waits for the next save with `cleanupRequested` left set.
2. A later save (for example the immediate save triggered by an image paste) snapshots both flags at the start of its iteration, capturing a document that references the image.
3. While that save is in flight, the user undoes the change and performs a new edit, which discards the redo branch. The image is now absent from the live document and from history.
4. The save completes, and `PersistenceCoordinator.runCleanup` runs because a save ran in that iteration even though document changes are pending. The keep set no longer contains the image, and the main process deletes it although the just-committed primary references it.

A crash before the next successful save then loads the primary with a missing attachment, and later recovery from the retained generation that references it also lacks the bytes. `cleanupAttachments` deletes everything outside the keep set, so the deletion rule must be locally safe: never delete a file referenced by any document file on disk.

## Approved behavior

* `docs/PRODUCT.md` §17: cleanup must not remove an attachment that a valid recovery document still references.
* `docs/PRODUCT.md` §17: an attachment is no longer referenced only after every live document reference, every retained runtime reference, and every valid retained recovery document reference is gone.
* `docs/ARCHITECTURE.md` §13: cleanup runs after the save that persists the current referenced set, and a save rotation cannot race the retention decision.

## Design

* `cleanupAttachments` includes the primary `document.json` in the recovery candidates whose attachment ids extend the renderer-supplied keep set, alongside the temporary file and retained generations.
* The primary is parsed with the same `readRecoveryAttachmentIds` path, so a malformed or unsupported primary contributes no ids and is left unchanged, and an unexpected read failure still aborts cleanup before anything is deleted.
* The primary read happens inside the same serialized filesystem operation as the save and generation reads, so a save rotation still cannot race the retention decision.
* This makes the deletion rule locally safe: cleanup never deletes a file referenced by any document file on disk, even if a renderer keep set is computed while newer edits are pending.

## Scope

* `src/infrastructure/main/file-services.ts` and `src/infrastructure/main/file-services.test.ts`.
* `e2e/persistence-reliability.spec.ts` for the boundary regression.
* `docs/ARCHITECTURE.md` §13 and §14 cleanup wording.
* No product behavior change, no document schema change, no IPC channel or payload change, and no coordinator sequencing change.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk operations: no write, rename, or sync is added. Cleanup adds one sequential JSON read of the primary per run, inside the existing serialized queue.
* CPU: one additional `O(document)` parse and attachment-id collection per cleanup run, the same cost class as the temporary file and each retained generation already parsed by the same code path. Cleanup is not on the typing path; it runs after saves and at startup.
* Memory: the parsed primary is bounded by the same document size already parsed for the temporary file and generations and is released when the operation completes.
* The existing `cleanupScanMs` performance metric in `perf/state.spec.ts` already guards the reference-changing path with a fixed ceiling and covers the added parse.

## Testing

* Defect-first: reproduce the deleted-file behavior before changing the implementation.
* Unit coverage: a primary-only attachment reference survives cleanup; cleanup still reads one recovery candidate per document path.
* Electron coverage: an image whose save is edited during its flush is not deleted by the following cleanup.
* Run `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move the file to `docs/plans/completed/` without copying.

## Results

### Implementation

* `cleanupAttachments` reads and parses the primary `document.json` with the same recovery-candidate path as the temporary file and retained generations, and unions its attachment ids into the keep set before unlinking anything. Malformed, unsupported, or missing primaries contribute no ids; unexpected read failures still abort cleanup.
* No coordinator sequencing change was made. The primary scan makes the deletion rule locally safe while preserving the existing cleanup timing after a save, so the deferred-cleanup behavior in `e2e/persistence-reliability.spec.ts` is unchanged.

### Tests

* Unit coverage in `file-services.test.ts`: `retains an attachment referenced only by the primary document` fails before the fix (the image is deleted) and passes after it; the recovery-candidate read test now expects the primary as the first parsed candidate.
* Electron coverage in `persistence-reliability.spec.ts`: `keeps an image referenced by a save that is edited while its flush is pending` gates the image-paste save, undoes the paste and types a new edit while the save is pending, releases the save, and asserts the attachment file survives the cleanup that follows. The test fails before the fix at the file-existence assertion and passes after it.
* Defect-first: both new regressions were run against the unfixed implementation and failed at the deleted-file assertion before the fix was applied.

### Performance

* The perf state scenarios passed with the existing ceilings: `cleanupScanMs` 29.86 ms for the structural/reference-changing scenario and 14.81 ms for the attachment-history scenario against the 1,000 ms ceiling. Startup and typing metrics passed unchanged.
* Cleanup gains one sequential read and parse of a document-sized primary per run, the same cost class as the temporary file and generations it already parses, inside the serialized file-service queue.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, Prettier, documentation governance, 490 unit/component/property tests with coverage (95.12% statements, 88.75% branches, 95.56% functions, 97.4% lines), production build, dependency audit, 111 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
