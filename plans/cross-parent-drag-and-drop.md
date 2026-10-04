# Cross-Parent Drag and Drop

## Objective

Let the user move a node, with its subtree, from one parent to another by mouse drag-and-drop. Today `docs/PRODUCT.md` §11 allows sibling reordering only; this initiative replaces that rule with the behavior authorized below. Keyboard moves, multi-node drag, and Option-drag copy are not part of it.

Sources of truth: `docs/PRODUCT.md` §2.2, §2.3, §2.4, §11, §16.1, §20.1, §20.2, §20.7; `docs/ARCHITECTURE.md` §8; `docs/DEVELOPMENT.md` §9 and §12; ADR 0014 and ADR 0015; `docs/OPEN_QUESTIONS.md` PD-002.

## Authorization

The Product Owner's request, in their words: "move nodes from one parent to another, it's not working now with drag and drop". The Product Owner then answered a question with these options in one exchange:

* Drop targets: **both** — gaps between rows where the pointer's horizontal position chooses the level, and a drop on a node that makes the dragged node its child.
* Scope: **including a level above the current location** — a drop on a breadcrumb entry.
* Invalid target: **show a prohibiting indicator**; releasing changes nothing.

The Product Owner then accepted the recommended answer to each of four further questions:

* **M1.** After a drop on a breadcrumb entry the view moves to that ancestor and the moved node is selected, as `<` does when a node leaves the current level.
* **M2.** The level at a gap is relative to the press point: the dragged node's own level, changed by one per fixed horizontal distance travelled from the press point, clamped to the levels the gap allows. A straight vertical drag keeps today's reorder.
* **M3.** The outer part of a row's height, with a capped size, is the gap between rows; the middle part is a drop on the node. The pointer starts over the dragged node, so a not-allowed cursor shows until it leaves that row.
* **M4.** Auto-scroll runs in every list that overflows the window, and not while the pointer is over the toolbar.

The minor decisions S1–S9 below were proposed in the same exchange and are accepted as defaults; the Product Owner may change any of them.

Reserved for the Product Owner: any behavior not listed here, including keyboard moves, multi-node drag, hover-to-expand, dropping on the current-parent heading, and levels above the location reached through gaps.

## Minor decisions (accepted defaults)

| # | Decision | Principle | Task |
| --- | --- | --- | --- |
| S1 | Nesting under a leaf or collapsed node above appends as last child. Between an expanded node and its first child the only level is first child. | §20.2 `>` appends to the end; "last child" in the request | T2 |
| S2 | Every visible row, including inline descendants, is a target. The dragged node, its visible descendants, and the gaps between them are invalid. | §2.4 "ordinary nodes" | T2 |
| S3 | Gap levels are computed against the list without the dragged block: the minimum is the depth of the row below, the maximum is the depth of the row above plus one. The floor is the location's top level. | "outliner-style"; M1 scope | T2 |
| S4 | The receiving fold opens, and every collapsed ancestor of the moved node inside the location opens. The moved node stays selected. The caret is kept if the node was focused, otherwise it is at the start. The location follows only when the node leaves the displayed location, through the same helper `<` uses. | §11; §20.2 `>`, `o`, `<` rules; §20.7 | T3 |
| S5 | A target that would exceed the maximum depth (§2.3) is offered. Release shows the §2.3 operation error and changes nothing. An own-subtree release is a silent no-op. | §2.3; §20.2 shifts | T3 |
| S6 | A drop at the current parent and position changes nothing: no history entry and no pending mark. | §11 "releasing without changing the position" | T3 |
| S7 | Breadcrumb targets are each ancestor segment and the root glyph below root level. The current-parent segment and the root glyph at root level are not targets. A drop appends as last child (document root: last root). A breadcrumb hit wins over rows. The hit region is the segment's width by the toolbar's full height. | §2.2 "clicking the current-parent segment does nothing" | T7 |
| S8 | The gap marker keeps its class names; its left edge sits at the chosen level's column through a CSS variable. The marker needs more contrast than the current drag-highlight color, so use a palette variable with a dark override. A drop on a node is an inset outline in a palette color. The breadcrumb target uses the existing hover-surface variable. `not-allowed` applies on `body` and the list. No animation and no layout shift. | §20.4; ARCHITECTURE §8; §2.1 "no additional blank gap" | T5, T6, T7 |
| S9 | Whole-node Visual mode ends (Normal mode, range cleared) when a drop changes the node's parent, as `enterNode` and `navigateToAncestor` do in `App.tsx`. The Vim register and `.` repeat are untouched. | §20.2 pointer paragraph | T5 |
| S10 | The outer band of a row is a quarter of its height, at most a capped number of pixels; the level changes by one for each full horizontal step from the press point, truncated toward zero, so a sloppy vertical drag keeps the level; the step equals the per-level row indent. The values are exported constants in `node-drag.ts` and can be tuned without a behavior change elsewhere. | M2 "fixed horizontal distance", "a straight vertical drag keeps today's reorder"; M3 "capped size"; S8 single indent source | T4 |

