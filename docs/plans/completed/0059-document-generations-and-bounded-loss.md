# Document Generations and Bounded Loss

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Implement the approved persistence guarantee recorded in `docs/PRODUCT.md` §16: the application always opens the newest loadable document, a recent power-loss or crash can cost only a bounded amount of recent work, and only destruction of the storage device can remove every stored copy.

The current model keeps `document.json`, `document.json.tmp`, and `document.json.bak`, and every save rewrites the primary and the backup inside the same short write-back window. A power loss that tears those files leaves no loadable candidate, and a document that references a missing attachment is rejected at startup. Both outcomes violate the approved behavior.

## Approved behavior

* Each save preserves the document it replaces as a retained generation.
* At least one generation written more than 30 seconds ago is always retained, together with generations written after it.
* On load, the newest stored document that parses and validates becomes the document; unreadable candidates are skipped, and the loaded candidate becomes the primary.
* A missing attachment file must not prevent the document from opening; the affected image shows the existing error.
* Retained generations count as references during attachment cleanup.
* Only destruction of the storage device can remove every generation.

## Current behavior

* `saveDocument` writes `document.json.tmp` durably, copies the primary to `document.json.bak`, syncs the backup, then renames the temporary file over the primary. The previous document exists only as the single backup, which is overwritten on the next save.
* `load` returns a primary that parses as JSON without further validation, then tries `document.json.tmp` and `document.json.bak`, rejecting each candidate whose referenced attachment files are missing and promoting a valid candidate to the primary.
* `cleanupAttachments` unions attachment ids from the caller, the temporary file, and the backup.
* The renderer refuses to open a document when any referenced attachment is missing (`findMissingAttachmentId`), so a lost attachment is a startup failure rather than an image error.
* The `has-attachment` IPC channel exists only for that eager check.

## Design

### Retention files

* `document.json` remains the newest committed document.
* `document.json.tmp` remains the durable staging file for the next primary.
* Each save preserves the replaced primary as an immutable generation named `document.<sequence>.json`. Generation files are written once by being the primary and are never rewritten; names use a sequence number that continues after restart.
* `document.json.bak` stops being written and remains only as a legacy candidate that load and cleanup still read until pruning removes it.

### Save

1. Write the serialized state to `document.json.tmp` through the existing durable write.
2. Reserve the next generation path from the directory listing.
3. Rename the existing primary to the generation path; a missing primary is skipped.
4. Rename the temporary file to the primary.
5. Prune generations; pruning is best-effort and never turns a committed save into a reported failure.

An interruption before step 3 keeps the primary and leaves the newer state in the temporary file. An interruption between steps 3 and 4 leaves the newer state in the temporary file and the previous document as a generation; load recovers the temporary file.

### Load

Candidates in order: the primary, the temporary file, then generations newest first by write time, with the legacy backup included at its write time. The primary is returned after a JSON parse as today. Every other candidate must parse through the domain parser; a missing attachment does not reject a candidate. A validated candidate is renamed over the primary and returned. If no candidate loads and no stored file exists, load returns the first-launch `null`; if stored files exist but none loads, the existing error is thrown without changing files.

### Pruning

* Keep the newest retained-generation cap and the newest generation at least the safety window old, plus generations newer than it.
* Never delete the safety generation or anything newer; delete only older generations.
* Best-effort deletion; unlink failures other than `ENOENT` are ignored so a committed save is never reported as failed.
* Pruning runs inside the serialized file-service queue, so cleanup cannot race it.

### Cleanup and missing attachments

* Cleanup unions attachment ids from the caller, the temporary file, and every retained generation.
* The renderer no longer checks attachment existence before opening. The document opens and the image read path reports the existing `Image could not be loaded.` message for a missing file.
* The `has-attachment` IPC channel, its handler, preload method, renderer service, and the `findMissingAttachmentId` check are removed as dead surface.

## Scope

