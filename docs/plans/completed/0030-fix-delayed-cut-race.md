# Fix Delayed Cut Race

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal and Handoff

Fix review finding P2: an asynchronous cut must never remove text different from the selection copied to the clipboard because the document changed while the clipboard write was pending.

The Product Owner requested this plan for another model to implement. The plan was prepared first; the P2 implementation, tests, and validation results are recorded under "Results" below. Baseline commit: `6f267dd` (the amended persistence-recovery and shutdown fix, including P1).

Read `AGENTS.md`, Product sections 10, 13.1, and 16, Architecture sections 7, 11, 13, and 15, and the development guide before implementation. Preserve the completed P1 fix and plan 0029. The Product Owner explicitly requested this separate active plan in the existing session.

## Confirmed Defect

`EditorStore.cut` in `src/application/editor-store.ts` captures a clipboard payload and selection offsets, awaits `services.writeClipboard`, and then passes those original offsets to `removeTextRange` against the latest document. It checks the selected node ID but does not check whether that node's content changed.

The review reproduced this against the actual application module with a deferred clipboard-service promise:

1. Initialize the editor and set the root text to `abc`.
2. Call `cut(rootId, 1, 2)` without awaiting completion. The clipboard payload contains `b`.
3. While the clipboard promise is pending, call `editText(rootId, 'Xabc')`.
4. Resolve the clipboard promise and await the cut.
5. Actual result: `Xbc`. The operation copied `b` but deleted `a`.

This was an application-level diagnostic, not an Electron reproduction or a committed regression test. Reproduce it in automated tests before changing production code.

## Product Decision Before Implementing the Conflict Path

The existing requirements define cutting selected text and waiting for pending cuts during quit, but do not specify conflict behavior when the same node changes during a pending cut. Do not silently choose a new UX policy.

Recommended proposal for Product Owner approval: if the target content changed before the clipboard write completes, preserve the current document and report an operation error explaining that the cut could not finish because the text changed. The clipboard may already contain the original selection; do not attempt to restore an old system clipboard value. For the reproduction above, the document remains `Xabc` and the clipboard contains `b`.

An alternative is to track and transform the original range across intervening edits so the result is `Xac`. This requires more machinery and explicit rules for replacements, deletions, undo, and repeated text. Do not implement range rebasing or freeze editing without approval.

The next agent should confirm the conflict policy with the Product Owner, then document the approved behavior in Product section 13.1. Tests reproducing deletion of unrelated text and inspection of existing boundary coverage can proceed before that answer. Creating this plan does not approve the recommended policy.

## Scope and Constraints

* Keep orchestration in the application layer and text transformations in the domain. React handlers continue dispatching store commands.
* Preserve the schema, persistence model, stable IDs, attachment references, IPC API, and existing application-scoped clipboard shortcuts.
* Preserve the normal cut payload, including hyperlink metadata, and successful cut behavior when no conflict occurs.
* Preserve failure safety: a failed clipboard write must not delete text.
* Retain `pendingEdits`, `pendingClipboardOperation`, and shutdown flushing from plan 0029. A cut must remain tracked until it completes or fails.
* Keep this focused on delayed cuts. Do not redesign copy/paste ordering, add dependencies, or refactor unrelated editor behavior.

## Implementation Approach After Policy Approval

1. Add the deferred-promise regression to `src/application/editor-store.test.ts` and confirm it fails on the baseline.
2. Capture the target content or an appropriate runtime revision when the cut begins. Validate it after the clipboard write and before applying removal to the current document.
3. Choose a simple guard consistent with the approved semantics. A whole-document identity comparison would reject unrelated-node changes unnecessarily. A text-only comparison overlooks link metadata changes. Comparing the selected substring alone cannot prove it is still the original range when text repeats. If introducing runtime revision tracking, keep it out of persisted data and document its invalidation rules.
4. Preserve the existing checks for editor readiness and selected node identity. Explicitly test node deletion, navigation, and undo/redo during the wait so a stale operation cannot target a replacement node or restored state accidentally.
5. On conflict, follow the approved error/return behavior without applying a stale removal, adding a cut history entry, scheduling a cut save, or changing focus. Do not roll back intervening edits.
6. Verify text-edit session boundaries: typing, cut, and subsequent typing must obey Product section 10. A successful cut is a separate undoable operation; a cancelled cut must not manufacture an undo entry.
7. Review promise cleanup on success, cancellation, and rejection. Ensure immediate paste following a cut and quit during a pending cut still behave correctly.

## Tests and Boundary Coverage

### Application and property tests

Use explicit deferred promises rather than sleeps. Cover:

* Successful delayed cut without intervening changes: correct text and HTML payload, exact removal, focus, and undo/redo.
* The confirmed prefix-insertion race and edits within the original range, using the approved conflict result.
* Target deletion, selection moving to another node, and undo/redo before completion.
* An unrelated-node edit while the target content remains valid.
* Clipboard rejection: current text survives, errors propagate, and operation tracking settles.
* `flushPersistence()` started while a cut is pending: success waits for the resulting save; a rejected pending operation prevents quit acknowledgment. Preserve the existing retry behavior.

