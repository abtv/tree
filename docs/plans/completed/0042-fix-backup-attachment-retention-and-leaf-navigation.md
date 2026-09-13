# Fix Backup Attachment Retention and Leaf Navigation

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and authorization

Fix the two concrete findings from the repository quality review:

1. Attachment cleanup can delete an image still referenced by the recovery backup, preventing recovery when the primary document is subsequently damaged.
2. A childless node's circular indicator is decorative and cannot be clicked to enter the node, contrary to Product §2.1.

The Product Owner requested this implementation plan after the review for another model to implement. The plan was prepared first; both fixes were subsequently implemented and validated as recorded under "Execution and completion checklist". The work stays within the existing JSON document, backup, attachment, IPC, and application-command architecture.

## Read before implementation

Read `AGENTS.md`, `docs/PRODUCT.md` §§2.1–2.3, 6, 10, 16–17, and 22, `docs/ARCHITECTURE.md` §§8 and 11–14, and `docs/DEVELOPMENT.md`.

Relevant code and tests:

* `src/infrastructure/main/file-services.ts` and its tests: save rotation, recovery, operation queue, and attachment deletion.
* `src/application/editor-store.ts`, `editor-history.ts`, and `persistence-coordinator.ts`: runtime attachment references and cleanup scheduling.
* `src/main/ipc-handlers.test.ts`, `src/preload/index.test.ts`, and `src/infrastructure/renderer/electron-services.test.ts`: persistence boundary contracts.
* `e2e/persistence.spec.ts`, `e2e/persistence-reliability.spec.ts`, and `e2e/fixtures.ts`: real saves, restart, recovery, and owned-process teardown.
* `src/renderer/NodeList.tsx`, `NodeList.test.tsx`, `App.tsx`, `App.test.tsx`, and `styles.css`: circular indicators and existing enter-command wiring.
* `e2e/navigation.spec.ts` and `e2e/drag-and-drop.spec.ts`: navigation and row interaction regressions.

## Fix 1: Preserve attachments needed for recovery

### Evidence and failing regression

`saveDocument` copies the old primary into `document.json.bak`. `cleanupAttachments` only keeps the IDs supplied by the renderer. Those IDs cover the live document, runtime history, and pending writes; the backup is not included. Runtime history disappears on restart, when startup cleanup runs without a save.

Reproduce before changing implementation, using valid PNG bytes and real temporary filesystem storage:

1. Save document A with an image attachment.
2. Save document B without that image. Verify the primary is B and the backup is A.
3. Run cleanup with B's referenced IDs, simulating startup after runtime history is gone.
4. Assert that the backup's attachment still exists. This assertion must fail before the fix.
5. In the isolated fixture only, damage the primary JSON and load again. Assert recovery of A, including its image. The original implementation fails recovery because cleanup removed the image.

The review reproduced the file-service failure, but did not add a committed regression test. The implementing model must add the failing regression itself.

### Implementation approach

* Keep the renderer's cleanup payload unchanged. Recovery-file references belong to main-process file services, which own those files.
* Before unlinking attachments, union the caller's IDs with attachment IDs from existing schema-valid recovery documents (`document.json.bak` and `document.json.tmp`). Read and collect these within the existing serialized filesystem operation, so save rotation cannot race the retention decision.
* Reuse the existing domain parser and attachment-ID collection. Preserve version-one compatibility and existing schema/depth validation. Collect references without reading PNG contents or adding one filesystem check per reference.
* Read all necessary retention information before deleting any attachment. Missing recovery files are normal. Malformed or unsupported recovery JSON contributes no valid reference set and must remain byte-for-byte unchanged. Unexpected filesystem read failures must abort cleanup and propagate through the existing error path, rather than proceeding with an incomplete keep set.
* Preserve existing recovery ordering and safe-load behavior, including rejection of a JSON `null` primary and preservation of invalid recovery candidates. Cleanup must not promote, rewrite, or remove document files.
* Retention lasts while a recovery document references the attachment. After ordinary save rotation removes that reference, a subsequent scheduled cleanup must remove the attachment if the live document, history, and pending writes also no longer reference it. Do not retain an accumulating archive of old IDs.
* Keep the current cleanup scheduling policy. Do not add a save or cleanup on every keystroke or every save. Test eventual release on the next existing cleanup trigger, such as restart, after backup rotation.