The Product Owner should see the screenshots for S8.

## Facts the tasks rely on (read from the repository by the planning session)

* The commit path is `NodeList.onMove(nodeId, insertionIndex)` → `App.moveNode` → `EditorStore.moveNodeTo` → `moveNodeTransition` → `moveSibling`. No existing command moves across parents. `shiftSiblingRange` moves one level in or out only.
* The sibling-only rule lives in `siblingBoundaryIndices` and `nearestSiblingBoundary` in `src/renderer/visible-tree.ts`, used by `use-node-list-drag.ts`; and in PRODUCT §2.4, §11 and ARCHITECTURE §8.
* `>`/`<` conventions to reuse: `nodeVisualShiftTransition` (`editor-node-visual-transitions.ts`), store entry `shiftNodeVisual`. They open the receiving fold, move the location only when the node leaves it, report `MAX_DOCUMENT_DEPTH_ERROR` and change nothing on overflow, carry the attachment summary, and record one structural history entry.
* `VisibleRow.parentId` is `null` for the location's top-level rows, because `editor-store.ts` calls `buildVisibleRows` without the current parent. Any drop resolver must be given the real parent id first (T2).
* During a drag the `<section class="node-list">` holds pointer capture, so the breadcrumb receives no pointer events and no `:hover`. Hit-test it by geometry (for example `document.elementFromPoint`). The cursor shown is not observable through computed style: check it in a visible run.
* Auto-scroll currently runs only when the list is windowed.
* The row indent per level is hard-coded in `styles.css`; define it once as a custom property, because duplicated values are the recurring defect named in ADR 0014.
* PRODUCT §11 says a move "is automatically saved", while §16.1 says reordering marks a pending change for the idle, volume or quit save. Keep §16.1 semantics and word the text accordingly.

## Constraints for every task

* `npm run check:docs` rejects restated product quantities in non-PRODUCT documents and plans. Refer to the "maximum-depth limit (§2.3)" instead of writing its number.
* `npm run check:requirements` needs a marker for every numbered leaf section of PRODUCT. Add no numbered subsection; use unnumbered subheadings. §2.2, §2.3, §2.4, §11, §20.1 and §20.2 need an e2e marker.
* Each task edits the PRODUCT, ARCHITECTURE and DEVELOPMENT lines for exactly what it lands, so documents never run ahead of code.
* Do not edit `e2e/fixtures.ts` or `perf/fixtures.ts`; a shared fixture change is High Risk. Use spec-local helpers.
* Keep the marker class names `node-row-drop-before` and `node-row-drop-after`; e2e and perf selectors use them, and `layout-density` asserts the edge-zone sizes.
* A new e2e spec starts with `// @editing-modes: both`. A depth-limit e2e test must call `allowRendererError` with the exact message, because fixtures fail on any visible operation error.
* A new public `EditorStore` method must be driven in `src/application/test/editor-store-arbitraries.ts` or listed in `editor-store-command-inventory.test.ts`, and added to `src/renderer/test/editor-store-double.ts`.
* Keep one resolved drag state. Add no parallel `useState`; set React state on pointer move only when the resolved target changed.
* The domain and application layers stay free of the DOM. The index convention of the new domain API is the post-removal index, like `moveSibling`.
* Tests that encode the old rule are rewritten deliberately, never weakened: `NodeList.test.tsx` drag cases and every `onMove` assertion, `App.test.tsx` move case, `visible-tree*.test.ts`, midpoint tests in `node-drag.test.ts`, `e2e/inline-expansion.spec.ts` sibling-rule tests, and `e2e/windowed-list.spec.ts` drop gestures (the level now depends on M2).

