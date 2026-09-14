# Bounded Save Retries and Read-Only Failure Lock

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

Bound the disk writes caused by failed saves and cleanups, and make an unrecoverable save failure an explicit, view-only state.

The automatic save policy retries a failed save at the idle interval indefinitely, and a failed attachment cleanup triggers full-document saves just to retry an unlink. A permanent failure such as a full disk therefore rewrote the entire document every ten seconds for as long as the application stayed open, working against `docs/PRODUCT.md` §22.1, which requires minimizing writes and syncs to limit SSD wear.

The Product Owner approved this behavior, recorded in `docs/PRODUCT.md` §16.1, §16.2, and §17 and in ADR 0010:

* at most three consecutive document-save attempts (the initial attempt plus two idle-interval retries);
* after the third consecutive failure, the locked save-failure state: no automatic save attempts, all document mutations disabled, navigation, selection, and copy still available, the failure and restart guidance visible;
* quit and window close still attempt a final save; if that fails while locked, an explicit confirmation offers quitting without saving;
* cleanup failures never lock and never trigger document saves; they are retried as cleanup-only attempts at most three times and again on the next save or quit;
* a failed save, including a full disk, never destroys the previously saved document; load opens the newest valid candidate even when promoting it fails.

## Design

### Application layer

* `src/application/save-policy.ts` gains `SAVE_MAX_CONSECUTIVE_FAILURES = 3` and `CLEANUP_MAX_CONSECUTIVE_FAILURES = 3`.
* `PersistenceCoordinator.onResult` reports the failed cycle kind: `onResult(error, 'save' | 'cleanup' | undefined)`. The save catch marks `'save'`; the cleanup catch marks `'cleanup'`. A successful cycle reports `undefined`.
* `EditorStore` tracks `consecutiveSaveFailures`, `consecutiveCleanupFailures`, and `persistenceLocked`.
  * Save failure: increment the save counter, set `saveError`, keep `changesPending`, and schedule the existing idle retry while the counter is below the limit. On reaching the limit, set `persistenceLocked`, cancel the retry timer, and emit.
  * Cleanup failure: increment the cleanup counter, reset the save counter (the save succeeded), set `saveError`, and schedule a cleanup-only retry via `requestAttachmentCleanup()` while below the limit. It never sets `changesPending` and never locks.
  * Success: reset both counters, clear `saveError`, clear `persistenceLocked`, and emit.
  * `markPersistedChange` still marks changes pending while locked but does not schedule an idle save, so navigation cannot start a new write loop.
* Mutation gating in the store: `editContent`, `applyStructural`, `undo`, and `redo` return without effect while locked. Together they cover every document-mutating public command; `copy`, navigation methods, `endTextSession`, and `markNextTextEditStandalone` remain available.
* The store exposes `requestQuitWithoutSavingPrompt()`, `dismissQuitWithoutSavingPrompt()`, and a `quitWithoutSavingPrompt` snapshot flag. `lifecycle.ts` requests the prompt when a quit flush fails while the store is locked, in addition to reporting the error as today.

### Main, preload, and shared boundary

* `QuitHandshake.force()` clears the pending request and timeout, sets `quitting`, and runs the quit callback. `request()` is already a no-op while quitting.
* A new trusted IPC channel `tree:quit-without-saving` calls `force()` and the quit-confirmed callback so `before-quit` no longer prevents quit. The renderer confirmation's confirm button invokes it; cancel dismisses the prompt.
* `src/shared/ipc.ts` and `src/preload/index.ts` expose the new operation with the existing channel-table pattern.

### Renderer

* `App` passes a locked/disabled flag into `NodeInput` so textareas render `readOnly` and linked-text `contentEditable` containers render non-editable; `NodeList` suppresses row dragging while locked. The disclosure button and navigation remain enabled.
* `App` renders the `Saving failed repeatedly...` message while locked and, when the prompt flag is set, the `Quit without saving? ...` confirmation with confirm and cancel actions.
* New user-visible strings live in `src/domain/product-messages.ts` with the exact approved text from `docs/PRODUCT.md` §16.2.

### Load promotion

* `FileServices.load` attempts to promote a recovered candidate to the primary file but ignores a promotion failure, returning the validated value. A full disk can no longer prevent opening a valid generation.

## Files

* `src/application/save-policy.ts`, `editor-store.ts`, `persistence-coordinator.ts` and their tests.
* `src/domain/product-messages.ts`.
* `src/infrastructure/main/file-services.ts` and `file-services.test.ts`.
* `src/main/quit-handshake.ts`, `ipc-handlers.ts`, `bootstrap.ts` and their tests.
* `src/shared/ipc.ts`, `src/preload/index.ts` and tests.
* `src/renderer/App.tsx`, `NodeList.tsx`, `NodeInput.tsx`, `lifecycle.ts` and tests.
* `e2e/persistence-lock.spec.ts` (new) and any updates to `e2e/shutdown-failures.spec.ts`.
* `perf/state.spec.ts` and the perf fixture probe for the byte-volume metric.
* `docs/DEVELOPMENT.md` §12 guard families (one sentence).

## Performance assessment

Required by `docs/PRODUCT.md` §22.1:

* Disk writes and syncs: a permanent save failure now costs at most three full-document writes instead of one every ten seconds; a cleanup-only failure costs zero document writes and at most three cleanup attempts. The success path is unchanged.
* CPU on interactive paths: unchanged. The failure path adds two integer counters and a boolean; mutation gating is a boolean check at the existing command funnels.
* Memory: constant. Two counters and one flag; no document-sized structure is retained.
* Guard: `perf/state.spec.ts` records a new `documentBytesWritten` metric (the summed on-disk document size after each successful save in the scenario) with a measured ceiling; the e2e lock scenario asserts real save attempts stop after the third failure.

