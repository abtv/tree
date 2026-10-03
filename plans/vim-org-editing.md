# Vim Editing Improvements

## Objective and authorization

Define and independently implement Vim-style editing operations adapted to Tree's subtree model and the Product Owner's personal workflows. Familiar commands are a starting point for Tree-specific product decisions. The Product Owner authorized recording this initiative on 2026-10-03 and intends to use later sessions for implementation. This recording session changes documentation only.

The Product Owner subsequently clarified that Tree is a specialized application developed for their own tasks, with behavior shaped through agent-assisted development. The objective is useful editing behavior and prompt visible feedback in Tree, rather than conformance to another editor. PRODUCT §22 governs performance acceptance. The Product Owner reported finding Emacs insufficiently responsive on their Mac; this is a usage observation, not a measured comparative performance claim. No new customization UI or general-purpose editor framework is authorized by this clarification.

Confirmed product decisions:

* Visual `>` and `<` change node nesting, rather than adding or removing text whitespace.
* `dd` and `yy` include every descendant, regardless of whether the node is expanded.

The detailed specification shown in the conversation was approved by the Product Owner on 2026-10-03 and is recorded as planned requirements in PRODUCT §20.2.1 (see Approved requirements below). Runtime work proceeds task by task; a request to continue authorizes the next Ready task only.

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

## Approved requirements

On 2026-10-03 the Product Owner approved the complete draft S1–S8 and the proposed resolutions of D1–D5. The behavior is recorded as planned requirements T1–T8 in [PRODUCT §20.2.1](../docs/PRODUCT.md#2021-planned-tree-specific-vim-editing). That subsection is the only specification; this plan does not duplicate it. Each task moves its clauses into the current-behavior text of PRODUCT §20.2 when it lands.

| Clause | Subject | Resolved decision |
| --- | --- | --- |
| T1 | Subtree units and counts | D2 |
| T2 | Visual nesting | D1 |
| T3 | Visual register exchange, `gp`/`gP` | D2 |
| T4 | Vertical operators | D2 |
| T5 | Text commands | Approved draft |
| T6 | Joins | D3 |
| T7 | `gv` | D4 |
| T8 | Repeat | D5 |

No minor gap was resolved by the agent. New material gaps found while implementing a task are raised under AGENTS §14 before the code that depends on them.

## Ordered tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| VIM-00 | Finalize authorized requirements and outstanding decisions | Product Owner answers | Done (documentation only) |
| VIM-01 | Visual nesting with selection retention (T2) | VIM-00 | Done |
| VIM-02 | Atomic counted subtree deletion and Normal puts (T1) | VIM-00 | Ready |
| VIM-03 | Visual `p/P` exchange and counts (T3) | VIM-02 | Planned |
| VIM-04 | Vertical operators and counted node Visual motion (T4) | VIM-03 | Planned |
| VIM-05 | End-of-text yank and case operators (T5) | VIM-00 | Ready |
| VIM-06 | `gp/gP` caret destinations (T3) | VIM-02 | Planned |
| VIM-07 | Sibling joins with data preservation (T6) | VIM-04 | Planned |
| VIM-08 | Bounded Visual-selection memory and `gv` (T7) | VIM-01, VIM-03, VIM-07 | Planned |
| VIM-09 | Safe cross-node replay of completed text sessions (T8) | VIM-00 | Ready |
| VIM-10 | Repeat descriptors for new mutations and integration (T8) | VIM-01 through VIM-09 | Planned |

The task descriptions below name their reserved decision as D1–D5. All are now resolved in the clause listed in the table above; a task keeps only the obligation to raise new material gaps.

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

**Next: VIM-02** (atomic counted subtree commands, PRODUCT §20.2.1 T1). VIM-05 and VIM-09 are also Ready; take them in numeric order unless the Product Owner names another. VIM-01 landed: T2 is current behavior in PRODUCT §20.2; `EditorStore.shiftNodeVisual` and domain `shiftSiblingRange` exist, and `docs/VIM_CONFORMANCE.md` has the row.

Resume prompt:

> Continue the Vim Editing Improvements initiative. Read plans/vim-org-editing.md and repository state. Follow its independent implementation boundary: define Tree behavior from the approved requirements in PRODUCT §20.2.1 and user examples, without inspecting or transferring other editors' source or tests. Take VIM-02.

VIM-00 (documentation) and VIM-01 (Visual nesting) are done.