### Regression coverage

* File-service tests: backup-only references survive; temporary-only references survive; shared IDs are retained; truly unreferenced files are deleted; rotation followed by cleanup releases obsolete attachments; absent, malformed, unsupported, and unreadable recovery files follow the rules above.
* Exercise queued save/cleanup ordering and assert that a retention-read failure happens before any deletion. Preserve cleanup retry and save-error isolation tests.
* Extend a focused cleanup IPC contract test to assert channel, forwarded IDs, successful return, and error propagation. Run the existing preload and renderer-service contract tests; no new IPC API is needed.
* Add a real Electron regression: paste an image, delete its node, quit, restart to trigger cleanup, verify the backup image survives, close the app without forcing an extra save, damage only the fixture's primary, then restart and verify recovery displays the image. Assert the backup still contains the intended reference before damaging the primary so the test cannot pass against an accidentally rotated backup.
* Update `e2e/persistence.spec.ts`'s existing test named `removes an attachment file after its node is deleted and the app restarts`. Its immediate-deletion expectation conflicts with preserving a referenced backup. Replace it with explicit assertions for retention while referenced and deletion after backup rotation plus a later cleanup; keep the deletion guarantee covered.
* Run existing shutdown success/failure, timeout, retry, duplicate-request, menu-quit, window-close, pending-edit flush, and renderer-unavailability tests. Add new cases only where this fix exposes an uncovered path.

### Documentation

Clarify Product §§16–17 that valid retained recovery documents count as attachment references, and cleanup removes files only after all live, runtime, and recovery references are gone. This is the retention correction needed for the requested recovery fix; do not change the schema, recovery precedence, or autosave policy. Update Architecture §§13–14 with the main-process retention union, queue ordering, and eventual cleanup behavior.

## Fix 2: Make every node indicator enter its node

### Evidence and failing regression

`NodeList.tsx` only renders `.node-disclosure` when `node.children.length > 0`. The leaf bullet comes from `.node-row::before`, and the row has no click handler for navigation. The review confirmed that rendering a leaf produces no enter button, while rendering a parent does.

Add a component regression that finds and clicks a leaf's enter control and asserts `onEnter` receives that leaf. It must fail against the current component before changing implementation.

### Implementation approach

* Render an accessible button for every node's circular indicator, using the existing `onEnter` callback and application commands.
* Preserve the solid 7px bullet for a leaf and the muted outer circle plus solid bullet for a node with children. Use an explicit style modifier for the child-bearing appearance and avoid duplicate bullets from the existing pseudo-element.
* Preserve outline columns, first-line alignment, row spacing, focus/hover appearance, and image alignment. Keep the current-parent heading without a bullet.
* Preserve the existing mouse-down focus handling. Clicking the indicator invokes navigation rather than positioning a caret in the old row. After navigation, normal application focus rules apply: a leaf becomes the editable current parent; a node with children selects its first child.
* Do not add a whole-row navigation click handler. Inline text editing, hyperlink activation, and sibling dragging must keep their current behavior.
* Do not create a child merely by entering a leaf. Entering a leaf at depth 20 remains allowed; creating its child remains rejected under the existing rule.

### Regression coverage

* Component tests for leaf and parent buttons, correct callback targets, accessible names, and distinct presentation states.
* Application/component coverage showing leaf entry changes location and focus without changing document contents or adding undo history; retain existing domain/application navigation tests.
* Real Electron tests that click the visible circular control for both a leaf and a node with children, verify location, displayed nodes, and focus, and verify leaf entry creates no node. Include depth-20 entry and existing child-creation rejection coverage.
* Retain drag-and-drop, hyperlink, wrapping, and keyboard navigation tests. Inspect computed bullet dimensions/appearance in a focused UI test to prevent making every node look like it has children.

Product §2.1 already defines this behavior. Clarify wording only if needed for coverage traceability; do not replace the requirement with the current broken behavior.