* `src/infrastructure/main/file-services.ts` and its tests.
* Renderer/application eager attachment check and the `has-attachment` IPC channel and its contract tests.
* Electron persistence and attachment-validation tests, and a fixture for reading generations.
* `docs/PRODUCT.md` §16 and §17, `docs/ARCHITECTURE.md` §13 and §14, `docs/DEVELOPMENT.md` guard list.
* A short ADR recording the time-spread generation strategy as the response to the residual fsync exposure accepted by ADR 0008.
* No new dependency, no document schema change, no IPC payload change beyond removing the unused channel.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk operations: a save stops copying and syncing the backup and instead performs one extra rename, one directory listing, and at most one generation deletion per save. Net write and sync work per save is lower; generation retention adds one document-sized file per save up to the retention cap.
* CPU on interactive paths: load gains at most a parse of each candidate until one validates, which in normal operation is the primary only. Cleanup parses the retained generations instead of two candidates, bounded by the cap.
* Memory: the generation listing is small and bounded.
* The existing `large-10000` performance scenario measures save count and the attachment cleanup scan time and remains the guard; its budget covers parsing the retained generations.

## Validation

* Record the failing behavior before the change: a torn primary with a valid generation currently cannot be recovered once the backup is also unreadable, and a missing attachment currently prevents startup.
* Add unit coverage for generation retention, interrupted saves, pruning, cleanup retention, legacy backup migration, and missing attachments.
* Add Electron coverage for restart recovery from a generation and for opening with a missing attachment.
* Run `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move the file to `docs/plans/completed/` without copying.
* Commit as `feat(persistence): retain document generations for bounded data loss` with the `Plan: 0059` footer.

## Results

### Implementation

* `saveDocument` writes the temporary file durably, preserves the replaced primary as the next `document.<n>.json` generation, renames the temporary file to the primary, and prunes. Generation numbers continue across service instances and are not consumed when no primary exists.
* `load` considers the primary, the temporary file, and every retained generation (including a legacy `document.json.bak`) newest first by write time, promotes the newest candidate the domain parser accepts, and no longer rejects a candidate whose referenced attachment file is missing.
* Pruning keeps the newest fixed-cap set of generations plus the newest generation past the safety window, deletes only older generations, and is best-effort so a committed save is never reported as failed.
* Cleanup unions attachment ids from the temporary file and every retained generation.
* The eager `findMissingAttachmentId` check and the `has-attachment` IPC channel, its handler, preload method, renderer service, shared types, and file-service method were removed.
* `docs/PRODUCT.md` §16 and §17 record the approved bounded-loss behavior, `docs/ARCHITECTURE.md` §13 and §14 describe the generation model, `docs/DEVELOPMENT.md` §9 lists the generation guard, and ADR 0009 records the time-spread strategy as the mitigation for the ADR 0008 fsync exposure.

### Tests

* Unit coverage in `file-services.test.ts`: generation numbering across service instances, recovery from a damaged primary and temporary file, legacy backup recovery, the young-generation cap, the safety generation kept beyond the cap, attachment retention by a generation and release after pruning, interrupted generation rotation and replacement, and opening a recovery document with a missing attachment. The previous model had no generation files and rejected missing-attachment candidates, so these cases did not exist before the change.
* Application coverage in `editor-store.test.ts`: a loaded document whose referenced attachment file is missing opens as ready instead of failing initialization.
* Electron coverage adds `opens a document whose stored attachment file is missing` in `attachment-validation.spec.ts`, `retains an attachment referenced only by a generation across restart`, and `recovers a generation document including its image after the primary is damaged` in `persistence.spec.ts`.
* A first-launch regression found during Electron validation was fixed: `load` must treat a missing data directory as no generations rather than failing.

### Performance

* A save no longer copies and syncs the full backup; it adds one rename, one directory listing, and at most one deletion. Retained generations add one document-sized file per save up to the cap.
* Cleanup parses the retained generations: the `large-10000` performance scenario measured `cleanupScanMs` 24.62 ms against a 1000 ms ceiling, up from about 9 ms when only two candidates were read.
* The other 13 performance scenarios passed unchanged; image insertion measured 6.55 ms.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, Prettier, documentation governance, 486 unit/component/property tests with coverage (95.2% statements, 88.94% branches, 95.54% functions, 97.32% lines), production build, dependency audit (0 vulnerabilities), 107 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