## Testing

* Unit (`editor-store.test.ts`, fake clock): three-failure lock; no further automatic attempts; navigation marks changes pending without scheduling a save; success resets counters and unlocks; cleanup failures retry cleanup alone, never lock, and never mark changes pending; mutation commands are rejected while locked while copy and navigation still work; quit-flush still attempts a save while locked.
* Unit (`persistence-coordinator.test.ts`): `onResult` reports save vs cleanup failures.
* Unit (`file-services.test.ts`): a failed promotion rename during load still returns the recovered candidate; a failed save still leaves the previous document loadable (existing partial-write regression stays).
* Boundary (`quit-handshake.test.ts`, `ipc-handlers.test.ts`, `bootstrap.test.ts`, preload tests): forced quit clears the pending request, is idempotent, and quits; the new channel is trusted-renderer only and confirms the quit.
* Renderer (`App.test.tsx`, `lifecycle.test.ts`): locked rendering disables inputs, keeps navigation, and shows the message; quit failure while locked requests the confirmation; confirm and cancel call the right operations.
* Electron (`e2e/persistence-lock.spec.ts`): with a test-injected save failure, assert the lock UI, the frozen document, and that save attempts stop after three; restore saving and quit to persist; and separately confirm quitting without saving after the lock, then relaunch and verify the previous version opens.
* Run `npm run check:full`.
* Regenerate `docs/plans/README.md` with `npm run plan:index`, mark this plan Completed, and move it to `docs/plans/completed/` without copying.

## Results

### Implementation

* `EditorStore` tracks consecutive save and cleanup failures, a `persistenceLocked` snapshot flag, and a `quitWithoutSavingPrompt` flag. Three consecutive document-save failures set the lock, cancel the retry timer, stop scheduling saves, and call `PersistenceCoordinator.discardPendingSaves()` so a save request already queued while the third failure was in flight cannot produce a fourth write. A pending cleanup is preserved. Navigation still marks changes pending but never schedules one. A successful save resets both counters and clears both flags.
* Mutating commands (`editContent`, `applyStructural`, `undo`, `redo`, `cut`, `paste`, `deleteLink`, structural commands) are rejected at the store; copy, selection, and navigation stay available. `App` renders textareas read-only and linked-text containers non-editable, and `NodeList` disables row dragging while locked.
* `QuitWithoutSavingPrompt` moves focus to Cancel when it opens, keeps Tab focus inside the dialog, cancels on Escape, and restores the previously focused element when it closes.
* `PersistenceCoordinator.onResult(error, kind)` reports `'save'` or `'cleanup'`. Cleanup failures retry cleanup alone at the idle interval for at most three consecutive failures and never mark document changes pending or lock the editor. A retained save error re-reported on a cleanup-only cycle does not consume the save-failure budget again.
* `QuitHandshake.force()` plus the trusted `tree:quit-without-saving` channel bypasses the flush for the explicit confirmation. `startRendererLifecycle` requests the prompt when a quit flush fails while locked.
* `FileServices.load` promotes a recovered candidate best-effort, so a failing rename cannot block opening a valid document.
* The plan's original wording said the lock follows "the initial attempt and two idle-interval retries". Implementation and the e2e test showed that once the inserted-word volume crosses the threshold, every further change requests an immediate save, so three failures can occur within a few more keystrokes. `docs/PRODUCT.md` §16.2 and ADR 0010 were reworded to state three consecutive failed attempts without prescribing the interval.

### Tests

* `editor-store.test.ts`: lock after three failed saves with no further attempts, frozen document, navigation allowed; mutation rejection with copy still working; cleanup-only retries that never save or lock and recover; quit flush attempting a save while locked and unlocking on success; failure-counter reset; prompt request/dismiss only while locked; and a regression proving a save request queued before the third failure does not run after the lock.
* `editor-store.property.test.ts`: the save-accounting generator now allows at most two failure events so the property stays in the watermark-accounting regime; lock behavior is covered by deterministic tests.
* `persistence-coordinator.test.ts`: save-vs-cleanup failure kinds, including the retained-save-error cleanup cycle; `discardPendingSaves` drops a queued save, preserves a queued cleanup, and clears the queue when no cleanup is pending.
* `file-services.test.ts`: a valid recovered candidate loads when the promotion rename fails.
* `quit-handshake.test.ts`, `ipc-handlers.test.ts`, `preload/index.test.ts`: forced quit clears the pending request and is idempotent; the new channel is trusted-renderer only and confirms the quit; the preload forwards it.
* `App.test.tsx`, `lifecycle.test.ts`: locked rendering disables inputs, keeps navigation, and shows the message; the confirmation focuses Cancel, traps Tab, cancels on Escape, restores focus, and calls `quitWithoutSaving` on confirm.
* `e2e/persistence-lock.spec.ts`: three real save attempts stop the retry loop and the input is read-only; after restoring saving, quit persists the frozen document; a separate test confirms quitting without saving while locked and verifies the previous version opens and is editable after restart.

### Performance

* `perf/state.spec.ts` records `documentBytesWritten` from the save payloads: 4,721,876 bytes for 4 saves in `large-10000` against the new 20,000,000-byte ceiling.
* Existing perf metrics were unchanged; typing paint p95 remained 31.7–32.6 ms and the state cleanup scan 29.43 ms.
* A permanent save failure now costs at most three document writes, and a cleanup-only failure costs no document writes.

### Validation

* `npm run check:full` passed on macOS with a display: type checking, linting, formatting, documentation governance, 505 unit/component/property tests with coverage (95.2% statements, 88.63% branches, 95.71% functions, 97.71% lines), production build, dependency audit with zero vulnerabilities, 113 Electron E2E tests, and 14 performance tests. No required test was skipped and no validation failure remains.
