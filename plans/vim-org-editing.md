# Vim Editing Improvements

## Objective and authorization

Define and independently implement Vim-style editing operations adapted to Tree's subtree model and the Product Owner's personal workflows. Familiar commands are a starting point for Tree-specific product decisions. The Product Owner authorized recording this initiative on 2026-10-03 and intends to use later sessions for implementation. This recording session changes documentation only.

The Product Owner subsequently clarified that Tree is a specialized application developed for their own tasks, with behavior shaped through agent-assisted development. The objective is useful editing behavior and prompt visible feedback in Tree, rather than conformance to another editor. PRODUCT §22 governs performance acceptance. The Product Owner reported finding Emacs insufficiently responsive on their Mac; this is a usage observation, not a measured comparative performance claim. No new customization UI or general-purpose editor framework is authorized by this clarification.

Confirmed product decisions:

* Visual `>` and `<` change node nesting, rather than adding or removing text whitespace.
* `dd` and `yy` include every descendant, regardless of whether the node is expanded.

The detailed specification shown in the conversation contained additional proposed behavior. Approval of that complete draft is pending. The candidate scope below preserves those proposals for review; it does not authorize their implementation or override current [Product Requirements](../docs/PRODUCT.md). Task VIM-00 settles the proposed behavior before runtime work begins. Do not infer approval from creation of this plan.