Extend `src/application/editor-store.property.test.ts` with a focused property for delayed cuts and generated intervening edits. Under the recommended cancellation policy, conflicting content must remain unchanged by cut completion, IDs and locations stay valid, and cancellation creates no new history entry. Include the normal successful-cut undo/redo invariant. The current generated command sequence does not include cuts; avoid assuming it already covers this rule.

### Contract tests

Inspect `src/main/ipc-handlers.test.ts`, `src/preload/index.test.ts`, `src/infrastructure/renderer/electron-services.test.ts`, and `src/renderer/lifecycle.test.ts`. Retain or extend focused coverage for clipboard channel names, text/HTML argument forwarding, return values, rejection propagation, and quit acknowledgment ordering. Types alone are insufficient. Do not add redundant mocks where an existing contract test already proves the unchanged contract.

### Real Electron regression

Add a deterministic scenario in `e2e/clipboard.spec.ts` or `e2e/persistence-reliability.spec.ts`:

1. Launch through the owned-process fixture and enter known text.
2. Wrap the registered `tree:write-clipboard` handler with a gate, retaining the original handler so release still exercises real validation and the native clipboard. Use the attachment gate in `e2e/persistence-reliability.spec.ts` as the pattern.
3. Select `b`, invoke `Cmd+X`, and confirm the write has started. Suppress the native cut event as in existing editing tests so the test proves application-owned command handling.
4. Edit the same node while the gate is held, then release it.
5. Assert the approved document result, clipboard payload, and any expected operation error. Whitelist only the exact expected error using the existing fixture helper.
6. Verify persistence after a normal quit and restart. Inspect existing pending-cut lifecycle coverage and add a quit-during-cut scenario if the changed path lacks real boundary coverage.

Keep teardown bounded and scoped to fixture-owned Electron processes. A launch failure requires checking stale owned processes and macOS crash dialogs, then rerunning the isolated failure after cleanup. When waiting for initial persistence, use a bounded assertion retry that also retries `ENOENT`; `expect.poll` callbacks that throw on a missing file failed during the P1 session.

## Validation and Completion

* Record failing regressions before the fix and passing results afterward. When practical, bypass the guard temporarily and confirm the regression fails again, then restore it.
* Run focused application, property, contract, and Electron tests for the changed paths.
* Run `npm run check:full` before the implementation commit. It requires macOS with a display and registry access for the audit. Do not count blocked or skipped boundary tests as passing.
* Baseline full validation passed at `6f267dd`: 248 unit/component/property tests, 87 Electron E2E tests, five performance tests, and zero audit vulnerabilities. P2 remains unresolved despite that baseline.
* Update product documentation for the approved conflict policy and architecture documentation only if new runtime coordination warrants it.
* Record results in this plan, set `Status: Completed`, add the completion date, and move this same file to `docs/plans/completed/` without changing its filename.
* Commit the P2 implementation as its own logical task, respecting the repository's Git rules and the actual HEAD at implementation time. Preserve unrelated user changes, including this prepared plan.

## Results

### Product decision

The Product Owner approved the recommended conflict policy: when the target content changes while the clipboard write is pending, preserve the intervening edits, do not remove any text, and report an operation error. Product section 13.1 now documents this behavior. No range rebasing or editing freeze was implemented.

### Implementation

* `EditorStore.cut` now captures the target node's text and hyperlink ranges when the cut begins, ends the active text-editing session, and validates that content after the clipboard write resolves. If the target node was deleted or the selection moved, the cut is abandoned silently as before. If the target content changed, the cut reports `The cut could not finish because the text changed.` and does not apply the removal, add a history entry, schedule a cut save, or change focus.
* Unrelated-node edits do not cancel a valid delayed cut because only the target node's content is compared.
* Ending the text session at cut start keeps a successful cut as its own undoable operation, separate from preceding and following typing, per Product section 10.

### Tests

* The application regression reproduced the defect against the baseline (`Xbc` from copied `b` deleting `a`) and passes after the fix. Bypassing the guard reproduced the failure again at both the unit and real Electron levels.
* Added application coverage for a successful delayed cut (payload, removal, focus, undo/redo), the confirmed conflict, deletion and selection changes during the wait, an undo returning identical content, an unrelated-node edit, and the cut/session undo boundary.
* Extended `editor-store.property.test.ts` with a delayed-cut property over generated original and intervening content, asserting that conflicting content is never removed, IDs and locations stay valid, undo/redo behave, and no cut history entry is created.
* Existing clipboard contract coverage already proves channel names, text/HTML forwarding, and rejection propagation at the preload, renderer-service, and native clipboard layers, so no redundant mocks were added. The new Electron regression wraps the real `tree:write-clipboard` handler, suppresses the native cut event, and verifies the document, clipboard payload, operation error, and quit persistence.

### Validation

`npm run check:full` passed: type checking, linting, formatting, 255 unit/component/property tests, production build, dependency audit with zero vulnerabilities, 88 Electron E2E tests, and five performance tests. No required tests were skipped and no validation failures remain.