## Tasks

| ID | Outcome | Depends on | Validation tier (`DEVELOPMENT.md` §9) | Status |
| --- | --- | --- | --- | --- |
| T0 | This plan and its index entry | — | Minimal | Done |
| T1 | Domain `moveSubtree` | T0 | Low | Done |
| T2 | Drop-target model and real parent ids | T1 | Low | Done |
| T3 | Store command `moveNodeToParent` | T1, T2 | Moderate, independent review | Done |
| T4 | Pointer geometry in `node-drag.ts` | T0 | Low | Done |
| T5 | Between-row drops with a level | T3, T4 | High (`npm run check:full`), reviewer and product verifier, `WORKING_PLAN.md` | Done |
| T6 | Drop onto a node | T5 | Moderate, reviewer and verifier, `WORKING_PLAN.md` | Planned |
| T7 | Drop onto a breadcrumb entry | T5 | Moderate, reviewer and verifier, `WORKING_PLAN.md` | Planned |
| T8 | Auto-scroll in every overflowing list (M4) | T5 | Moderate | Planned |
| T9 | Cross-task verification, final documentation sweep, plan removal | T6, T7, T8 | High (`npm run check:full`), product verifier | Planned |

### T1. Domain `moveSubtree`

* Files: `src/domain/document-operations.ts`, `src/domain/document.ts`, new `src/domain/document-move.test.ts`, `src/domain/document.property.test.ts`, `docs/ARCHITECTURE.md` §6.
* Signature: `moveSubtree(document, nodeId, parentId | null, index)` returns `moved`, `impossible` or `too-deep`. `impossible` means an unknown id, or a parent that is the node or one of its descendants. `too-deep` uses `subtreeHeight` against the maximum-depth limit.
* Copy only the two affected root-to-array paths; locate the destination by walking ids instead of calling `requireNode` on an intermediate document, or show the cost is acceptable at the largest supported document size.
* Acceptance: unit tests for nest, outdent, a distant parent, a root target, same-parent equal to `moveSibling`, own subtree, the depth boundary (fits and fails), index clamping, input not mutated, and unchanged subtrees shared by reference. Property tests: the id multiset is preserved, the moved subtree is the same object, the attachment summary is equal, `assertDocument` passes, and the inverse move restores equality.
* Run `npm run test:mutation -- --mutate src/domain/document-operations.ts` and read the survivors; the file's coverage floor must hold.
* Commit: `feat(domain): move a subtree to another parent`.

### T2. Drop-target model and real parent ids