Authoritative references: [PRODUCT §2.3](../docs/PRODUCT.md#23-maximum-depth), [§2.4](../docs/PRODUCT.md#24-inline-expansion), [§10](../docs/PRODUCT.md#10-undo-and-redo), [§20.2](../docs/PRODUCT.md#202-vim-inspired-editing), [§20.7](../docs/PRODUCT.md#207-consistency-across-input-paths), and [§22](../docs/PRODUCT.md#22-non-functional-requirements); [Architecture](../docs/ARCHITECTURE.md); [Development §8](../docs/DEVELOPMENT.md#8-tests), [§9](../docs/DEVELOPMENT.md#9-full-validation), and [§11](../docs/DEVELOPMENT.md#11-multi-session-initiatives); [AGENTS §5](../AGENTS.md#5-product-changes), [§8](../AGENTS.md#8-plans-and-architecture-decisions), and [§13](../AGENTS.md#13-completion-criteria).

## Independent implementation boundary

The Product Owner explicitly requires the following for every later task, delegated role, and continuation session:

* Define behavior through Tree requirements, the Product Owner's editing experience and concrete input/output examples. Product decisions are made for Tree's workflow, hierarchy, data safety and responsiveness.
* Do not inspect, download or analyze Doom Emacs, Evil, evil-org, Org, Vim or other editors' source code or test implementations to design, implement or verify these tasks. Public user-facing descriptions and authorized observations of behavior may inform questions; they do not override Tree's requirements.
* Do not copy, translate, port or adapt third-party implementation code, algorithms expressed as implementation code, tests, fixtures, comments or documentation passages into Tree. Write Tree code and tests independently from the approved behavioral requirements and Tree's existing architecture.
* Review the Tree implementation and its tests against the approved Tree examples and invariants. Do not use upstream code as an implementation recipe or test oracle. Ask the Product Owner when an intended behavior is unclear.
* Similar key bindings or behavior do not make external implementation details authoritative. Preserve Tree's explicit differences, including complete-subtree operations, and assess performance in the running Tree application.

The earlier investigation did read upstream source. This restriction applies to subsequent work; do not describe the initiative as having been developed without any prior source exposure or as a certified clean-room process. No upstream implementation or tests were transferred into Tree in the recording session. These implementation instructions are a project boundary, not a legal guarantee.

## Historical comparison and Tree scope

The comparison was a source investigation, not an executed Emacs conformance test. Repository baseline: `40f7fb9`, 2026-10-03, author `abtv`. Workflow documentation was subsequently recorded in `11182cc`. No Vim implementation changed in the recording session.

Historical provenance only: Doom's [Org configuration](https://github.com/doomemacs/modules/blob/main/modules/lang/org/config.el) enables evil-org with Evil's everywhere flag and retains Visual selection on shifts. Its [Org package declaration](https://github.com/doomemacs/modules/blob/main/modules/lang/org/packages.el) pinned [evil-org at e8b535b](https://github.com/doomelpa/evil-org-mode/blob/e8b535bb0e9b590a9f46701b80c82dc9563f579e/evil-org.el), authored by Henrik Lissner on 2026-07-19. Its [Evil package declaration](https://github.com/doomemacs/modules/blob/main/modules/editor/evil/packages.el) pinned [Evil at 6a3e1dd](https://github.com/emacs-evil/evil/tree/6a3e1ddd04ac504a016590940d0af2a3361b9efd), authored by Seungki Kim on 2026-07-28. The package pins and commit metadata were checked in the original investigation. Main-branch configuration links are moving references; the recorded package revisions identify what was investigated. These links are not instructions to reopen source files during future tasks.

The scope is basic editing adapted to Tree. It does not add Org syntax, tables, agenda, TODO workflows, search, macros, named registers, marks, Visual block mode, or system-clipboard integration. Tree intentionally retains character text ranges inside one node and structural ranges over actual sibling subtrees. This initiative does not add arbitrary character selections across nodes, cross-parent structural ranges, or a selection containing both a node and its descendant.

Current implementation, checked by the primary agent:

* `src/domain/document-operations.ts` owns immutable operations including `replaceSiblingRange`, `moveSibling`, subtree cloning and depth checks. `src/domain/document.ts` is the public facade. Parent relationships are derived; no persisted parent pointer may be introduced.
* `src/application/editor-node-visual-transitions.ts` resolves sibling ranges and subtree puts. `editor-command-transitions.ts` owns structural command transitions. `editor-store.ts` applies changes, history, focus, save scheduling and attachment cleanup. Preserve attachment multiplicities and unchanged subtree reference sharing.
* `src/renderer/vim-keyboard-handler.ts` dispatches commands. Counted `dd` and structured puts currently invoke commands repeatedly, so atomic history needs application-level range/batch transitions. Character Visual puts currently ignore counts and keep the incoming register for both keys.
* `vim-edit-session.ts` owns the register and Insert/Replace session. `vim-command-state.ts` owns pending commands, last change/find, character Visual endpoints and structural Insert capture. `App.tsx` holds whole-node Visual endpoints; `use-node-input-bindings.ts` projects their behavior and caret state. Keep each new state fact under one pure owner, following the existing single-owner architecture.
* `vim-keyboard-types.ts` currently stamps plain Insert captures with their origin node. The replay guard at `vim-keyboard-handler.ts` prevents applying them elsewhere. Removing that guard alone is unsafe: [Vim Conformance](../docs/VIM_CONFORMANCE.md#insert-and-replace-completion-policy) records the cross-node capture defects it prevents.

## Candidate specification awaiting approval

These are the proposed clauses from the conversation, expanded only to identify implementation boundaries. VIM-00 must move approved requirements into PRODUCT and link their exact sections from the tasks. Delete this candidate section after promotion, so the plan does not become a second product specification.

### S1. Subtree units and atomic counts

`yy`/`dd` operate on the selected subtree. Counts cover the current and following actual siblings, clamped to the available range. One counted deletion is one undoable command. Normal text or structured puts repeat the incoming contents by the count in one undoable command; every inserted node receives a fresh ID. A failed batch changes neither document nor register/history/focus.

### S2. Visual nesting

In whole-node Visual mode, `>` moves the selected sibling forest to the end of the preceding unselected sibling's children; `<` moves it out of its parent, immediately after that parent. Order and all descendants are retained. Unselected children remain under the original parent. In character Visual mode, the same keys move the entire current subtree.

Both commands retain mode, endpoint identities/direction and character offsets. They keep the moved selection visible by opening required folds and changing location only when promotion leaves the displayed location. A count requests successive one-level moves as one atomic command; if the full request is impossible it makes no change. Root promotion, indentation without a preceding sibling and the contextual current-parent heading are no-ops. Validate every descendant against PRODUCT's depth limit before mutation. The register is unchanged.

### S3. Visual register exchange and puts

Visual `p` replaces the selection using a captured incoming register, then makes the removed selection the next register. `P` uses the same replacement but retains the incoming register. Counts repeat the incoming value before replacement. Character Visual accepts text; node Visual accepts forests. Empty/incompatible registers are no-ops that retain mode and selection. Successful puts return to Normal. Existing depth/ancestry restrictions apply to the whole batch.

Normal text puts leave the caret on the final inserted character. Structured puts select the first inserted node at text beginning. `gp`/`gP` use the corresponding put but place the caret immediately after inserted text; a structured put selects the next sibling after the inserted forest, or its last inserted node when no next sibling exists. Existing image-caret rules continue to apply.

### S4. Vertical operators and Visual counts

`dj/dk/yj/yk/cj/ck` cover the current subtree and sibling subtrees reached by the motion. `dj` covers the current and next sibling; `d2j` covers the current and following sibling pair. Operator and motion counts multiply and clamp at actual sibling boundaries. They never follow expanded descendant rows as separate range members.

Yank copies an ordered forest; delete copies and removes it; change copies it and replaces the entire range with a fresh empty node at its first position, then enters Insert at text beginning. Removed children and attachments remain in the register and history, following existing whole-node Visual `c`. Whole-node Visual `j/k` accept counts and retain endpoint direction. The current-parent heading is excluded.

### S5. Text commands

`Y` is `y$`. Visual `~` toggles the text selection's case and leaves Normal at its start. `gu`, `gU`, and `g~` apply lower/upper/toggle case through existing in-node motions and text objects; `guu`, `gUU`, and `g~~` apply to the whole current node text. These preserve children, attachments and existing hyperlink editing rules. Counts follow the underlying motion. No new Org-specific text objects are included.

### S6. Joins

Normal `J/gJ` join the current and next actual sibling; a count specifies the number of siblings, with at least a pair, clamped to the available range. A single available node makes no change. Node Visual joins the selected range. `J` trims trailing/leading whitespace at each join and inserts a space if both resulting texts are non-empty; `gJ` concatenates without whitespace changes. Character Visual join behavior is reserved for VIM-00.

Retain the first node ID, concatenate child lists in sibling order with descendant IDs intact, and remap hyperlink ranges. Retain an attachment if only one participating node has one; multiple attached nodes reject the entire join, even if they refer to the same attachment. The contextual current-parent heading is excluded. Join is atomic, preserves the register, returns to Normal and puts the caret at the first join boundary. The rejection message and exact boundary after whitespace trimming require approval in VIM-00.

### S7. Restore Visual selection

Normal `gv` restores the most recent character or whole-node Visual range with its direction. After a Visual put it selects incoming content; after a shift it selects the moved range. Restoration uses node identity. Missing nodes, invalid character offsets or a forest that is no longer a valid sibling range cause no change; unrelated content is never substituted.

Saved-selection invalidation after intervening edits, fold/location handling, and whether a changed sibling interval may include newly inserted nodes require a decision in VIM-00. Selection memory stays local to the renderer session and bounded to the latest range.

### S8. Repeat

A completed single-node Insert/change/substitute operation can repeat in another node using the original operation at the current caret. Shifts, joins, case operations and puts become repeatable. Repeated node Visual mutations use the original sibling span and do nothing when the whole span is unavailable. Repeat a put from the captured original incoming value, even when Visual `p` has exchanged the register. Each structural dot iteration remains separately undoable, following current PRODUCT.

Do not record an unfinished session. A session crossing split, creation or navigation must not be replayed as an incidental text diff from another node. Exact capture/replay policy for such sessions requires a decision in VIM-00; the first deliverable may restrict new cross-node replay to sessions completed within one node if the Product Owner chooses that scope explicitly.

## Requirement gaps and decisions reserved for the Product Owner

No minor product gap has been resolved autonomously in this recording task. Approval of S1-S8 and the following material questions is required before dependent runtime tasks are Ready:

* **D1 — nesting and scope:** approve S2's destination/order, atomic counts, selection visibility and location rules. The two confirmed decisions alone do not settle those main flows. Normal `>>/<<` are outside this draft.
* **D2 — register and structural change:** approve Visual `p/P` exchange, atomic counted commands, sibling interpretation of vertical operators, and S4's complete-subtree replacement by `c`.
* **D3 — joins:** approve child/attachment handling, Character Visual behavior, rejection text and caret boundary. These are data-affecting choices.
* **D4 — `gv`:** decide whether intervening text/structure changes invalidate a saved range or adjust it; whether restoring hidden ranges opens folds/navigates; whether endpoint-only restoration may include newly inserted siblings.
* **D5 — repeat:** distinguish completing an edit in one node and later replaying elsewhere from an Insert session that itself crosses nodes. Decide the latter's scope and capture boundaries before removing origin guards. Specify if unsupported session capture preserves the previous repeatable change. Per-command failure is atomic; decide whether counted dot stops at its first failed iteration or continues.

If the complete conversation draft is approved, that approval settles the proposed clauses it actually describes. It does not settle D3-D5 details not determined by that text. Ask about remaining material choices together before implementation under AGENTS §14.

## Ordered tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| VIM-00 | Finalize authorized requirements and outstanding decisions | Product Owner answers | Ready for specification work; runtime blocked |
| VIM-01 | Visual nesting with selection retention | VIM-00 / D1 | Planned |
| VIM-02 | Atomic counted subtree deletion and Normal puts | VIM-00 / D2 | Planned |
| VIM-03 | Visual `p/P` exchange and counts | VIM-02 | Planned |
| VIM-04 | Vertical operators and counted node Visual motion | VIM-03 | Planned |
| VIM-05 | End-of-text yank and case operators | VIM-00 | Planned |
| VIM-06 | `gp/gP` caret destinations | VIM-02 | Planned |
| VIM-07 | Sibling joins with data preservation | VIM-04 / D3 | Planned |
| VIM-08 | Bounded Visual-selection memory and `gv` | VIM-01, VIM-03, VIM-07 / D4 | Planned |
| VIM-09 | Safe cross-node replay of completed text sessions | VIM-00 / D5 | Planned |
| VIM-10 | Repeat descriptors for new mutations and integration | VIM-01 through VIM-09 | Planned |

### VIM-00 — Finalize the specification

**Files:** `docs/PRODUCT.md`, this plan, `plans/README.md`. Update current requirements only for approved scope, clearly distinguishing planned behavior from implemented behavior until each task lands. Resolve D1-D5 and link each task to its precise requirements. Do not make code changes or turn proposal approval into permission for extra commands.

**Acceptance:** every main flow has a determined result, each unresolved choice has an explicit owner, and the next implementation task is executable without the planning conversation. Replace the candidate section with requirement links. Mark VIM-01 Ready only when its behavior and authorization are settled.

**Validation:** Minimal Risk; `npm run format:check:changed`, `npm run check:docs`; also `npm run check:opencode` if agent policy changes. Primary documentation review. No runtime validation claim.

### VIM-01 — Visual nesting

**Files:** `src/domain/document-operations.ts`, `document.ts`, `document-operations.test.ts`, `document.property.test.ts`; `src/application/editor-node-visual-transitions.ts`, `editor-store.ts`, `editor-store-types.ts`, corresponding tests; `src/renderer/vim-keyboard-handler.ts`, `vim-keyboard-types.ts`, `vim-command-state.ts`, `use-node-input-bindings.ts`, `App.tsx` and their tests; `e2e/vim-navigation-and-visual.spec.ts`, `inline-expansion.spec.ts`; `perf/vim.spec.ts`, `expansion.spec.ts`; PRODUCT/ARCHITECTURE/conformance inventory when affected.

**Acceptance:** roots A,B,C,D with B containing B1; selecting B,C and `>` produces A with children B(B1),C followed by D; `<` restores those roots. Retain reverse selection direction and character Visual offsets. Exercise first-sibling/root/current-parent no-ops, full-count rejection, deep-descendant depth failure, collapsed destination reveal, promotion beyond the location, attached/image-only nodes and undo/redo. Verify stable IDs, unchanged subtree sharing and no register updates. One command is one history entry.

**Risk:** High (tree state at scale and shared selection/focus). See common validation below. Add bounded structural invariants and a scale guard for sibling-range shifts. Reserved decision: D1; report new material gaps before implementation.

### VIM-02 — Atomic counted subtree commands

**Files:** `src/application/editor-command-transitions.ts`, `editor-node-visual-transitions.ts`, `editor-store.ts`, their tests and `editor-store-undo.property.test.ts`; domain range operations/tests if required; renderer keyboard/types/repeat owner, `use-node-input-bindings.ts` and corresponding tests; `e2e/vim-navigation-and-visual.spec.ts`; `perf/vim.spec.ts`; relevant docs.

**Acceptance:** count deletion over B,C(D) removes both in one undo and retains both in the register; counted puts create a complete fresh-ID forest in one undo. Partial availability clamps deletion; any depth/ancestry rejection prevents all copies. Preserve folded descendants, links, attachments, selected target rules and root normalization. Failed/locked commands must not consume the register or last change. Test application transitions rather than relying only on renderer loops.

**Risk:** High. Property guards for identity, forest order and undo/redo; scale guard must catch repeated whole-document work per copied node. Reserved decision: D2.

### VIM-03 — Visual paste exchange

**Files:** `src/renderer/vim-edit-session.ts`, `vim-command-state.ts`, `vim-keyboard-handler.ts`, `vim-keyboard-types.ts`, `use-node-input-bindings.ts`, corresponding tests and `vim-interaction.property.test.ts`; application Visual transitions/store tests; `e2e/vim-text-editing.spec.ts`, `vim-navigation-and-visual.spec.ts`; relevant docs.

**Acceptance:** yank `red`, select `blue`, `p`: inserted text is `red`, register is `blue`; repeat the setup with `P`: register remains `red`. Repeat for subtree forests and reverse selections. Counted replacement uses one captured incoming value. Test empty/incompatible registers, depth/ancestry rejection, locked state, links/images, resulting Normal caret, undo followed by paste, and unchanged system clipboard. Undo document content only; define register behavior through approved requirements rather than reverting it incidentally with history.

**Risk:** High (shared register/selection state and subtree replacement). Pure owner tests must verify publication only after a successful transition. Reserved decision: D2.

### VIM-04 — Vertical operators and Visual counts

**Files:** renderer command owner/keyboard/types/bindings and their tests; application command/Visual transitions/store tests; `editor-command-transitions.property.test.ts`, `vim-interaction.property.test.ts`; `e2e/vim-navigation-and-visual.spec.ts`, `inline-expansion.spec.ts`; `perf/vim.spec.ts`; relevant docs.

**Acceptance:** `dj` over A,B(C),D targets A and B(C); `d2j` targets all root siblings; `dk` produces an ascending-order forest including the previous sibling and origin. Verify operator×motion counts, clamping, boundary single-node range, current-parent exclusion, `c` empty replacement plus Insert, and counted forward/reverse V movement. Expanded descendant rows must not change sibling scope. Mutations are atomic and one undo entry.

**Risk:** High (range state at scale and shared mode/session behavior). Preserve ordinary j/k visible-row navigation. Reserved decision: D2.

### VIM-05 — Text yank and case operators

**Files:** `src/renderer/vim-text-commands.ts`, `vim-editing.ts`, `vim-command-state.ts`, `vim-keyboard-handler.ts`, `vim-keyboard-types.ts` and their focused tests/property guards; application text-content helpers only if needed; `e2e/vim-text-editing.spec.ts`, `vim-navigation-and-visual.spec.ts`; relevant docs.

**Acceptance:** `Y` matches `y$`; Visual `~` returns to range start; `guw`, `gUiw`, `g~$` and doubled-node forms produce the specified case with counts. Handle empty text, unchanged transforms, backward ranges and Unicode length changes while preserving hyperlink ranges, images and valid caret. Yank does not replace dot state. Do not turn `g` prefix parsing into accidental `gd` or `gg` behavior.

**Risk:** Moderate unless implementation changes shared state infrastructure, in which case High. Required independent review still applies to modified shared command state. Reserved choices: approval of S5; existing case/Unicode product policy governs arithmetic.

### VIM-06 — Put with caret after insertion

**Files:** renderer text/caret transition helpers, keyboard/types/bindings and focused tests; application put focus intents if needed; `e2e/vim-text-editing.spec.ts`, `vim-navigation-and-visual.spec.ts`, `vim-image-caret.spec.ts`; relevant docs.

**Acceptance:** compare `p/P` with `gp/gP` from beginning/middle/end, attached image and image-only targets. Test structured put with/without a following sibling and counts. Empty/rejected puts preserve caret/image return state. Physical modifier-key order must exercise capital `P` after the `g` prefix.

**Risk:** High when shared caret/focus owners change. Reserved choice: approval of S3's post-put destination; no broader navigation commands are implied.

### VIM-07 — Sibling joins

**Files:** domain operations/links/attachments/index helpers and their unit/property tests; application structural transition/store/history tests; renderer keyboard/caret/types/bindings tests; `e2e/vim-navigation-and-visual.spec.ts`, `hyperlink.spec.ts`, `attachment-validation.spec.ts`, `history.spec.ts`; `perf/vim.spec.ts`; relevant docs.

**Acceptance:** join siblings A(A1),B(B1) into A(A1,B1), retain A's ID and all descendant IDs; undo restores B and its links/attachment. Compare J/gJ whitespace behavior, empty texts, count/range clamping, forward/reverse Visual ranges, and first join caret. Preserve one attached image; reject a range with multiple attached nodes atomically with the approved message. Ensure depth checks cover children moved under the retained node and no reachable attachment is cleaned up.

**Risk:** High (data, attachments, tree consistency, shared caret). Include real attachment boundary coverage and cached attachment multiplicity invariants. Reserved decision: D3.

### VIM-08 — Visual selection memory

**Files:** pure selection state in `src/renderer/vim-command-state.ts` or a focused renderer-local owner following existing architecture; `App.tsx`, `use-node-input-bindings.ts`, keyboard/types/caret helpers and tests; `vim-interaction.property.test.ts`; `e2e/vim-navigation-and-visual.spec.ts`, `inline-expansion.spec.ts`, `history.spec.ts`, `vim-toggle.spec.ts`; relevant docs.

**Acceptance:** restore character and sibling selections in both directions, from Escape and after yank/case/put/shift/join according to approved D4. Verify edits, deletes, reorder, added siblings, undo/redo, fold hiding, location navigation, mode toggle, current-parent restrictions and invalid memory no-op. Retain only the most recent range; don't duplicate endpoints across owners or persist selection memory.

**Risk:** High (shared selection/focus state). Property tests must assert invalid memory never selects unrelated content; real screenshots inspect active/neighbor rows and restored caret. Reserved decision: D4.

### VIM-09 — Cross-node text-session replay

**Files:** `src/renderer/vim-edit-session.ts`, `vim-command-state.ts`, `vim-keyboard-types.ts`, `vim-keyboard-handler.ts`, `editor-input-handlers.ts`, `use-node-input-bindings.ts` and their unit/property tests; `src/renderer/test/vim-sequence-model.ts`; `e2e/vim-text-editing.spec.ts`, `vim-navigation-and-visual.spec.ts`, `history.spec.ts`; `perf/vim.spec.ts`; ARCHITECTURE/conformance/PRODUCT.

**Acceptance:** complete `i` text + Escape in A, move to B, `.` repeats at B's caret; repeat for a motion-based `c`, substitute and deletion-only Insert edit. Separate those cases from a session interrupted by Enter/split, breadcrumb, enter control, pointer focus, application shortcut, toggle, undo/redo or shutdown flush. Reproduce the existing origin-guard regressions before changing capture policy and keep protection against misattributing one node's diff to another. Do not broaden the approved interrupted-session scope silently.

**Risk:** High (shared sessions, save-flush and history interaction). Include hook-level generated sequences plus real interruption ordering; boundary contract coverage when finisher behavior changes. Reserved decision: D5.

### VIM-10 — New-operation replay and integration

**Files:** renderer command/session/types/keyboard/bindings owners and tests; application transitions when replay needs a batch API; sequence model and mixed interaction property tests; Vim text/navigation/image specs; `perf/vim.spec.ts`; conformance/PRODUCT/ARCHITECTURE and this plan/index.

**Acceptance:** replay nesting, joins, case, vertical mutations, gp/gP and Visual puts with captured incoming content and original span. Check that yank/motion/failure leave last change intact; insufficient spans and max-depth/attachment rejection cannot partially change an iteration. Verify approved counted-dot stop policy and one history entry per structural iteration. Exercise realistic mixed sequences, undo/redo, folds, navigation and mode toggles across the new commands.

**Risk:** High. Reuse valid earlier task evidence; complete integration validation against the final snapshot. Remove the initiative plan/index entry after all tasks are committed and durable behavior/constraints/test inventory are in their owners.

## Common execution and validation contract

For each implementation task:

1. Read its Tree requirement sections, relevant nested AGENTS files, current Git state and this plan, including the independent implementation boundary. Carry that restriction into every delegated task and handoff. Create `WORKING_PLAN.md` with exact scope, affected transitions, validation evidence and remaining decisions. Do not implement another task merely because its files are adjacent.
2. Before editing, inventory every affected state-changing path and no-op: Normal/text Visual/node Visual/Insert/Replace, text and image caret, root/current-parent/descendant, forward/reverse endpoints, counts/repeat, pointer/focus, folds, mode toggles, application shortcuts, undo/redo, persistence lock and pending-session finishers. Record expected node, caret, image return position, mode and register. Trace writers against [DEVELOPMENT §8](../docs/DEVELOPMENT.md).
3. Add domain/unit/property guards for the affected invariants. Report actual boundary changes and provide unit, contract and real-boundary coverage when applicable. New commands require real Electron E2E evidence. Reproduce any discovered defect before fixing it under the defect-first workflow.
4. Moderate Risk: `npm run check`, affected focused suites, focused real Electron E2E, primary product verification and performance guards where applicable. High Risk: `npm run check:full`, focused failures/contracts as applicable, independent reviewer and separate product verifier; same-machine performance comparison for affected paths. Read DEVELOPMENT §9 for supported environment/fixtures. Do not claim a suite passed if Electron could not launch.
5. Inspect the smallest representative real-renderer screenshot set for changed pixels/selection/caret, including both appearances when styling differs. Use synthetic fixtures and physical modifier ordering via `pressShifted`. DOM-only assertions do not replace visual inspection. Update `docs/VIM_CONFORMANCE.md` with real test names and intentional Tree divergences.
6. Assess disk writes/syncs, CPU scaling and memory under PRODUCT §22. Moves/joins/count batches should use the existing autosave path, preserve immutable sharing and avoid repeated whole-document scans. Register/repeat/selection memory remains bounded by the latest payload/range. New scale-sensitive commands need automated guards with measured budgets, not invented constants.
7. Record each exact command, scope, tested snapshot, pass/fail/blocked status, environment assumptions and inspected artifact in the working plan. Independent review consumes still-valid results and traces transitions; fix meaningful findings and rerun only invalidated checks. Move lasting knowledge into its owner, remove the temporary working plan, then commit code/tests/docs and this plan's updated status together. History remains append-only.

## Exact next task and resume prompt

**Next: VIM-00.** The complete draft and D1-D5 have not yet been approved. The two confirmed choices must be preserved; implementation does not begin by treating the rest of the candidate specification as accepted.

Resume prompt:

> Continue the Vim Editing Improvements initiative. Read plans/vim-org-editing.md and repository state. Follow its independent implementation boundary: define Tree behavior from approved requirements and user examples, without inspecting or transferring other editors' source or tests. Take VIM-00: finalize the proposed requirements with the Product Owner, record decisions in PRODUCT and the plan, and make VIM-01 Ready when its main flow is determined. Do not implement unapproved candidate behavior.

After VIM-00, an ordinary “continue” selects the next Ready task through `plans/README.md`. No task has been implemented or runtime-validated yet.
