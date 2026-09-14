# Fix Quit Flush Race

Status: Completed
Created: 2026-09-14
Completed: 2026-09-14

## Goal

A normal quit must not confirm shutdown while document changes are still pending. Today, `EditorStore.flushPersistence` can resolve successfully even though ordinary typing that happened while an in-flight save was pending was never persisted. This plan fixes the race, adds an application-layer regression test, and adds a real Electron shutdown regression that proves the typed text survives the quit.

## Confirmed Defect

`EditorStore.flushPersistence` in `src/application/editor-store.ts` loops while asynchronous edits (`pendingEdits`) remain, but it does not re-check ordinary document changes after awaiting the save. `changesPending` is only converted into a save request before `PersistenceCoordinator.flush()` is awaited.

Reproduced against the application module with a delayed save:

1. Load an editor and type `before quit`.
2. Call `flushPersistence()` and hold the resulting save pending.
3. Type `typed while quit save pending` while that save is in flight.
4. Release the save and await the flush.

Actual result: the flush resolves successfully, `src/renderer/lifecycle.ts` confirms shutdown, and the persisted document contains only `before quit`. The typing sets `changesPending` and schedules an idle save, but the loop condition only checks `pendingEdits`, so the flush never requests the save for the new text.

This is an application-layer diagnostic. Reproduce it in automated tests before changing production code.

## Scope

* Keep the fix in `EditorStore.flushPersistence`; the persistence coordinator queue contract and the renderer lifecycle flow are unchanged.
* Do not change the product save policy, document schema, persistence format, or IPC API.
* No product behavior change is intended: `docs/PRODUCT.md` §16.1 already requires every pending change to be flushed before a normal quit completes. The fix makes the implementation match the existing requirement.
* Preserve existing failure semantics: a failed save or cleanup must still reject the flush, keep the error visible, and block quit until a later attempt succeeds.

## Implementation Approach

1. Add the delayed-save regression to `src/application/editor-store.test.ts` and confirm it fails on the current implementation.
2. Change the `flushPersistence` loop so it repeats after `PersistenceCoordinator.flush()` whenever ordinary document changes are still pending, not only while asynchronous edits remain. Re-check both `changesPending` and `pendingEdits.size` after the awaited flush.
3. Keep the loop bounded by real progress: each iteration requests a save only when `changesPending` is set, and the main-process quit handshake still bounds the total wait and reports a timeout failure.
4. Add a real Electron regression in `e2e/shutdown-failures.spec.ts`: hold the first `tree:save` invocation, request quit, type while the save is held, release it, and assert the persisted document contains the text typed during the quit save.

## Performance Assessment

Required by `docs/PRODUCT.md` §22.1 for state and persistence changes:

* Disk operations: the change can issue one additional save, and only during a quit flush when new document changes arrive while a save is in flight. Steady-state autosave frequency is unchanged; the extra write is the minimum needed to avoid losing the pending change. The main-process quit timeout still bounds the total wait.
* CPU on interactive paths: none. The only added work is a boolean and set-size check after each awaited flush; typing, navigation, and commands are untouched.
* Memory: no new state. The loop reuses the existing `changesPending` flag and `pendingEdits` set, so memory does not grow with document size or edit count.

No new automated performance guard is required because the change cannot affect behavior at scale; the existing performance suite remains the guard for interactive and persistence paths.

## Tests and Boundary Coverage

### Application tests

* Regression: typing during an in-flight quit save must keep the flush unresolved and produce a second save whose serialized state contains the typed text.
* Keep the existing flush coverage: queued persistence waits, pending clipboard/attachment operations, failed attachment writes, cleanup failures, and save-error retention must behave as before.

### Real Electron shutdown test

Add a deterministic scenario using the owned-process fixture and the test-owned `tree:save` wrapper:

1. Launch the production build and wait for the initial save to exist before installing the wrapper.
2. Wrap the real `tree:save` handler so the first invocation waits on a test-controlled gate; later invocations delegate to the original handler.
3. Type text below the volume threshold, then request application-menu quit.
4. Wait until the gated save has started, type additional text, then release the gate.
5. Wait for the application to close and assert the persisted document contains both the text typed before quit and the text typed while the quit save was in flight.

No renderer save or operation errors are expected, so the fixture's error observer must stay clean.

## Validation and Completion

* Record the failing regression before the fix and the passing result afterward.
* Run the focused application test and the isolated Electron test, then `npm run check:full` before the implementation commit.
* Update `docs/DEVELOPMENT.md` guard inventory if the new guard family is not already represented.
* Record the results in this plan, set `Status: Completed`, add the completion date, and move this same file to `docs/plans/completed/` without changing its filename.
* Commit as `fix(application): flush edits typed during a pending quit save` with the `Plan: 0053` footer.

## Results

### Implementation

* `EditorStore.flushPersistence` now repeats its await cycle while either asynchronous edits remain or ordinary document changes are pending. Text typed while a save is in flight causes a follow-up save instead of a successful flush. Save and cleanup failures still reject the flush, so the existing error surface, retry behavior, and quit blocking are unchanged.
* `docs/DEVELOPMENT.md` now lists quit-time flushing in the behavioral guard inventory.

### Tests

* The application regression holds the first save, types during the flush, and asserts the flush stays unresolved until a second save serializes the typed text. It failed on the previous implementation (`flushed` became true with changes pending) and passes after the fix.
* The real Electron regression in `e2e/shutdown-failures.spec.ts` gates the first `tree:save` invocation, requests application-menu quit, types while the save is held, releases it, and asserts the persisted document contains both the text typed before quit and the text typed while the quit save was in flight. It reproduced the loss on the previous build (persisted `before quit`) and passes after the fix.
* Existing flush, save-failure, timeout, retry, duplicate-request, window-close, and renderer-unavailability coverage is unchanged and still passes.

### Performance

* No interactive-path or memory changes; the only added work is a pending-change check after each awaited flush. During quit, at most one additional save is issued when changes arrive while a save is in flight, and the main-process handshake timeout still bounds the wait. No new performance guard was required.

### Validation

* `npm run check:full` passed: type checking, linting, formatting, documentation governance, 445 unit/component/property tests with coverage (96.59% statements, 89.89% branches, 96.71% functions, 98.55% lines), production build, dependency audit with zero vulnerabilities, 98 Electron E2E tests, and nine performance tests. No required tests were skipped and no validation failures remain.
* The documentation check reports the pre-existing plan-numbering warning (missing `0011`); it is unrelated to this change and no plan is missing or duplicated.
