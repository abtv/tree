# Visible-Row Navigation

## Objective

Keyboard motion between nodes follows the **visible rows** of the current location — the current parent's children plus the descendants that inline expansion (`docs/PRODUCT.md` §2.4) currently shows — instead of the selected node's actual sibling list. When a node is expanded, moving down enters its visible children rather than skipping past them; moving up from a row below an expanded branch lands on that branch's last visible row rather than on its collapsed-looking head.

This is the Vim fold model: an open fold is walked line by line, a closed fold is one step. It is an addition to the inline-expansion behavior introduced in `docs/PRODUCT.md` §2.4, not a replacement for it.

Source of truth for the rules these tasks follow:

* [AGENTS.md](../AGENTS.md) — §5 product changes, §6 architecture changes, §8 plans and ADRs, §9 tests, §10 validation, §12 Git, §13 completion.
* [docs/PRODUCT.md](../docs/PRODUCT.md) — §2.4 inline expansion, §4 keyboard navigation, §20.1 very wide node lists, §20.2 Vim-inspired editing, §22.1 performance of state changes.
* [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — §7 application layer, §8 UI layer, §9 UI state vs document state, §10 navigation, §18 dependency direction, §21 module structure, §22 architectural invariants.
* [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — §8 navigation and caret changes, §9 risk-based validation and evidence format, §11 multi-session initiatives.
* [docs/VIM_CONFORMANCE.md](../docs/VIM_CONFORMANCE.md) — the Vim requirement-to-test inventory and its divergence markers.

## Authorization state

The Product Owner authorized this initiative on 2026-09-29 and decided both reserved questions in the same exchange:

1. **Scope of the change.** Vertical motion (`↑`, `↓`, `j`, `k`, and their counted forms), the boundary crossings of `←` and `→`, and `G` / `NG` move by visible rows. Whole-node Visual (`V`) range extension stays on actual siblings, because its commands (`y`, `d`, `c`, `s`, `p`, `P`, `u`, `U`) act on sibling subtrees and a range spanning a node and its own descendant has no meaning for them.
2. **State ownership.** `ExpansionState` moves from `App.tsx` into `EditorStore`. Navigation order becomes a product rule, and product rules belong in the application layer, not in a React component (`docs/ARCHITECTURE.md` §19, §22 invariant 1). This is the architecture change [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md) reserves for the Product Owner in its consequences, and T1 records it as a new ADR.

No further behavior is authorized by this plan. Anything not listed in **Scope limits** below is out of scope; raise it under `AGENTS.md` §14 rather than deciding it.

## Scope limits

**In scope.** `↑`, `↓`, `j`, `k`, counted `Nj` / `Nk`, `←` and `→` at their text boundaries, `G` and `NG`; the state-ownership move and the ADR that records it; the affected requirements in `docs/PRODUCT.md` §2.4, §4.1, §4.2, §4.3, §20.2; the affected rows of `docs/VIM_CONFORMANCE.md`; tests and performance guards for all of the above.

**Out of scope, deliberately.** Do not change any of these, and do not "make them consistent" on your own initiative:

* `gg`. It targets the editable current-parent heading, or the first displayed root at the root level. Unchanged.
* `V` (whole-node Visual) range extension with `j`, `k`, `gg`, `G`, and `o`. Stays on the focused node's actual siblings.
* `Enter`, `o`, `O`, and every other sibling-creation path. They create a sibling of the selected node's actual level.
* `dd`, `yy`, their counted forward-sibling ranges, `p`, `P`, and subtree puts. Actual siblings.
* Drag-and-drop reordering. `docs/PRODUCT.md` §2.4 states an expanded view offers no cross-level drop target; that stays true.
* `H`, `M`, `L`, `Ctrl+d`, `Ctrl+u`. These are viewport motions and already operate on the rows actually rendered in the viewport (`moveVimViewport` in `src/renderer/use-node-input-bindings.ts`). Leave them alone.
* `h`, `l`, and every in-node text motion, operator, text object, and surround command.
* The disclosure triangle, the circular enter control, `zc` / `zo` / `za` / `zC` / `zO` / `zM` / `zR`, and the rule that expansion resets on every location change. Their **behavior** is unchanged; T1 moves where their state lives, and nothing a user can observe may change in T1.
* Persistence. Expansion is still never persisted and still starts collapsed on every location change and every launch.

## Definitions used by every task

**Visible rows of the current location.** The preorder flattening of `displayedNodes(document, currentParentId)` in which a node's children are included only when that node is inline-expanded. This is exactly what `buildVisibleRows` in `src/renderer/visible-tree.ts` already computes and what `NodeList.tsx` already renders. The editable current-parent heading is **not** a visible row; it remains the separate boundary target that `↑` and `←` reach from the first visible row.

**Row order, not mounted order.** Above the windowing threshold in `docs/PRODUCT.md` §20.1 only some rows are mounted in the DOM. Navigation must use the full visible row list computed from the document and the expansion state, never `document.querySelectorAll`. A motion to an unmounted row must work exactly as it does today.

## Findings later sessions need

These were established by reading the repository on 2026-09-29; they are recorded so no session has to re-derive them.

### What is actually broken today

`moveSelectionTransition` in [`src/application/editor-command-transitions.ts`](../src/application/editor-command-transitions.ts) resolves `↑` and `↓` against `requireNode(document, selectedNodeId).siblings`. Four consequences, all reachable with one expanded node:

1. `↓` on an expanded node goes to its next actual sibling, skipping every visible child.
2. `↓` on the last visible descendant of an expanded branch clamps on that descendant (caret to end of text) instead of continuing to the row after the branch.
3. `↑` on a node whose previous sibling is expanded lands on that sibling's own row, skipping the descendants rendered between them.
4. `↑` on the first child of an expanded node already lands on its real parent, which **is** the row above. This one case is already correct and must stay correct.

`e2e/inline-expansion.spec.ts` contains a test named `does not descend into an expanded node's children on j (Normal mode) or ArrowDown (Insert mode)` that pins consequence 1 deliberately. It is not a stale test — it encodes the current requirement, and T2 replaces it.

### The existing inconsistency this closes

`H`, `M`, `L`, `Ctrl+d`, and `Ctrl+u` already move across rendered rows regardless of level (`moveVimViewport`, `src/renderer/use-node-input-bindings.ts`), while `↑` / `↓` / `j` / `k` do not. A user who expands a branch and presses `L` then `j` moves by two different definitions of "next node". T2 removes that split for the vertical keys; the viewport keys keep their viewport definition by design, which is what Vim does too.

### Where the pieces live now

| Concern | Module | Note |
| --- | --- | --- |
| Expansion set and fold algebra | `src/renderer/expansion-state.ts` | Pure. No React, DOM, Electron, or store imports already. |
| Flattening to visible rows | `src/renderer/visible-tree.ts` | `buildVisibleRows` (needed by navigation) and `siblingBoundaryIndices` / `nearestSiblingBoundary` (drag geometry only). |
| Expansion state instance and fold dispatch | `src/renderer/App.tsx` | `useState`, a render-time reset keyed on `currentParentId`, `applyFoldCommand`, `onToggleExpansion`. |
| Vertical/boundary/`G` transitions | `src/application/editor-command-transitions.ts` | `moveSelectionTransition`, `moveHorizontalTransition`, `moveSelectionBoundaryTransition`. |
| Store commands | `src/application/editor-store.ts` | `moveSelection`, `moveHorizontal`, `moveSelectionBoundary`, all delegating to the transitions above and then to `selectNode`. |
| Counted vertical motion and image rows | `src/renderer/vim-vertical-navigation.ts` | Loops one `store.moveSelection` per step; its own `canCrossNode` predicate duplicates the boundary rule in terms of actual siblings. |
| Arrow-key dispatch | `src/renderer/editor-input-handlers.ts` | `store.moveSelection('up' \| 'down', cursor)` and `store.moveHorizontal(...)`. |

The application layer may depend on the domain and the renderer may depend on the application (`docs/ARCHITECTURE.md` §18), so moving `expansion-state.ts` and `buildVisibleRows` into `src/application/` keeps every arrow pointing the right way. Moving them into `src/domain/` would not: expansion is runtime state, not document state (`docs/ARCHITECTURE.md` §9).

### Performance context

`buildVisibleRows` costs one traversal of the visible rows. Today `NodeList.tsx` runs it once per render inside a `useMemo`. If navigation naively rebuilt it per motion step, a counted motion such as `50j` would pay fifty traversals on an interactive path, which `docs/PRODUCT.md` §22.1 and §22.2 do not permit. The mitigation is stated in T1: the store memoizes one row list, invalidated only when the document object, the current parent, or the expansion set changes, and the renderer consumes that same list instead of building its own. Net effect is one traversal fewer per render, not one more per keystroke.

`perf/expansion.spec.ts` already contains `keeps vertical traversal responsive crossing many expanded branches`, which is the guard for exactly this path. Re-measure it in T2 and T4 on the same machine as its recorded baseline; do not compare across machines.

## Tasks

| ID | Outcome | Depends on | Status | Validation tier |
| --- | --- | --- | --- | --- |
| T1 | The application layer owns inline expansion and the visible-row order, with no user-visible change | — | Ready | Moderate Risk |
| T2 | `↑`, `↓`, `j`, `k`, and their counted forms move by visible rows | T1 | Planned | Moderate Risk |
| T3 | `←` and `→` boundary crossings and `G` / `NG` move by visible rows | T2 | Planned | Moderate Risk |
| T4 | What stays sibling-scoped is recorded; property and performance guards close the initiative | T3 | Planned | Moderate Risk |

**Next task: T1.**

Tier note. Every task changes renderer and application behavior within one process, with no persistence, IPC, clipboard, attachment, or native-shortcut boundary, so the Moderate Risk row of `docs/DEVELOPMENT.md` §9 applies: `npm run check`, the affected unit and property tests, and focused end-to-end coverage for every affected requirement. T2 and T3 additionally change shared interaction state, so `AGENTS.md` §13 requires an **independent reviewer** and a **separate product verifier** for them, and `docs/DEVELOPMENT.md` §8 requires a navigation and caret matrix built **before** the implementation. T1 and T4 need the primary agent's own diff review and product verification.

No task in this initiative changes rendered styling, so no task creates or updates a screenshot baseline. `e2e/inline-expansion.spec.ts` has a committed appearance baseline (`matches the collapsed, expanded, nested, and focused disclosure appearance`); it must keep passing untouched. If any task makes it fail, that is a defect in the task, not a baseline to update.

---

### T1 — Move inline expansion into the application layer

**Goal.** `EditorStore` owns the expansion set and publishes the visible row order. No behavior a user can observe changes. Every existing test keeps passing, adjusted only for import paths and for the fact that expansion now travels through the store.

**Why first.** T2 and T3 are product changes whose diffs should read as behavior changes. Doing the move separately keeps each commit reviewable (`AGENTS.md` §12).

**Files expected to change.**

* New `src/application/expansion-state.ts` and `src/application/expansion-state.test.ts` — moved from `src/renderer/`, contents unchanged apart from the import of `TreeNode`.
* New `src/application/visible-rows.ts` and `src/application/visible-rows.test.ts` — `VisibleRow` and `buildVisibleRows` moved out of `src/renderer/visible-tree.ts` with their tests.
* `src/renderer/visible-tree.ts`, `src/renderer/visible-tree.test.ts`, `src/renderer/visible-tree.property.test.ts` — retain only `siblingBoundaryIndices` and `nearestSiblingBoundary`, importing `VisibleRow` from the application module. Keep the drag-boundary property test where it is.
* `src/application/editor-store-types.ts` — the ready snapshot gains `expansion: ExpansionState`.
* `src/application/editor-store.ts` — holds the expansion set, resets it whenever `location.currentParentId` changes, exposes the new commands and the memoized row accessor.
* `src/application/editor-store.test.ts` — coverage for the new commands and the reset rule.
* `src/renderer/App.tsx` — reads expansion from the snapshot, dispatches to the store, drops the local `useState`, the render-time reset, and the parts of `applyFoldCommand` / `onToggleExpansion` that moved.
* `src/renderer/App.test.tsx`, `src/renderer/NodeList.tsx`, `src/renderer/NodeList.test.tsx`, `src/renderer/test/editor-store-double.ts` — follow the new ownership.
* A new ADR under `docs/decisions/`, taking the next free number, titled for the decision that the application layer owns inline expansion, plus its row in `docs/decisions/README.md`. It records the problem (navigation order became a product rule that depended on React component state), the alternatives (keep the state in the renderer and compute the row order there, as `H` / `M` / `L` do; or register a renderer-supplied expansion provider with the store), the chosen solution, and the consequences for [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md), whose scope statement covers renderer-local UI state only.
* `docs/ARCHITECTURE.md` §8, §9, and §21 — the sentences naming `App.tsx` as the expansion owner and `src/renderer/visible-tree.ts` / `src/renderer/expansion-state.ts` as its modules.

**Store API to add.** Keep it small; do not invent more surface than these:

* `expansion: ExpansionState` on the ready snapshot.
* `getVisibleRows(): readonly VisibleRow[]` — memoized against the current `document` object identity, `location.currentParentId`, and `expansion` object identity, so repeated calls between changes return the same array reference. A plain one-entry cache field is enough; do not add a caching library or a general memoization helper (`docs/ARCHITECTURE.md` §20).
* `toggleExpansion(nodeId)` — toggles one node's fold and applies the `docs/PRODUCT.md` §2.4 rule when the collapse hides the caret: the collapsing node becomes selected with its caret at the beginning. A collapse that hides nothing selected leaves selection, caret, and focus untouched, and must not publish a new focus intent.
* `applyFold(command, nodeId)` for `'close' | 'open' | 'toggle' | 'close-recursive' | 'open-recursive'`, and `applyFold(command)` for `'close-all' | 'open-all'`. `close-all` resets to the collapsed state and reselects through `normalizeCollapsedLocation`, exactly as `applyFoldCommand` does today. `open-all` expands the location's displayed nodes recursively. A per-node command on the current-parent heading, or on a node without children, is a no-op — same as today.

**What must stay in the renderer.** Do not move these into the store; they are DOM and renderer-local facts:

* Blurring the active element before a collapse hides the focused row, so a pending Insert or Replace session finishes. `App.tsx` decides this from the pre-collapse snapshot and calls `blur()` before dispatching to the store.
* Clearing whole-node Visual mode when a collapse hides its anchor or focus. `nodeVisualSelection` and `vimMode` are renderer-local; `App.tsx` keeps that check, computed against the pre-collapse snapshot. `e2e/inline-expansion.spec.ts` (`ends whole-node Visual mode when an ancestor collapses and hides its anchor and focus`) pins it.

**Reset rule.** Today `App.tsx` resets expansion during render when `currentParentId` changes, which covers pointer navigation, the breadcrumb, `Cmd+.` / `Cmd+,`, `gd` / `Ctrl+o`, and undo/redo without threading a callback through each. In the store, apply the same rule at the one place that publishes a new ready state: when the published `location.currentParentId` differs from the previous one, the published expansion is the collapsed state. Do not add a reset call to each command individually — a single check keeps the guarantee that a future navigation path cannot forget it. Confirm with the existing end-to-end cases `resets expansion when entering and leaving a node` and `resets expansion when navigating via the location breadcrumb`.

**Rendering.** `NodeList.tsx` should consume the store's row list rather than calling `buildVisibleRows` itself, so one traversal serves both rendering and navigation. Its `isExpanded` prop is still needed by `NodeRow` for the disclosure triangle's direction; keep that, sourced from the snapshot's expansion set. `layoutState.key` in `NodeList.tsx` already includes `visibleRows.length`, and every expansion change alters the row count, so no `structuralVersion` change is required — verify this rather than assuming it, and say so in the handoff.

**Acceptance evidence.**

* Every test in `src/renderer/App.test.tsx`, `src/renderer/expansion-state.test.ts` (at its new path), `src/renderer/NodeList.test.tsx`, and `e2e/inline-expansion.spec.ts` passes with the **same assertions** as before. Assertion changes are limited to reading expansion from the snapshot instead of component state. If an assertion has to change meaning, stop: that is a behavior change T1 does not authorize.
* New focused cases in `src/application/editor-store.test.ts`: the collapsed reset fires on every command that changes `currentParentId` including undo and redo; `toggleExpansion` reselects the collapsing node when it hides the caret and publishes no new focus intent when it does not; `getVisibleRows()` returns the same array reference across repeated calls and a new one after a document, location, or expansion change.
* `npm run check` passes. Run `e2e/inline-expansion.spec.ts`, `e2e/navigation.spec.ts`, `e2e/vim-navigation-and-visual.spec.ts`, and `e2e/windowed-list.spec.ts` focused.
* Record every result in the `docs/DEVELOPMENT.md` §9 evidence format. No visual-evidence record is required: no rendered styling changes.

**Performance assessment (`docs/PRODUCT.md` §22.1).** State the three dimensions explicitly in the handoff: no new disk writes or syncs (expansion is never persisted and creates no undo entry); CPU on the interactive path goes **down** by one visible-row traversal per render, because rendering and navigation now share one memoized list; memory adds one cached array of visible rows plus the already-existing expanded-id set, both bounded by the current location's visible row count and both discarded on every location change. No new performance guard is needed in T1; `perf/expansion.spec.ts` must still pass.

**Decision reserved.** If moving ownership reveals a real defect in the current behavior — most likely in the interaction between the collapse-hides-caret rule and a pending Insert or Replace session — reproduce it defect-first, report it, and stop. Fixing it is a separate authorization.

---

### T2 — Vertical motion by visible rows

**Goal.** `↑`, `↓`, `j`, `k`, and their counted forms move to the adjacent visible row of the current location.

**Prerequisite.** `docs/DEVELOPMENT.md` §8 requires the navigation and caret matrix to exist **before** the implementation changes. Build it first, keep it in `WORKING_PLAN.md` (this task meets the `AGENTS.md` §8 trigger for one: it crosses the store, the Vim vertical-navigation module, and the input handlers, and an independent reviewer starts from a clean context), and delete that file before the final commit for this task.

The matrix must cover, for both directions and for counted forms:

* Source row: the heading; the first visible row; a collapsed node; an expanded node; a node's first, middle, and last visible child; the last visible row of the location; a node whose previous sibling is expanded.
* Text caret: beginning, middle, final character, empty text.
* Attachment: no image, text plus image (the image is its own `j` / `k` row), image-only node — including an expanded node that has an image, and a first child reached from a parent that has one.
* Expected destination: selected node, text cursor, whether the image caret is active, the restored text position where one applies, and the Vim mode.
* Boundary cases that clamp, and the no-op cases that must not publish a new focus intent.

**Requirement wording to write into `docs/PRODUCT.md`.** Use these; do not paraphrase loosely.

§4.1 Up — replace "Move selection to the previous node on the current level." with "Move selection to the previous visible row of the current location, including a visible descendant shown by inline expansion (see §2.4)." Replace "If the current node is the first node on the level" with "If the current node is the first visible row". The remaining clauses — current parent as the target, horizontal-position preservation, clamping to the target's text length, the first top-level root's behavior, and the heading's own `↑` — are unchanged.

§4.2 Down — replace "Move selection to the next node on the current level." with "Move selection to the next visible row of the current location. When the selected node is expanded, the next visible row is its first visible child; when it is the last visible row of an expanded branch, the next visible row is the one that follows the whole branch." Replace "If the current node is the last node on the displayed level" with "If the current node is the last visible row".

§2.4 — replace the sentence "Existing keyboard commands that act on nodes use the focused node's actual sibling level." and the clause "expansion adds no other keyboard command and does not make the flattened view a new sibling list" with a statement that separates the two families: **motion between nodes follows the visible rows**, while **commands that act on the tree — sibling creation, deletion, yank and put, whole-node Visual ranges, and drag reordering — use the focused node's actual sibling level**. Keep the existing sentences about the location path, the current-parent heading, and the fold commands. T3 extends the motion sentence to `←`, `→`, and `G`; write it in T2 covering vertical motion only, and do not pre-announce T3's scope.

§20.2 — the `j` and `k` bullet says "to move between rows". Extend it to say the rows are the location's visible rows, so an expanded node's children are walked rather than skipped. The counts paragraph says "`3j` and `5k` move by that many displayed nodes while clamping at the level boundary" — "displayed nodes" becomes "visible rows" and "the level boundary" becomes "the first and last visible row of the location". Leave the `10G` sentence for T3.

**Files expected to change.**

* `src/application/editor-command-transitions.ts` — `moveSelectionTransition` resolves its target from the visible rows. Give it the precomputed row list as a parameter so the store keeps control of memoization; keep the function pure. When the selected node is neither the heading nor present in the rows, return `undefined`; the §2.4 reselection rule and `normalizeCollapsedLocation` on load make that unreachable in production, and a focused test should pin the defensive branch.
* `src/application/editor-store.ts` — `moveSelection` passes `getVisibleRows()`.
* `src/renderer/vim-vertical-navigation.ts` — its local `canCrossNode` predicate currently asks whether an actual sibling exists in that direction. It must ask whether an adjacent **visible row** exists, or, for `up` from the first visible row, whether the current-parent heading exists. Resolve it from the store snapshot plus the store's row list rather than re-deriving a second definition of the order in the renderer.
* `src/application/editor-command-transitions.test.ts`, `src/application/editor-command-transitions.property.test.ts`, `src/application/editor-store.test.ts`, `src/renderer/vim-vertical-navigation.test.ts`, `src/renderer/editor-input-handlers.test.ts`, `src/renderer/use-node-input-bindings.test.tsx`.
* `e2e/inline-expansion.spec.ts` — replace `does not descend into an expanded node's children on j (Normal mode) or ArrowDown (Insert mode)` with its inverse, covering both Normal-mode `j` and Insert-mode `ArrowDown`, and add a case for leaving a branch downward and for entering one upward from below.
* `e2e/navigation.spec.ts` — a case proving the collapsed case is untouched: with nothing expanded, `↑` and `↓` still move between siblings exactly as before.
* `docs/PRODUCT.md`, `docs/VIM_CONFORMANCE.md`.

**Property test.** Add one to `src/application/editor-command-transitions.property.test.ts`: for a generated document and a generated expansion set, repeatedly applying `↓` from the first visible row visits every visible row exactly once, in the same order `buildVisibleRows` produces, and stops on the last; applying `↑` from the last visible row is its exact inverse down to the first, whose `↑` reaches the heading when one exists. This is the invariant the whole initiative rests on, and it is cheap to check.

**Acceptance evidence.**

* The new end-to-end cases fail against `HEAD` before the change and pass after. Verify by running them before implementing, not only after.
* Every row of the matrix has a named focused test and a named representative Electron test, or an explicit statement of why it is inapplicable. Report intentionally unsupported combinations rather than leaving them silent (`docs/DEVELOPMENT.md` §8).
* `e2e/vim-image-caret.spec.ts` passes unchanged. The image row is a `j` / `k` step inside one node and is unrelated to the row order between nodes; if a case there needs changing, say exactly why in the handoff.
* `e2e/windowed-list.spec.ts` passes: motion to a row that is not mounted must still work.
* `npm run check` plus the focused end-to-end specs above. Re-run `perf/expansion.spec.ts` on the same machine as its recorded baseline and report the comparison; if the machine differs, say so and mark the comparison unavailable rather than reporting a number that means nothing.
* `docs/VIM_CONFORMANCE.md`: the `j` / `k` and counted-motion rows get their evidence updated. Check each affected row's **Vim divergence** marker: walking an open fold line by line and stepping over a closed fold as one unit is what Vim does, so this change removes a divergence rather than adding one. Remove a marker that no longer applies instead of leaving it stale.

**Reviews.** Independent reviewer and separate product verifier, per `AGENTS.md` §13. Give both the validation record and the matrix. The reviewer must trace each affected state-changing path in the code against the matrix rather than infer completeness from passing tests.

**Decision reserved.** If the matrix turns up a combination whose correct behavior is genuinely undetermined by `docs/PRODUCT.md` — most plausibly a counted motion that crosses both an image row and a branch boundary in the same step — raise it under `AGENTS.md` §14 before implementing, rather than choosing a default.

---

### T3 — Boundary motion and `G` by visible rows

**Goal.** `←` and `→` at their text boundaries, and `G` / `NG`, move by visible rows.

**Depends on T2**, which establishes the row-order parameter and the property invariant.

**Requirement wording to write into `docs/PRODUCT.md`.**

§4.3 — "if a previous sibling exists, select it and place the caret at the end of its text" becomes "if a previous visible row exists, select it and place the caret at the end of its text"; "otherwise, if the node is a child, select its parent" keeps its meaning, since the first visible row's fallback is the editable current parent. "if a next sibling exists, select it and place the caret at the beginning of its text" becomes "if a next visible row exists". The current parent's own `→` behavior — selecting its first child — is unchanged and already equals the first visible row.

§20.2 — `G` selects the last visible row of the location, and a count selects that visible row, clamped to the last. Update the bullet `G` to select the last displayed node (or the counted node) and the sentence `10G` selects the tenth displayed node at the current level, clamped to the last. `gg` is unchanged and must still be described as targeting the current-parent heading or the first displayed root.

§2.4 — extend the motion sentence written in T2 so it names `←`, `→`, and `G` alongside the vertical keys.

**Files expected to change.**

* `src/application/editor-command-transitions.ts` — `moveHorizontalTransition` and `moveSelectionBoundaryTransition` take the row list. In `moveSelectionBoundaryTransition`, only the `'last'` branch changes; the `'first'` and `'parent'` branches keep their current targets.
* `src/application/editor-store.ts` — `moveHorizontal` and `moveSelectionBoundary` pass `getVisibleRows()`.
* `src/application/editor-command-transitions.test.ts`, `src/application/editor-store.test.ts`, `src/renderer/editor-input-handlers.test.ts`.
* `e2e/inline-expansion.spec.ts` — the existing case `keeps gg on the first displayed root while G targets the descendant's own last real sibling` asserts the behavior this task changes. Rewrite it: `gg` keeps its current target, `G` now reaches the last visible row. Add `←` and `→` boundary crossings into and out of an expanded branch.
* `e2e/navigation.spec.ts` — the collapsed case in `moves left and right across sibling and parent boundaries` must keep passing unchanged.
* `docs/PRODUCT.md`, `docs/VIM_CONFORMANCE.md`.

**Acceptance evidence.**

* Extend T2's property to the boundary commands: from any visible row, `→` at the end of the text reaches the same node `↓` reaches when a next visible row exists, and `←` at the beginning reaches the same node `↑` reaches; `G` with no count reaches the node repeated `↓` settles on.
* The rewritten end-to-end case fails against the T2 commit and passes after T3.
* `npm run check` plus focused `e2e/inline-expansion.spec.ts`, `e2e/navigation.spec.ts`, `e2e/vim-navigation-and-visual.spec.ts`.
* Update the affected `docs/VIM_CONFORMANCE.md` rows and their divergence markers, including the row that currently records `G` as targeting the focused node's own actual siblings.

**Reviews.** Independent reviewer and separate product verifier, as in T2. Reuse T2's matrix, extended with the `←` / `→` and `G` entry and exit paths; do not rebuild it from scratch.

**Decision reserved.** None expected. If `←` at the beginning of the first child of an expanded node produces a different target from `↑` under any reading, stop and raise it — the two must agree.

---

### T4 — Record what stays sibling-scoped, guard it, and close the initiative

**Goal.** Make the remaining split between row-scoped motion and sibling-scoped commands explicit and tested, so a later session cannot read it as an oversight, and leave the repository with the durable knowledge in its owners.

**Files expected to change.**

* `docs/PRODUCT.md` §2.4 and §20.2 — state plainly which commands use actual siblings and why: whole-node Visual ranges and the subtree commands act on sibling subtrees, and drag reordering offers no cross-level target. This is a clarification of behavior T2 and T3 already left in place, not a new requirement.
* `e2e/inline-expansion.spec.ts` — one case proving `V` plus `j` inside an expanded branch extends across actual siblings and not into a visible descendant, and that `dd` and `yy` counted ranges act on actual siblings. Extend the existing drag cases only if they do not already cover the rows in question; they probably do.
* `perf/expansion.spec.ts` — confirm `keeps vertical traversal responsive crossing many expanded branches` still exercises the changed path meaningfully now that traversal crosses branches, and extend it to a counted motion (`Nj`) across many expanded branches if it does not. Record the measurement and the machine.
* `docs/ARCHITECTURE.md` §21 — the performance assessment paragraph for the navigation path, covering the memoized row list.
* `docs/VIM_CONFORMANCE.md` — a final read-through for rows whose evidence or divergence marker T2 and T3 left stale.
* `plans/visible-row-navigation.md` and `plans/README.md` — removed in this task's commit.

**Acceptance evidence.**

* `npm run check:full`. This is the one point in the initiative where the complete suite runs end to end; the per-task tiers above are Moderate Risk and do not require it, but the closing task should leave a full pass recorded.
* The performance comparison is same-machine, or explicitly reported as unavailable.
* Confirm that nothing in `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, or `docs/VIM_CONFORMANCE.md` still describes vertical motion as sibling-scoped.

**Decision reserved.** Ask the Product Owner to confirm the initiative is complete before deleting this plan and its index row (`AGENTS.md` §8).

---

## Resume prompt

```text
Continue the visible-row navigation initiative. Read plans/README.md, plans/visible-row-navigation.md,
and AGENTS.md, then compare the plan's task statuses with git status and recent commits before starting.
Take the plan's next Ready task, follow its validation tier and review requirements, and commit the task
together with the plan's status update.
```
