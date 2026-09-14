# Durable Attachment Writes

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Give attachment writes the same explicit flushing that document writes already perform, and cover the persistence boundary with abrupt-termination and power-loss assurance instead of only simulated filesystem failures and graceful restarts.

`writeAttachment` at `src/infrastructure/main/file-services.ts:88` calls `writeFile(path, png)` directly. A resolved write therefore only means the bytes were handed to the operating system. If power is lost before the page cache is written back, a document save that already persisted an attachment reference can survive while the attachment data or its directory entry does not, leaving the document unloadable. Document saves already go through `writeDurableFile` (`open` → `writeFile` → `sync` → `close`) and `syncFile`; attachment writes do not.

## Confirmed defect

The missing flush is demonstrated at the file-service boundary. A regression test that observes the handle sequence for a successful attachment write sees no `open`, no `sync`, and no `close` against the previous implementation: `writeFile` writes the final path directly. The fix routes the same bytes through the durable sequence, and the same test then observes `write` → `sync` → `close` for the file followed by a sync of the attachments directory before the promise resolves.

A completed attachment write also needs its directory entry flushed. The attachment file is created for the first time, and POSIX only guarantees durability of the new name after the containing directory is synced, even when the file data itself was synced. Without that step a completed paste can leave a durable document reference to an attachment whose name does not survive a power cycle.

## Scope

* `writeAttachment` writes through the existing durable-write helper and flushes the attachments directory before reporting success.
* No IPC channel, document schema, persistence format, data model, or storage layout change.
* Recovery and cleanup behavior is unchanged: an interrupted attachment write can only leave an unreferenced file, which existing cleanup removes.
* Unit tests assert the durability sequence and both flush failure paths.
* An Electron end-to-end test kills the application with `SIGKILL` after a completed paste and verifies the image, persisted reference, and stored bytes survive the restart.
* Update `docs/ARCHITECTURE.md` §13 and §14, `docs/PRODUCT.md` §17, and the guard list in `docs/DEVELOPMENT.md` §9.
* No new dependency.

## Implementation approach

1. Add the failing regression tests first in `src/infrastructure/main/file-services.test.ts`:
   * a successful attachment write opens the final path, writes the bytes, syncs the file, closes it, then syncs the attachments directory and closes that handle;
   * a file-flush failure rejects the write and is propagated to the caller;
   * a directory-flush failure rejects the write instead of reporting success.
   The first test fails before the fix because `open` is never called for an attachment write.
2. Generalize `writeDurableFile` to accept `string | Uint8Array` and use it from `writeAttachment`; remove the now-unused `writeFile` import.
3. Sync the attachments directory after the durable file write, reusing `syncFile`.
4. Add the abrupt-termination Electron test to `e2e/persistence-reliability.spec.ts`: paste an image, wait until the document references it and its bytes are stored, `SIGKILL` the owned Electron process without the quit handshake, relaunch with the same user data directory, and verify the image renders and the stored bytes are unchanged.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk operations: two added `fsync` calls per successful image insertion (attachment file and attachments directory). Image insertion is user-initiated, already triggers one immediate document save with two syncs, and does not scale with document size or edit count. Typing, navigation, idle saves, and cleanup add no writes or syncs. SSD wear is bounded by the number of pasted or imported images.
* CPU on interactive paths: no added work beyond the two flush syscalls on the paste path; no per-keystroke work.
* Memory: unchanged.

The existing `image-insertion-decode` performance scenario measures the full `tree:write-attachment` round trip, including the added flush, and remains the guard; its ceilings are far above the cost of flushing a bounded PNG.

## Validation

* Record the failing regression before the fix and the passing result after.
* Run `npx vitest run src/infrastructure/main`, the isolated Electron persistence-reliability spec, then `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move the same file to `docs/plans/completed/` without copying.
* Commit as `fix(persistence): flush attachment writes before reporting success` with the `Plan: 0058` footer.

## Results

### Implementation

* `writeAttachment` writes through `writeDurableFile`, which now accepts `string | Uint8Array`, and then flushes the attachments directory with `syncFile` before resolving. A file-flush or directory-flush failure rejects the write instead of reporting success. The unused `writeFile` import was removed.
* No IPC channel, document schema, persistence format, data model, or storage layout changed.
* `docs/ARCHITECTURE.md` §13 and §14, `docs/PRODUCT.md` §17, and the guard list in `docs/DEVELOPMENT.md` §9 record the durable-write sequence and the directory flush.

### Tests

* Reproduced before the fix: the three new tests in `src/infrastructure/main/file-services.test.ts` failed against the previous implementation. The flush-sequence test observed no `open`, `sync`, or `close` for an attachment write, and the two flush-failure tests resolved successfully because `writeFile` wrote the final path directly.
* Unit coverage: the flush sequence (`write` → `sync-file` → `close-file` → `sync-directory` → `close-directory`) with stored bytes verified, a file-flush failure that rejects and propagates, and a directory-flush failure that rejects instead of reporting success.
* Real Electron coverage in `e2e/persistence-reliability.spec.ts`: a pasted image whose reference is persisted and whose bytes are stored survives `SIGKILL` of the owned Electron process and a relaunch; the image renders and the stored bytes are unchanged.
* The first `check:full` run exposed a latent race in `e2e/preview.spec.ts` "opens the preview with Cmd+Enter": it pressed the shortcut immediately after pasting without waiting for the attachment to exist on the node, and the added flush latency widened that window. The test now waits for the attached image before pressing the shortcut; the assertion is unchanged. The failure did not reproduce in five isolated runs.

### Performance

* Two added `fsync` calls per successful image insertion (attachment file and attachments directory) on a user-initiated path that already performs one immediate document save with two syncs. Typing, navigation, idle saves, and cleanup are unchanged; cost does not scale with document size or edit count.
* The `image-insertion-decode` performance scenario measures the full `tree:write-attachment` round trip and recorded `smallMs` 5.4 and `largeMs` 5.4 within its existing ceilings. No new guard was required.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, Prettier, documentation governance, 484 unit/component/property tests with coverage (95.46% statements, 89.18% branches, 95.73% functions, 97.5% lines), production build, dependency audit (0 vulnerabilities), 106 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