## Performance assessment and guards

Required by Product §22.1; results recorded 2026-09-13 during implementation.

* **Disk:** retention adds at most one JSON read per recovery path per scheduled cleanup. The large-recovery-document unit guard asserts cleanup reads exactly `document.json.tmp` and `document.json.bak`, never an attachment path, and retains a referenced file. No document writes, PNG copies, or filesystem syncs are added; cleanup still only reads the directory and unlinks obsolete files. Obsolete images remain only while referenced or awaiting the next cleanup trigger.
* **CPU:** recovery parsing and ID collection cost O(total nodes in the two recovery candidates) per cleanup, in the main process. No work is added to typing or renderer history traversal. The perf state scenario seeds a 10,000-node primary with 100 attachment references, creates a populated backup by rotation, and observes `structuralBurstMs` 495.36, `typingMs` 194.24, `saveCount` 3, and `cleanupScanMs` 5.12 against the existing 1,000 ms cleanup budget. Typing guards observed paint p95 32.7 ms (wide-1,000), 31.6 ms (large-10,000), and 32.3 ms (large-100,000); the 100,000-node wall clock was 176.62 ms against its 1,500 ms budget, consistent with the 32.6 ms baseline.
* **Memory:** recovery candidates are parsed sequentially and only their attachment IDs are retained. The keep set grows with the currently retained recovery documents' attachment count, not the number of historical saves. No unbounded cache is added.
* **UI:** every displayed node renders one indicator button, so DOM grows linearly with the visible node count. The wide-1,000 and 100,000-node guards stayed within their paint and wall-clock budgets. A focused Electron assertion checks the computed leaf (transparent button, 7x7 bullet) and child-bearing (muted outer circle, 7x7 bullet) appearance so leaves cannot be made to look like parents.

Requirement-to-test mapping:

| Product requirement | Unit / component | Electron E2E |
| --- | --- | --- |
| §2.1 every node's circular indicator enters that node | `NodeList.test.tsx`, `App.test.tsx` | `navigation.spec.ts` indicator entry for leaf and parent |
| §2.3 entering a level-20 leaf is allowed; child creation stays rejected | `editor-command-transitions` tests | `persistence.spec.ts` indicator entry at level 20 |
| §16–17 attachments referenced by a retained recovery document survive cleanup and recovery | `file-services.test.ts` retention, rotation release, malformed/unreadable recovery | `persistence.spec.ts` retention through restart and backup recovery |
| §16–17 unreferenced attachments are eventually deleted | `file-services.test.ts` orphan deletion and rotation release | `persistence.spec.ts` deletion after backup rotation |

No domain transforms were added, so new property tests were not required; existing property tests remain green.

## Execution and completion checklist

* [x] Reproduce both issues with failing committed-test candidates before implementation (unit and component regressions failed first).
* [x] Implement recovery attachment retention and eventual release with focused filesystem, IPC contract, and Electron coverage.
* [x] Implement leaf indicator navigation with component and Electron coverage.
* [x] Confirm the new regressions pass; unit and component regressions were observed failing before the implementation.
* [x] Update product/architecture documentation and record performance measurements and requirement-to-test mapping in this plan.
* [x] Run `npm run check:full` on supported macOS with a display; type checking, linting, formatting, coverage, build, audit, 92 Electron E2E tests, and 7 performance tests passed.
* [x] Review the diff for unrelated changes; mark this plan Completed and move this same file to `docs/plans/completed/`.
* [x] Commit the implementation and provide the required validation handoff.

## Baseline and limits

At review time, `npm run check:full` passed: 353 unit/component/property tests, 89 Electron E2E tests, seven performance tests, type checking, linting, formatting, build, and dependency audit (zero vulnerabilities). These passing suites did not cover the two defects above. The approximately 100,000-node typing scenario reported 32.6 ms paint p95 on the review machine; this is a baseline observation, not a new fixed product requirement.

Out of scope: broad refactoring, new dependencies, a new persistence format, backup archives, release packaging, CI setup, changes to recovery precedence, and attempts to reach a numerical review score by increasing coverage alone.
