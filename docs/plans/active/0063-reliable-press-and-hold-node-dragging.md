# Reliable Press-and-Hold Node Dragging

Status: Active
Created: 2026-09-19

## Goal

Make mouse interaction over editable node rows reliably distinguish text editing from node movement.

The current row-level native HTML drag behavior competes with the editable text surface: the browser decides whether a gesture edits text, selects text, or begins a native drag. As a result, dragging from the broad row surface does not always start even though the row is marked `draggable`.

The Product Owner approved this replacement interaction:

* pressing and releasing normally places the text caret at the clicked position;
* pressing and holding the primary mouse button for 400 ms enters drag mode;
* movement before the hold threshold does not start a drag;
* small incidental pointer movement does not cancel the pending hold;
* when drag mode activates, the cursor changes to `grabbing` and text selection/caret movement stops;
* movement in drag mode chooses a sibling drop position, and release completes the move;
* release in drag mode without changing the position leaves the document unchanged;
* `Escape` cancels an active drag;
* the circular indicator remains a dedicated control for entering the node rather than placing a caret or beginning a row drag.

This changes user-visible behavior in `docs/PRODUCT.md` §2.1 and §11. Update those sections before implementing the interaction. It does not change the tree model, persistence model, or application/domain command used to reorder siblings.

## Design

### Interaction state machine

Replace the node row's native `draggable` interaction with an explicit primary-pointer state machine owned by the renderer:

```text
idle
  └─ primary pointer down on editable row surface → pending hold
pending hold
  ├─ pointer up before 400 ms → native editing click/caret behavior
  ├─ pointer leaves or interaction becomes invalid → idle
  └─ 400 ms elapses while still pressed → dragging
dragging
  ├─ pointer move → update sibling insertion target
  ├─ pointer up → move when the insertion position changes; then idle
  └─ Escape / pointer cancellation → cancel without moving; then idle
```

Only the primary mouse button can start the gesture. Secondary clicks and unsupported pointer types retain their native behavior. The implementation must ignore duplicate pointer-down events while a gesture is pending or active.

Use pointer capture once drag mode activates so release and cancellation are observed even when the pointer leaves the row or window content. Release capture and remove timers/listeners on every completion path and when the row unmounts. A pending hold that leaves the eligible row surface before activation is cancelled. Pointer movement before 400 ms never promotes the gesture early, but movement by itself does not cancel an otherwise eligible hold; if the primary button remains pressed on the row, drag mode activates when the threshold elapses.

Keep the state machine and drop-target calculation in renderer utilities that can be unit-tested without document mutation. React components translate the resulting insertion index into the existing `onMove(nodeId, insertionIndex)` application command; they must not implement sibling reordering themselves.

### Editing and drag affordances

Do not set `draggable` on the row or editable child. Before activation, allow the browser's normal editable-surface event sequence so a quick click places the caret at the exact clicked character. Do not move focus or reset the caret merely because a hold is pending.

When the hold activates:

* suppress the click that would otherwise follow the drag gesture;
* clear any transient text selection created by incidental movement without changing the store's persisted document state;
* add an active-drag class to the source row and apply `cursor: grabbing` to the row and its editable surface;
* retain the existing subtle gray source-row highlight;
* expose the current between-row drop target visually using the existing drop-zone layout;
* keep the drag cursor active until completion or cancellation, including when the pointer is over a drop zone.

The previous hover-delay `grab` cursor is removed. The cursor should stay text-like while merely hovering because drag intent is now communicated only after a deliberate hold. Locked/read-only rows cannot enter the pending or dragging states.

The disclosure button is excluded from the row gesture. Its existing click behavior, focus behavior, and pointer cursor remain unchanged.

### Drop targeting and windowed lists

Reuse the existing insertion-index semantics and the current before/after midpoint rule: the top half of a row targets the position before it and the bottom half targets the position after it. Preserve the expanded first and last drop targets and the rule that there is no drop-inside-node target.

Move drag-over hit testing out of native `DragEvent.dataTransfer` handling. Resolve the insertion position from pointer coordinates and rendered row/drop-zone metadata. The calculation must continue to work for:

* ordinary fully rendered sibling lists;
* leading and trailing spacers in a windowed list;
* the pinned focused row without creating a duplicate target;
* wrapped rows with measured heights;
* page auto-scroll near the viewport edges.

Auto-scroll runs only during active drag mode. As scrolling changes mounted rows and geometry, recompute the target from the latest pointer position. Dropping onto the node's effective current position is a no-op and must not create history or schedule persistence.

### Accessibility and cancellation

This plan does not replace or remove keyboard editing and reordering behavior. Pointer drag state is transient UI state and is not announced as a document mutation until a move is committed.

Cancel without moving on `Escape`, `pointercancel`, lost pointer capture, component unmount, navigation that removes the source row, or application lock activation. Cancellation clears the source highlight, drop indicator, timer, cursor state, and auto-scroll state. Window blur should follow the same safe cancellation path so a stuck button state cannot leave the editor appearing to drag.

