# Request Attachment Cleanup When a New Edit Discards the Redo Branch

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and scope

Make the renderer request attachment cleanup when `EditorHistory.begin` discards the redo branch, so attachments that were referenced only by the discarded branch are removed once they are no longer reachable. This is a correction to match `PRODUCT.md` §17; it does not change product behavior. It resolves the `redo-branch cleanup trigger` item left out of scope by plan 0044.

An attachment is defined as unreferenced only after every live document reference, every retained runtime (undo/redo) reference, and every valid recovery-document reference is gone (`docs/PRODUCT.md` §17). Previously, undo/redo snapshots discarded by a new edit released their attachment references, but the store only queued cleanup when the oldest past entry was evicted, so the file leaked until some later reachability change.

## Read before implementation

Read `AGENTS.md`, `docs/PRODUCT.md` §§10, 16–17, and 22, `docs/ARCHITECTURE.md` §§11 and 13, and `docs/DEVELOPMENT.md` §12.

Primary files:

* `src/application/editor-history.ts` (`begin`).
* `src/application/editor-store.ts` (`editContent`, `applyStructural`) for the two call sites that act on the return value.
* `src/application/editor-history.test.ts` and `src/application/editor-store.test.ts`.

## Implementation

* `EditorHistory.begin` previously returned `evicted`, whether the oldest past entry was dropped at the history cap. It now also reports `discardedRedo`, whether a non-empty redo (future) branch was released, and returns the OR of the two. Both transitions release retained attachment summaries and can remove the last reference to an attachment.
* The two store call sites already call `queueAttachmentCleanup()` when `begin` returns true (`EditorStore.editContent`, `EditorStore.applyStructural`), so no store control flow changes are needed.

## Tests

* `editor-history.test.ts`: `begin` reports a reachability change when a new edit discards a non-empty redo branch, and reports no change when there is neither eviction nor a redo branch.
* `editor-store.test.ts` regression: paste an image, undo it so the attachment is retained only by the redo branch, then make a new edit that discards that branch; the next cleanup's keep set no longer contains the attachment. Reproduced against the pre-fix code: the test saw zero cleanup calls after the new edit.
* No boundary wiring, IPC surface, or persisted-schema change, so no new end-to-end test is required. The existing persistence and attachment E2E coverage continues to exercise the boundary.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

* **Disk:** no new writes or syncs. `begin` now requests cleanup on the new-edit path that previously did not request one, so an additional cleanup can run when a new edit discards a redo branch. Each cleanup only unlinks files that the live document, retained history, pending writes, and recovery documents no longer reference, so it cannot add a write and only removes files that are already unreachable. The number of files kept is unchanged or lower.
* **CPU:** `begin` adds one `future.length` read and the OR of two booleans; both are constant time. The extra cleanup scans the live document once (O(N) at N nodes) and reads the history's incrementally maintained reference union (O(A) at A distinct attachments), matching the existing reference-changing cleanup cost.
* **Memory:** no new structures. The change only affects when an existing cleanup is requested.
* **Guards:** the deterministic `editor-store.test.ts` regression asserts the cleanup request count and the keep set, and the `editor-history.test.ts` cases pin the return signal. No timing threshold is added because the defect is a request-count defect, not a latency one.

## Documentation

* Correct `docs/ARCHITECTURE.md` §13 and the matching `docs/decisions/0004-bounded-history-and-autosave-policy.md` list of attachment-cleanup triggers to include discarding the redo branch when a new edit begins.
* Note the new guards in `docs/DEVELOPMENT.md` §12.

## Verification evidence

* Defect-first: the `editor-store.test.ts` regression failed against the pre-fix `editor-history.ts` with zero cleanup calls after the new edit (`expected [] to have a length of 1`) and passes after the fix.
* `npx vitest run src/application/editor-history.test.ts src/application/editor-store.test.ts` passed (93 tests).
* `npm run check:full` passed: type checking, linting, formatting, coverage thresholds, production build, dependency audit, 92 Electron E2E tests, and 8 performance tests. Perf observations stayed within budget (`large-10000` structural 486.13 ms, typing 103.78 ms; `large-10000` attachment history 682.5 ms with cleanup scan 5.41 ms; `large-100000` typing 184.08 ms, paint p95 32.5 ms).

## Execution checklist

* [x] Reproduce the defect with a failing regression test before the fix.
* [x] Make `begin` report the redo-branch discard.
* [x] Add and pass the focused history and store tests.
* [x] Correct the architecture documentation.
* [x] Run `npm run check:full`; fix failures or report environmental blockers.
* [x] Mark this plan Completed, add the completion date, and move it to `docs/plans/completed/`.
* [x] Commit the implementation.
