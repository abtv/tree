# Fix Autosave Trigger Defects

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and scope

Fix two implementation defects in the renderer's automatic-save triggers that contradict existing product requirements. This is a correction to match `docs/PRODUCT.md`; it does not change product behavior.

1. Typing before an existing hyperlink triggers an immediate save on every keystroke.
2. The inserted-word counter is discarded when a save is requested, so a failed save resets the ten-word volume threshold.

Both defects were reproduced before implementation with temporary tests that failed against `06e9897`. The fix stays inside the existing domain/application boundary and does not change the persisted schema, IPC surface, or autosave policy.

## Read before implementation

Read `AGENTS.md`, `docs/PRODUCT.md` §§10, 16–17, and 22, `docs/ARCHITECTURE.md` §13, and `docs/DEVELOPMENT.md` §12.

Primary files:

* `src/application/editor-store.ts` (`hasNewLink`, `noteChange`, `requestPolicySave`, `handlePersistenceResult`).
* `src/application/editor-store.test.ts`.
* `src/renderer/editor-dom.ts` (`readEditableContent`) for the offset behavior that causes defect 1.

## Defect 1: typing before an existing hyperlink saves every keystroke

### Evidence

`editContent` computes `hasNewLink(node.links, links)` (`src/application/editor-store.ts:199`) and `noteChange` requests an immediate save when it returns true (`src/application/editor-store.ts:506-513`). `hasNewLink` compares links by absolute `start`/`end` (`src/application/editor-store.ts:609-617`). `readEditableContent` recomputes ranges from the live DOM (`src/renderer/editor-dom.ts:19-38`), so inserting one character before a link shifts its range by one and is misread as a newly inserted link. Product §16.1 lists only hyperlink insertion as an immediate trigger and explicitly says the application does not save on every keystroke; §22.1 requires minimizing disk writes and syncs.

Reproduction against `06e9897`: editing `https://example.com` into `xhttps://example.com` with the link shifted from `{0,19}` to `{1,20}` produced one save where zero saves are expected.

### Implementation

* Detect a genuinely new hyperlink by comparing URL occurrences rather than absolute offsets. A shifted existing link keeps the same URL and is not new; an inserted link adds a URL occurrence.
* Preserve the existing behavior that a newly inserted link triggers an immediate save.

## Defect 2: inserted-word count is lost across a failed save

### Evidence

`requestPolicySave` zeroes `insertedWordsSinceSave` before the queued save resolves (`src/application/editor-store.ts:526`). `handlePersistenceResult` re-marks pending changes and reschedules an idle retry after a failure but does not restore the count (`src/application/editor-store.ts:552-563`). Product §16.1 measures the ten-word trigger against the last successful save.

Reproduction against `06e9897`: after a failed save with three pending words, inserting seven more words (ten since the last successful save) did not trigger the immediate save; the count had been reset to zero.

### Implementation

* Track the words covered by an outstanding save request separately, and fold them back into `insertedWordsSinceSave` when the save fails. Clear the outstanding count when a save succeeds.
* Keep the existing volume trigger: while the restored count is at or above the threshold, a later edit retries the save, and the idle interval remains a second retry path.
* Accumulate the outstanding count if a save is requested again before the previous request resolves, so no words are dropped.

## Tests

* `editor-store.test.ts`: editing text before an existing hyperlink does not request a save, while inserting a new hyperlink still saves immediately.
* `editor-store.test.ts`: after a save fails with pending inserted words, reaching ten words since the last successful save triggers the immediate save; the retry path still works.
* Keep the existing "does not save on every keystroke and saves when ten words have been inserted" and failed-save-retry tests green.
* No boundary wiring changes, so no new end-to-end test is required. The existing persistence E2E coverage (rapid edits, restart persistence, save-failure surfacing) continues to exercise the boundary.

## Performance assessment

Required by Product §22.1.

* **Disk:** the hyperlink fix removes a durable write and filesystem sync per keystroke while editing before a link; it cannot add writes. The word-counter fix only changes when an existing volume trigger requests a save; it does not add save triggers or writes. The number of writes for normal editing is unchanged or lower.
* **CPU:** `hasNewLink` now builds two small maps over the node's links instead of a nested scan; both are O(number of links in the node), unchanged in scale. The counter changes are constant-time bookkeeping.
* **Memory:** one number and one accumulated number per store. No new persistent or unbounded structure.
* **Guards:** the new deterministic save-count tests are the regression guards; no timing-based guard is added because the defect is a request-count defect, not a latency threshold.

## Documentation

Update `docs/DEVELOPMENT.md` §12 to describe the hyperlink-edit save guard and the failed-save word-count guard alongside the existing autosave tests. No product or architecture change.

## Verification evidence

* Defect-first: against the pre-fix `editor-store.ts`, the two new regression tests failed (`does not save when typing before an existing hyperlink shifts its range` saw 1 save instead of 0; `counts inserted words since the last successful save across a failed save` saw 0 saves instead of 1). The new-link test passed before and after.
* An intermediate implementation used threshold-crossing detection and passed unit tests but failed two Electron tests (`e2e/persistence-reliability.spec.ts:120`, `e2e/shutdown-failures.spec.ts:17`) because it suppressed the volume-triggered retry after a failure. The final implementation keeps the volume trigger active while the restored count is at or above the threshold; both specs pass.
* `npm run check:full` passed: type checking, linting, formatting, coverage thresholds, production build, dependency audit, 92 Electron E2E tests, and 8 performance tests. Perf observations stayed within budget (`large-10000` structural 508.26 ms, typing 196.28 ms; `large-100000` typing 181.73 ms, paint p95 32.3 ms).

## Execution checklist

* [x] Reproduce both defects with failing tests before the fix.
* [x] Fix `hasNewLink` link identity and the word-counter lifecycle.
* [x] Add and pass the regression tests.
* [x] Update the development guide.
* [x] Run `npm run check:full`; fix failures or report environmental blockers.
* [x] Mark this plan Completed, add the completion date, and move it to `docs/plans/completed/`.
* [x] Commit the implementation.

Out of scope: product-policy changes, the stale architecture schema example, the redo-branch cleanup trigger, the `load` queue ordering, and the drag-and-drop stash.