* Files: new `src/application/drop-targets.ts`, `drop-targets.test.ts`, `drop-targets.property.test.ts`; `src/application/editor-store.ts` (pass the current parent id as the rows' root parent); `visible-rows.test.ts` or `editor-store.test.ts`.
* Pure API: `dragBlock(rows, id)`, `gapLevels(rows, block, gap)` (undefined inside the block), `dropTargetAtGap(rows, block, gap, level)`, `dropTargetOnRow(rows, block, row)`, `isNoOpDrop`. A target is `{ parentId, index }` with a post-removal index.
* Build an id-to-row-index map once per `rows` identity and walk `parentId` links; no scan of all rows per pointer move.
* Acceptance: a model-based property test applies `moveSubtree` at the resolved target with the receiving fold open and compares the visible rows with an independent reference model, including a receiving parent with hidden children (the node lands after them). Invalid positions resolve to undefined.
* Run mutation on `drop-targets.ts`.
* Commit: `feat(application): resolve drop targets from visible rows`.

### T3. Store command `moveNodeToParent`

* Files: `src/application/editor-command-transitions.ts` (new `moveNodeToParentTransition`; re-express `moveNodeTransition` on top of it with its tests unchanged); `editor-node-visual-transitions.ts` (extract the location and expand rule shared with `<`); `editor-store.ts` (`moveNodeToParent(nodeId, parentId, index): boolean`, with the same locked early return as `moveNodeTo`, which stays as a wrapper); tests in `editor-command-transitions.test.ts`, `editor-store.test.ts`, `editor-store-reorder-cost.test.ts`, `test/editor-store-arbitraries.ts`, `src/renderer/test/editor-store-double.ts`.
* Acceptance: differential tests show a drop as last child of the previous sibling equals `shiftNodeVisual('in', id, id)` and a drop directly after the parent equals `'out'`, comparing document, location, expansion, selection and history count. Further cases: the location follows when the node leaves it (M1), the fold opens, depth overflow gives the exact message and no change, ancestry and no-op give no history entry and no error, the lock returns early and builds nothing, one undo entry, undo and redo restore the document and a valid location, no immediate save is requested, and no attachment cleanup is queued.
* Run mutation on the changed application files and the application property tests, with one `TREE_PROPERTY_RUNS=20` run.
* Commit: `feat(application): move a node to another parent`.

### T4. Pointer geometry in `src/renderer/node-drag.ts`

* Files: `node-drag.ts`, `node-drag.test.ts`, `node-drag.property.test.ts`.
* Add `dropZoneAtPoint(regions, y)` returning `{gap}` or `{row}` for the bands (M3) and `dropLevelAtPoint(sourceLevel, pressX, pointerX, levels)` for the relative rule (M2). Constants are exported. Landed with S10: the level rule truncates toward zero, so it has no ties to break.
* Acceptance: bands partition every row, the zone position is monotonic in y, clamp cases hold, zero-height rows are ignored. `insertionIndexAtPoint`, `effectiveDestination`, `shouldCommitMove` and `dropMarkerFor` stay with their tests until T5, because `use-node-list-drag.ts` still uses them; T5 replaces them with the band tests and deletes them. Keep the reducer and `resolveNodeDrag` tests.
* Commit: `feat(renderer): resolve drop bands and levels from pointer geometry`.

### T5. Between-row drops with a level

* Files: `use-node-list-drag.ts`, `NodeList.tsx`, `NodeRow.tsx`, `App.tsx` (replace `onMove` with `onDrop(nodeId, target)`, with S9), `styles.css` (marker inset variable, one `--row-indent` source, `not-allowed`), `visible-tree.ts` (delete it, with its tests, `stryker.config.mjs` entry and the `DEVELOPMENT.md` §12 module count, if no logic remains); tests `NodeList.test.tsx`, `App.test.tsx`, `visible-tree*.test.ts`, new `e2e/drag-and-drop-hierarchy.spec.ts`, `e2e/inline-expansion.spec.ts`, `perf/vim.spec.ts`; docs PRODUCT §1, §2.1, §2.3, §2.4, §10, §11 (keep "no drop inside node" until T6) and §16.1 wording, ARCHITECTURE §8, DEVELOPMENT §12, `docs/VIM_CONFORMANCE.md` reorder row.
* First steps: record a same-machine performance baseline on the unchanged HEAD, then write the navigation and caret inventory below into `WORKING_PLAN.md`.
* Acceptance: e2e in both editing modes for nest, outdent through an expanded branch, a far move into an expanded node's children, a gap inside the dragged block (not-allowed, release changes nothing), Escape, undo and redo, and persistence across restart. Whole-node Visual mode ends on a re-parent; Normal and Insert are unchanged. A geometry assertion that the marker's left edge equals the chosen level's column. Light and dark screenshots of the level marker, inspected and recorded as visual evidence (synthetic data only). Perf: a cross-parent move at a thousand rows and a hover-to-paint scenario, with budgets from the measured baseline. Run `TREE_E2E_VISIBLE=1 npx playwright test e2e/drag-and-drop-hierarchy.spec.ts --workers=1` to observe the real cursor.
* Commit: `feat(renderer): drop between rows at the level the pointer chooses`.

### T6. Drop onto a node

* Files: `NodeList.tsx`, `NodeRow.tsx`, `use-node-list-drag.ts`, `styles.css`, their tests, the e2e spec from T5, PRODUCT §11 (replace the "no drop inside node" sentence).
* Acceptance: onto a collapsed node with children opens the fold and appends; onto a leaf and onto an expanded node append; onto itself or a descendant shows not-allowed; a depth-limit drop shows the operation error; a band geometry assertion; a screenshot of the highlight in light and dark.
* Commit: `feat(renderer): drop a dragged node onto a node to make it a child`.

### T7. Drop onto a breadcrumb entry

* Files: `LocationBar.tsx`, `App.tsx` (highlight state lifted to App), `use-node-list-drag.ts`, `node-list-layout.ts` (hit-test helper), `styles.css`, their tests, the e2e spec, PRODUCT §2.2 and §11.
* Acceptance: ancestor and root-glyph drops append and follow M1; the current-parent segment is not a target; undo returns the node and navigates back; Visual mode ends; highlight geometry and a screenshot.
* Commit: `feat(renderer): drop a dragged node onto a breadcrumb entry`.

### T8. Auto-scroll in every overflowing list

* Files: the windowing gate in `use-node-list-drag.ts`, the auto-scroll tests in `NodeList.test.tsx`, a new overflow e2e test, PRODUCT §20.1. No auto-scroll while the pointer is over the toolbar.
* Commit: `feat(renderer): auto-scroll a drag in every overflowing list`.

### T9. Close

* A product-verifier pass across the tasks: gap, then onto a node, then breadcrumb; expansion states; windowed list; all Vim modes.
* Final documentation sweep: PRODUCT §1 and §20 mention of sibling reordering and §20.1, ARCHITECTURE module list, `VIM_CONFORMANCE.md`, `OPEN_QUESTIONS.md` PD-002 evidence if usage changed it.
* Delete this plan and its index row in the commit that records completion.

## Navigation and caret inventory (for `WORKING_PLAN.md`, T5–T7)

* Paths: same-parent and cross-parent gap drop; drop onto a node; drop onto a breadcrumb entry; release on an invalid target; release on a valid no-op; Escape, pointer cancel, lost capture, window blur; a persistence lock mid-drag; the source row hidden or windowed out mid-drag; undo and redo of each; a drag from a focused row and from an unfocused row.
* Modes: each path crossed with standard editing, Vim Insert, Normal (text caret and image caret), a pending Replace, character Visual, and whole-node Visual.
* Expected end state: moved node selected; caret kept or at the start; image caret per `focusCaretTransition`; folds and location per S4; Vim register and `.` untouched.
* The reviewer traces each path in code rather than inferring completeness from passing tests.

## Performance assessment (`PRODUCT.md` §22)

* Disk: no new writes or syncs. A move marks a pending change like other structural commands; opened folds add ids to the same save.
* CPU: the domain path copy is proportional to depth plus the two affected sibling arrays; one lazy index rebuild on the next lookup, as for every structural command; hover work is the existing per-mounted-row rect reads plus a depth-bounded level resolution; the toolbar hit-test runs only while the pointer is over the toolbar.
* Memory: history shares unchanged subtrees; the only new state is one transient target object per gesture.
* Guards: the structural-sharing test (T1), the locked early return (T3), and the perf scenarios (T5).

## Risks and boundaries

* No main-process, preload, IPC, dependency, or schema change; the persisted shape is unchanged, so no contract test applies.
* Residual risks: the drag-versus-caret defect cluster, legacy gesture positions in existing tests, and cursor observability.
* The PRODUCT §1.3 Apple Human Interface Guidelines check for drag and drop is still open. The implementing session performs it and raises any conflict under `AGENTS.md` §14.

## Next task

T6 (drop onto a node) is the next task. T1 to T5 are done. T6 is Moderate Risk and uses `WORKING_PLAN.md` for task evidence.

T5's missed independent review found that an unfocused drag source could unmount during windowed scrolling. The follow-up keeps the source mounted independently of the focused row and covers its cancellation cleanup.

Notes carried forward from T3 for T5 to T7:

* `EditorStore.moveNodeToParent(nodeId, parentId, index)` takes a post-removal index and returns whether it changed the document; the renderer maps a `DropTarget` from `drop-targets.ts` onto it directly. It selects the moved node, keeps the caret of a focused node, opens the receiving fold and the folds below the displayed parent, and moves the location only when the node leaves it.
* After undoing a move that left the displayed location, the location stays at the new parent and selects that parent's heading rather than returning to the old place. The T3 test only asserts that the location is valid. T7's acceptance, "undo returns the node and navigates back", needs its own handling or a Product Owner decision on what undo should show.

Resume prompt: "Continue the cross-parent drag-and-drop initiative (plans/cross-parent-drag-and-drop.md): take the next Ready task."