## Files

Expected implementation surface:

* `docs/PRODUCT.md` §2.1 and §11 for the approved click-versus-hold behavior and cursor/cancellation rules.
* `src/renderer/NodeList.tsx` for pointer-event wiring, transient drag rendering, drop commitment, and integration with windowing/auto-scroll.
* A small renderer utility such as `src/renderer/node-drag.ts` for the interaction transition rules and coordinate-to-insertion-index calculation.
* `src/renderer/styles.css` for pending/active cursor and drop-target presentation.
* `src/renderer/NodeList.test.tsx` and the new utility's unit tests.
* `src/renderer/App.test.tsx` where the application command handoff or locked state needs integration coverage.
* An Electron test such as `e2e/drag-and-drop.spec.ts` for real pointer timing, caret placement, cancellation, and sibling movement.

Use the actual dependency graph found during implementation; do not introduce application/domain changes unless a failing regression proves they are necessary.

## Defect-first workflow

Before changing the implementation:

1. Reproduce the unreliable conflict using real Electron pointer input on an editable row, including a row that already has focus.
2. Add a failing regression that demonstrates the required distinction: a quick click places the caret, while holding for the threshold and then moving reorders the node.
3. Add focused component/unit tests for deterministic timing and state transitions.
4. Replace the native drag path and confirm the original regression passes.
5. When practical, bypass or revert the activation change temporarily and confirm the regression fails for the original reason.

## Testing

### Pure/unit and component coverage

Use fake timers for hold timing and cover:

* primary press plus release before 400 ms never enters drag mode and does not call `onMove`;
* activation occurs at 400 ms, not before it;
* pre-threshold movement never starts dragging early and an eligible held gesture still activates at 400 ms;
* a secondary button and excluded disclosure control never arm dragging;
* active movement selects before/after insertion indices at row midpoints and supports edge drop zones;
* release commits exactly one move only when the effective position changed;
* release without movement and a same-position target are no-ops;
* `Escape`, pointer cancellation, lost capture, blur, lock activation, and unmount clean up without moving;
* the source highlight, `grabbing` cursor, and drop indicator appear only during active drag mode;
* the post-drag click is suppressed, while an ordinary click retains editable caret behavior;
* auto-scroll starts only during active dragging, updates targeting after scrolling, and stops on every exit path;
* windowed spacer and pinned-row targeting produce valid, non-duplicated insertion positions.

Keep the existing store/domain move tests because they cover sibling identity, subtree movement, selection, undo, and persistence. This renderer-only interaction change does not require a new domain property test unless implementation changes the reorder transform or its invariants.

### Electron end-to-end coverage

Exercise the real Chromium event behavior rather than dispatching synthetic drag events:

* click at a known character and release before the threshold; assert the exact caret position and unchanged order;
* press, wait at least 400 ms, assert the grabbing affordance, move across a drop target, release, and assert reordered siblings and selected moved node;
* begin from a previously focused editable node to cover the original conflict;
* move before the threshold and verify it does not reorder;
* activate and press `Escape`; assert unchanged order and cleared drag visuals;
* activate and release without changing position; assert no reorder/history-visible mutation;
* drag near a viewport edge in a sufficiently large list and verify auto-scroll can reach and commit an off-screen position.

## Performance assessment

Required by `docs/PRODUCT.md` §22:

* Disk writes and syncs: unchanged for successful moves; a cancelled or same-position gesture must cause no document mutation, history entry, save request, write, or sync.
* CPU on interactive paths: pending hold adds one timer per active gesture. Active dragging performs pointer-coordinate hit testing and existing auto-scroll work; it must use current rendered geometry and avoid scanning the full sibling collection on each pointer event, especially for windowed lists.
* Memory growth: constant transient state for one pointer, source node, target index, timer, and cached geometry; no per-move accumulation or document-sized copy.
* Automated guard: existing large-list performance coverage should remain sufficient if target lookup is bounded by mounted rows. If implementation scans all displayed siblings per pointer move or changes windowing work, add or update a performance guard that measures active-drag work at the large-list fixture size.

## Validation and completion

1. Run focused renderer tests during development with `npx vitest run src/renderer`.
2. Run the focused Electron drag-and-drop test and confirm it launches and exercises the real application boundary.
3. Review the affected `docs/PRODUCT.md` requirements against unit/component and Electron coverage.
4. Run `npm run check:full`; no required Electron test may be skipped.
5. Record implementation, testing, performance, and validation results in this plan.
6. Change the plan status to `Completed`, add the completion date, move this same file to `docs/plans/completed/`, and regenerate `docs/plans/README.md` with `npm run plan:index`.
7. Review `git status` and `git diff`, stage only this logical change, and commit it with a Conventional Commit message and a `Plan: 0063` footer.
