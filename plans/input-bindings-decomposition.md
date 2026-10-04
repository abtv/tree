# Input Bindings Decomposition

Active initiative plan, created 2026-10-04. Format and resume procedure: [Development Guide §11](../docs/DEVELOPMENT.md#11-multi-session-initiatives). Authorization and session rules: [AGENTS.md](../AGENTS.md) §8 and §12. Single-owner rule: [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md).

## Objective

Split `src/renderer/use-node-input-bindings.ts` ("the hook", 1,251 lines at commit `c95c30c`) into smaller, cohesive renderer modules without changing behavior, so that a defect fix lands in one small module with direct tests and ADR 0014 stays true. Trigger: `npm run fix:history` on 2026-10-04 lists 22 `fix` commits touching the hook in 14 days. The latest, H/M/L selecting clipped rows (`e3f63f7`), was in `moveVimViewport`.

Done when every remaining task is `Done`, the hook's public surface is unchanged, no existing test changed, each new module has direct tests and a per-file coverage floor, and `docs/ARCHITECTURE.md` describes the module map.

Expectation (inference): T3 to T10 cut the hook to roughly 650 lines and move stable command and handler code out. The recurring defects sit mostly in caret and session projection: about 25 of 79 `fix` subjects in the local reflog name caret or image-caret synchronization, caret publication, session completion, or Visual and pending-command clearing. T6, T7, and T11 isolate that logic; the other tasks mainly make diffs smaller. If relieving that hot spot matters more than file size, ask the Product Owner to promote T11 (R3).

## Boundaries

- No product behavior change; `docs/PRODUCT.md` is not edited. A defect found while moving code is neither preserved nor fixed inside a move commit: reproduce it and fix it as its own `fix` commit (ADR 0014 Consequences, AGENTS.md §9). Ask under AGENTS.md §14 when `PRODUCT.md` does not determine the correct behavior.
- No architecture change beyond ADR 0014. Renderer-internal only; domain, application, main, and preload are untouched and no logic crosses a layer ([Development Guide §14](../docs/DEVELOPMENT.md#14-code-organization)). Through T10 the hook still creates every owner instance and holds every ref and effect. New modules keep no module-level mutable state and never import the hook.
- Public surface fixed: `useNodeInputBindings`, its options, and `NodeInputBindingsResult` (`bindings`, `dragFreeze`, `setVimEditing`). `App.tsx`, `NodeList.tsx`, and `NodeInput.tsx` are not edited.
- Existing tests are not removed, renamed, moved, weakened, or edited, except the comment-only edits named in T8, T9, and T11. `docs/VIM_CONFORMANCE.md` cites hook tests by path and title on 22 lines and `npm run check:docs` verifies each. New tests go in new files.
- Coverage floors are never lowered except under R2.
- Performance assessment (PRODUCT.md §22.1): no disk writes or syncs, no new retained state, unchanged interactive call graph. The only cost that can move is `bindings(node)`, which `App.tsx` calls for each re-rendered row. T1 guards its identity; T10 and T13 compare the `perf/` suite with a same-machine baseline.
- The eleven mutation-scoped renderer modules listed in `stryker.config.mjs` are not edited. If a task must, run `npm run test:mutation -- --mutate <file>` (Development Guide §12).
- Anything outside a task's file list or R1 to R3 needs the Product Owner's approval first.

## Authorization and reserved decisions

Objective authorized by the Product Owner's request that produced this plan (2026-10-04). No task starts until the Product Owner asks to continue. Not authorized: product behavior changes, changing ADR 0014's decision, lowering a floor outside R2, moving or rewriting existing tests.

Ask R1 and R2 once, in the T1 handoff, and record the answers in the table.

The Product Owner approved both recommended options on 2026-10-04 ("yes both" in response to the T1 handoff): R1 permits extracted modules to write the DOM while owner instances stay in the hook; R2 permits rebasing the hook's floors just below its measured coverage in each extraction commit, with each new module's floors at least 95 statements, 88.5 branches, 93.5 functions, and 98 lines, and just below its measured coverage. These decisions authorize only the initiative's stated scope. R3 remains open.

| ID | Decision reserved for the Product Owner | Planner default and recommendation | Needed by | Answer |
| --- | --- | --- | --- | --- |
| R1 | How strictly to read ADR 0014's sentence that the hook "holds one instance of each owner and is the single place that projects that state into React, the DOM, and the store". | Default applied (D1): one instance per owner created in the hook, the caret published only through `applyCaretState`, mode changed only through `changeVimMode`, no extracted module keeps a copy of an owner's fact. Under it T3 to T10 stay inside ADR 0014, and ARCHITECTURE §9 and §21 need only a module-map update. Strict alternative: extracted bodies never write the DOM; DOM writes (`setEditableText`, `setCaret`, `setNormalCaret`, class changes) arrive as one-line ports the hook implements, and T7 to T10 add that plumbing. Recommended: the default, because the ADR's rationale is parallel copies and scattered resynchronization, not where a DOM write sits. | T7 | Approved recommended default, 2026-10-04 |
| R2 | Rebasing the hook's per-file floor (`vitest.config.ts` L58-63: 95, 88.5, 93.5, 98 for statements, branches, functions, lines). Development Guide §12 says to restore coverage rather than lower a floor. | Moving covered code out lowers the hook's own ratio although no coverage is lost (inference; T1 measures the headroom). Proposal: each new module gets a floor just below its measured values and at least the hook's old floor per metric, and the hook's floor is rebased just below its new measurement in the same commit. If declined: add tests of the remaining hook code until the old floors hold, and stop when that is disproportionate. | T3 | Approved proposal, 2026-10-04 |
| R3 | Approve or decline T11 and T12, which move the caret-projection state and effects and the drag freeze into hooks that only `useNodeInputBindings` calls. That moves the projection point and the owner instances ADR 0014 places in the hook. It needs a new ADR that refines ADR 0014 (ADRs are not edited: `docs/decisions/README.md`) and an ARCHITECTURE §9 and §21 update. | Recommend approving T11 and promoting it right after T6 if relieving the hot spot is the goal; T12 has the lowest value. If declined, delete T11 and T12 from the table and record that under Decisions. | T11 | open |

Product Owner actions (not decisions): after T10 and after T13, check by hand in `npm run dev` with the real keyboard: IME composition, key repeat, autocorrect, and typing a link. Playwright cannot exercise them (Development Guide §8 and §9).

## Evidence at plan time

Read by the planner on 2026-10-04 at commit `c95c30c`. Line anchors in this plan are from the 1,251-line file at that commit; find seams by symbol.

1. The hook, in full: 14 `useRef`, 2 `useState`, 3 `useMemo`, 21 `useCallback`, 4 `useEffect` (L229, L610, L797, L810), 7 `useLayoutEffect` (L703, L707, L711, L715, L726, L756, L776). `bindings` (L830-1180) is one `useCallback` returning 18 members; the `VimKeyboardState` literal inside it is L978-1091. Options L65-86, result L88-96.
2. Consumers: one production caller, `src/renderer/App.tsx:78-95`, which passes every optional option. `bindings` feeds `renderInput` (`App.tsx:198-218`) and the memoized `NodeRow` (`NodeRow.tsx:28`), so its identity decides whether every mounted row re-renders. `dragFreeze` feeds `NodeList.tsx:51,183` and the effect and callback dependencies at `use-node-list-drag.ts:161-172,179-203`.
3. Tests: four suites call the hook through `bindings(node).onKeyDown`, `onMouseDown`, `inputRef`, and so on: `use-node-input-bindings.test.tsx` (2,571 lines), `use-node-input-bindings.property.test.tsx` (281), `vim-put-into-children.test.ts`, `vim-structural-repeat.property.test.ts`. `App.test.tsx` renders `App` with the real hook. No file under `src/renderer` calls `vi.mock`. `editor-input-handlers.test.ts` uses `src/renderer/test/vim-keyboard-double.ts`, not the hook.
4. Floors: `vitest.config.ts:58-63` for the hook and 99 for the owner modules. Floors are keyed by file path, so a new file has none until one is added.
5. Rules: ADR 0014; ARCHITECTURE §9 (L297-299) and §21 (L694-704); Development Guide §8 (navigation and caret inventory), §9 (tiers; input handling is also checked by hand), §11, §12 (L445: behavior-preserving refactors need no test changes; L455: floors; L463-465: mutation scope); `docs/decisions/README.md:3` (ADRs are historical and not edited). The latest ADR number is 0017.
6. Toolchain: `eslint.config.mjs:69` enables the `eslint-plugin-react-hooks` 7.1.1 `recommended` preset, whose README lists compiler-derived rules (`refs`, `immutability`, `preserve-manual-memoization`, `set-state-in-effect`). `tsconfig.web.json:8-13` sets `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`. `src/` has no `eslint-disable`. `.prettierignore` excludes Markdown.
7. Places that name the hook: ARCHITECTURE.md L244, 256, 299, 694, 696, 698, 704; Development Guide L216; `docs/VIM_CONFORMANCE.md` (22 lines); `src/renderer/AGENTS.md:9`; comments in `src/renderer/test/vim-keyboard-double.ts`, `src/renderer/vim-command-state.ts`, `src/renderer/vim-interaction.property.test.ts`, `src/renderer/editor-input-handlers.test.ts`.
8. Writer inventory (grep). `caretAuthority` is written only in `applyCaretState`. `pendingCaret` is produced in `changeVimMode`, `applyCaretState`, `onTextChange`, `onContentInput`, and `vim.scheduleCaret`, and cleared by its layout effect. `caretRevision` is incremented at six sites (`changeVimMode`, `applyCaretState`, the pending-Visual-selection effect, `onTextChange`, `onContentInput`, `vim.scheduleCaret`). `syncedImageFocusToken` is written by `applyCaretState` (when `fromFocus`) and `syncImageCaretToFocus`; `latestVimMode` by `changeVimMode` and one layout effect; `latestFocus` by one layout effect; `pendingVisualSelection` by `restoreVisual`, `shiftCurrentNode`, and its consumer effect; `pendingLinkDraft` by `onContentInput` and `onContentChange`.
9. Churn, from subjects only: `.git/logs/HEAD` lists 79 `fix` commits from 2026-09-26 to 2026-10-04. About 25 concern code that lives in the hook: caret and image-caret synchronization (14), caret publication and projection (2), Insert and Replace session completion and flush (4), Visual and pending-command clearing (2), and single fixes for the drag caret, focus reveal, viewport motion, and the selection mark.

Inference (not verified): per-file fix attribution; the hook sizes after T10 (about 650 lines) and after T12 (about 400 lines); that the hook's floors fail once covered code moves out; that the passive effects touch disjoint resources, so their order may change in T11; that React re-runs a ref callback whose identity changed; how the React compiler lint rules treat each pattern; that one extra deps literal per handler group per `bindings(node)` call is negligible.

Not done at plan time: coverage measurement and any test, lint, build, or E2E run. The planner had no shell; the primary agent confirmed the commit, the file sizes, and the 22-commit `fix:history` result.

## Target module map

| Module | Holds | Seam in the hook | Task |
| --- | --- | --- | --- |
| `editor-dom.ts` (existing) | `nodeTextLength`, `hasMultiCharacterSelection`, `setEditableText` | L1235-1250 | T2a |
| `node-input-types.ts` | `PendingCaret`, `PendingVisualSelection`, `NodeVisualSelection` | L79-80, L115-131 | T2b |
| `vim-viewport-motion.ts` | row geometry, H/M/L and half-page target | `moveVimViewport` L651-701 | T3 |
| `vim-structural-repeat.ts` | dot replay of structural changes | `repeatStructural` L490-553 | T4 |
| `vim-node-visual-commands.ts` | whole-node Visual and sibling-range commands | L289-488 | T5 |
| `caret-projection-rules.ts` | pure currency rules for pending caret work | L172-173, L739-744, L782-791 | T6 |
| `vim-session-finish.ts` | Insert, Replace, structural session finishing; Vim editing switch | L266-271, L555-631, L1182-1224 | T7 |
| `vim-keyboard-state.ts` | the `VimKeyboardState` adapter | L978-1091 | T8 |
| `node-input-text-handlers.ts` | text edit, link draft, composition handlers | L860-930 | T9 |
| `node-input-pointer-handlers.ts` | blur, focus, pointer, select, paste, menu, link click, cut | L844-859, L931-971, L1093-1148 | T10 |
| `use-caret-projection.ts` | caret refs, publication, image sync, projection effects | L112-135, L159-179, L237-287, L703-827 | T11 (R3) |
| `use-drag-caret-freeze.ts` | drag caret freeze | L162-163, L181-235, L1227-1230 | T12 (R3) |

Remaining in the hook after T10: option destructuring, owner and ref creation, the `useCallback` shells, the effects, `registerHandle`, `vimTextCommandState`, `inputRef`, `selectedAll`, `disabled`, the `bindings` composition, and the return value.

## Common rules (T2 to T12)

**C1. Extraction method.**
1. Move text; do not rewrite. Each moved callback body becomes an exported plain function of the new module, with its comments. Its first line destructures a `deps` argument under the names the old body used. Permitted substitutions only: `vimSession.current` becomes `session`, `vimCommandState.current` becomes `commandState` (the owner objects are passed), `latestVimMode.current` becomes a `getMode()` port, `inputs.current.get(id)` becomes a `getInput(id)` port, `caretAuthority.current` becomes a `readAuthority()` port. Any other edit may change behavior: stop and describe it.
2. The hook keeps one `useCallback` (or `useMemo`) shell per moved callback with the same dependency array as today. The shell builds `deps` inside its body and reads `ref.current` only there, so callback identities change under exactly the same conditions as today. Handler groups built inside `bindings(node)` are built per call, as today's literals are.
3. State stays in the hook through T10: owner instances, refs, effects. Modules receive them as arguments and never create, cache, or copy them.
4. Imports come from the same sources the hook uses; never from `./use-node-input-bindings`; no node or electron imports (ESLint). Use `import type`, conditional spreads for optional properties, and delete imports the hook no longer uses.
5. No `eslint-disable` or `@ts-expect-error`. If a React compiler lint rule rejects a pattern, copy the pattern the hook already uses (access-time getters inside `useMemo`, as `registerHandle` and `vimTextCommandState` do) or report it.
6. Export only what the hook or a test uses. Names in this plan are suggestions; keep them descriptive.

**C2. Behavior a faithful move can still break (the reviewer checks each).**
1. `bindings` identity (App `renderInput` and memoized rows) and `dragFreeze` identity (`use-node-list-drag.ts` effect dependency). Guard: T1.
2. `inputRef` is a new closure per `bindings(node)` call and React re-runs a ref callback whose identity changed (inference). Keep it inline and unmemoized, together with `selectedAll` and `disabled`.
3. Layout-effect order: focus projection (L726) then pending Visual selection (L756) then pending caret (L776). Do not merge, reorder, or add dependencies. `latestVimMode` is written synchronously by `changeVimMode` and again by a layout effect.
4. Accessor objects (`registerHandle`, `vimTextCommandState`, `vim.commandState`, `vim.imageTextCursor`) must not be spread, copied, or evaluated early.
5. The `vim` keyboard state exists only when `vimEnabled` (ARCHITECTURE §21).
6. Optional-option defaults (`setVimMode = () => undefined`, and so on) are new functions per render when a caller omits them; App passes all of them. `useRef(createVimEditSessionState())` and `useRef(createVimCommandState())` run their factory on every render. Do not "fix" either here (F3).
7. Tests replace the global `queueMicrotask` and timers: call globals at call time, never at import.
8. Keep comments with the code they explain; many cite PRODUCT sections.

**C3. Tests.** Existing tests stay untouched; `git diff --stat` over `*.test.*` shows only added files (comment-only edits named in T8, T9, T11 excepted). Each new module gets a direct test file beside it. Store-driven code uses `createRealStoreHarness`; `createEditorStoreDouble` only for failure injection (Development Guide §12). Cover every early-return guard and branch of the moved code. Property tests are optional (wiring and projection, AGENTS.md §9); the existing property suites must stay green.

**C4. Floors.** After each extraction run `npm run test:coverage`, read the new module's four metrics, and add `'src/renderer/<module>.ts': { statements, branches, functions, lines }` to `vitest.config.ts`, each just below the measured value (convention at `vitest.config.ts:38-39`) and at least the hook's original floor per metric. R2 is approved: rebase the hook's floors just below its new measured coverage in the same extraction commit. Never lower any other existing floor.

**C5. Validation (Moderate Risk, Development Guide §9, unless the task says otherwise).**
1. Focused loop: `npx vitest run <new test files> src/renderer/use-node-input-bindings.test.tsx src/renderer/use-node-input-bindings.property.test.tsx src/renderer/use-node-input-bindings.identity.test.tsx src/renderer/vim-put-into-children.test.ts src/renderer/vim-structural-repeat.property.test.ts src/renderer/editor-input-handlers.test.ts`.
2. Gate: `npm run check` (typecheck, lint, format, docs, requirements, e2e-modes, opencode, coverage with floors, build, audit). An audit that cannot reach the network is reported as blocked.
3. Real Electron: `npm run test:e2e -- e2e/vim-image-caret.spec.ts e2e/vim-text-editing.spec.ts e2e/vim-navigation-and-visual.spec.ts e2e/vim-clipboard.spec.ts e2e/vim-toggle.spec.ts` plus the task's extras. It needs macOS with a display; a run that cannot launch Electron is blocked, not passed.
4. Record each result with the exact command and `npm run validation:snapshot` output (Development Guide §9). Reuse results while their inputs are unchanged.

**C6. Review.** An independent reviewer pass (AGENTS.md §13, shared interaction state) is required for T5 to T12. Give it this plan, `git status`, the full diff, and the validation record. It compares each removed block with the added block against C1 and checks C2. For T2 to T4 the primary agent's diff review with the same comparison is enough unless the diff is not a textual move. No separate product verifier: no user-visible behavior changes; the E2E set and the Product Owner's manual check cover it.

**C7. Commit and handoff.** One commit per task (T2 has two), message `type(scope): summary` with no attribution line (AGENTS.md §12). The task's status, the next task, Baseline numbers, and R answers go into the same commit. At most four tasks per session; stop earlier on a surprise. A temporary `WORKING_PLAN.md` follows AGENTS.md §8; this plan normally suffices. The handoff lists what was completed, decisions made with their principle, validation passed, failed, or blocked, the next task, and the resume prompt; `npm run fix:history` output only when a defect was fixed.

**C8. Stop and report instead of continuing when:** the worktree holds changes outside the initiative; an existing test fails and the cause is not a slip in the move; a change to an existing test or a lower floor seems necessary (R2); a lint or type rule rejects the C1 pattern; behavior differs in any observable way, including a suspected older defect (fix it defect-first as a separate `fix` commit, or ask under AGENTS.md §14); the diff needs a file outside the task's list; the perf comparison exceeds the suite's tolerance (`PERF_REGRESSION_TOLERANCE`, Development Guide §12).

## Tasks

Statuses: `Planned`, `Ready`, `In progress`, `Blocked`, `Done`. Pick the lowest-numbered `Planned` or `Ready` task whose dependencies are `Done`. Tiers are from Development Guide §9.

| ID | Outcome | Depends on | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | Baseline recorded; identity of `bindings`, `dragFreeze`, `setVimEditing` characterized | none | New identity tests pass on unchanged code; Baseline filled; R1 and R2 asked | Low | Done |
| T2 | (a) DOM helpers in `editor-dom.ts`; (b) named pending types and one writer each for `pendingCaret` and `pendingVisualSelection` | T1 | Helper tests; writer grep; existing tests preserved except added T2a helper cases explicitly authorized 2026-10-04; hook and identity suites green | (a) Low, (b) Moderate | Done |
| T3 | `vim-viewport-motion.ts` | T1, R2 | Direct tests; viewport oracles green; floor added | Moderate | Done |
| T4 | `vim-structural-repeat.ts` | T1 | Direct tests; replay oracles green; floor added | Moderate | Done |
| T5 | `vim-node-visual-commands.ts` | T2b | Direct tests; whole-node Visual and `gv` oracles green; floor added | Moderate | Done |
| T6 | `caret-projection-rules.ts` | T2b | One test per currency rule; focus-pass oracles green; floor added | Moderate | Done |
| T7 | `vim-session-finish.ts` | T2, T6, R1 | Direct tests; Replace, Insert, flush, and switch oracles green; shutdown E2E green | Moderate (High if the finisher registration changes) | Done |
| T8 | `vim-keyboard-state.ts` | T2b, T5, T7, R1 | Direct tests; every key-press oracle green; floor added | Moderate | Ready |
| T9 | `node-input-text-handlers.ts` | T2b, T7 | Direct tests; link and composition oracles green; floor added | Moderate | Planned |
| T10 | `node-input-pointer-handlers.ts` and perf comparison | T2, T7, R1 | Direct tests; pointer, menu, and paste oracles green; perf within tolerance | Moderate | Planned |
| T11 | `use-caret-projection.ts` with contract tests and a refining ADR | T6 to T10, R3 | One contract test per projection rule; full E2E and perf green | Moderate with full E2E | Blocked (R3) |
| T12 | `use-drag-caret-freeze.ts` | T11, R3 | Freeze oracles and drag E2E green; `dragFreeze` identity stable | Moderate | Blocked (R3) |
| T13 | Docs, final floors, aggregate validation, plan removal | T1 to T10, and T11, T12 if approved | `npm run check:full`, perf comparison, ARCHITECTURE updated, plan removed | Aggregate | Planned |

### T1. Baseline and characterization (Low, Done)

- Files: `src/renderer/use-node-input-bindings.identity.test.tsx` (new); this plan (Baseline, statuses, R answers).
- Do:
  1. Fill Baseline: `HEAD`; line counts; the hook's row from `npm run test:coverage` with its uncovered functions and branches (`coverage/index.html`) and the headroom per metric (covered count minus floor times total); `npm run fix:history -- src/renderer/use-node-input-bindings.ts`; `git log --oneline -30 -- src/renderer/use-node-input-bindings.ts`.
  2. Record the perf baseline as `PERF_RESULTS="test-results/perf-input-bindings-baseline.json" npm run test:perf` (macOS display; Development Guide §12). Never commit it. If it cannot run, write "unavailable"; later comparisons are then unavailable too.
  3. Add the identity tests (`// @vitest-environment jsdom`, own `renderHook` with stable option callbacks, `createRealStoreHarness`): (i) `bindings` keeps its identity when only `focus` changes (new token and cursor); (ii) `bindings` changes when exactly one of `vimMode`, `vimEnabled`, `selectedNodeId`, `persistenceLocked`, `nodeVisualSelection`, `onPreviewAttachment`, `onFoldCommand` changes (table-driven); (iii) `dragFreeze` and `setVimEditing` keep their identity across each of those rerenders. Assert what the code does today. The expectations follow from the dependency array of `bindings` (L1149-1179) and the callbacks it lists; if an assertion contradicts that analysis, record the real behavior here and report it instead of changing the hook.
  4. In the handoff, ask R1 and R2 once.
- Validation: `npx vitest run src/renderer/use-node-input-bindings.identity.test.tsx`, `npm run typecheck`, `npm run lint`, `npm run format:check:changed`, `npm run check:docs`.
- Commit: `test(renderer): characterize input bindings and drag freeze identity`.

### T2. Extraction prerequisites (two commits)

- T2a (Low; still run `npm run check` because executable source changes). Move `nodeTextLength`, `hasMultiCharacterSelection`, `setEditableText` (L1235-1250) to `src/renderer/editor-dom.ts` under the same names and export them; the hook imports them. Reason: later modules need them and must not import the hook. Files: `editor-dom.ts`, `editor-dom.test.ts` (textarea and contenteditable; selection widths 0, 1, 2; text write), the hook. Commit: `refactor(renderer): move shared input DOM helpers to editor-dom`.
- T2b (Moderate). New `src/renderer/node-input-types.ts`, types only: `PendingCaret` (the record at L115-127 including `refocus`), `PendingVisualSelection` (L128-131), `NodeVisualSelection` (`{ anchorId: string; focusId: string }`, used by the hook's options only; App is not edited). In the hook add `schedulePendingCaret(request)`, producing `{ ...request, normal: false, revision: ++caretRevision.current, focusToken: latestFocus.current?.token }`, and use it at the three hand-built records (`onTextChange` L873, `onContentInput` L886, `vim.scheduleCaret` L1048). Add `schedulePendingVisualSelection(pending)` and use it in `restoreVisual` (L305) and `shiftCurrentNode` (L485). Evaluation order and field values stay as they are. Acceptance: Grep shows `pendingCaret.current = {` only in `applyCaretState` and `schedulePendingCaret`, and `pendingVisualSelection.current =` only in `schedulePendingVisualSelection` and its consumer effect; no test edited; hook suites, identity tests, and the Vim E2E set pass. Reviewer: yes. Commit: `refactor(renderer): name pending caret types and write them through one function`.

### T3. Viewport motion (Moderate; R2 applies here first)

- Files: new `src/renderer/vim-viewport-motion.ts`, `vim-viewport-motion.test.ts`; the hook; `vitest.config.ts`; this plan. Recommended: `vim-viewport-motion.property.test.ts`.
- Seam: `moveVimViewport` (L651-701), as committed in `c95c30c` (counts, first-non-blank landing, fully visible rows).
- Module: `readViewportRows()` (DOM read: `viewportBounds()` from `scroll-viewport.ts`, every `.node-row` element's `data-node-id` and rect; the DOM contract is set at `NodeRow.tsx:70-73`); `viewportMotionTarget(rows, viewport, nodeId, motion, count)` (pure: intersecting rows, fully visible rows for H/M/L with fallback to clipped rows, target index, returns a node ID or `undefined`); `moveViewportSelection(deps, nodeId, motion, cursor, count)` (column rule, then `store.selectNode` and `syncImageCaretToFocus`). The shell's deps stay `[store, syncImageCaretToFocus]`.
- One intentional difference: each row's rect is read once instead of twice. Both reads happen in one synchronous call, so it is unobservable.
- Tests: table-driven `viewportMotionTarget` (every motion; fully visible preferred; clipped fallback; count clamps at both ends; current row outside the viewport; nothing intersects; rows without a node ID); `moveViewportSelection` with `createEditorStoreDouble` (column rule, attached node, store not ready); `readViewportRows` in jsdom with mocked rects. Property test: the target is always an intersecting row, and when a fully visible row exists H/M/L never return a clipped one.
- Oracles: hook tests "moves the viewport caret with %s, Ctrl: %s", "%s with count %d selects %s among four fully visible rows", "lands H on the image of a destination that has one", "lands H, M, and L on the first non-blank character of the destination", "uses the visible edge when Ctrl+%s starts outside the viewport", "%s skips rows that are only partly visible, so it never has to scroll", "selects the only partly visible row when no row is fully visible", "leaves selection unchanged when no rows intersect the viewport"; the H/M/L cases in `editor-input-handlers.test.ts`; E2E "supports line and viewport motions" and "H and L select fully visible rows without scrolling the clipped ones into view" in `e2e/vim-navigation-and-visual.spec.ts`.
- Commit: `refactor(renderer): extract viewport motion from the input bindings hook`.

### T4. Structural replay (Moderate)

- Files: new `src/renderer/vim-structural-repeat.ts`, `vim-structural-repeat.test.ts`; the hook; `vitest.config.ts`; this plan.
- Seam: `repeatStructural` (L490-553), the dot replay of `VimStructuralChange` (`vim-keyboard-types.ts:53-77`). Module: `repeatStructuralChange(deps, change, cursor): boolean` with deps `{ store, session }`. Shell deps stay `[store, vimSession]`.
- Tests (real store): store not ready or persistence locked returns false; per change kind: delete (span longer than the remaining siblings returns false; one removed node versus a forest sets the matching register), open and child-open (success is a changed document; depth limit returns false), put and forest-put (repeat count, `past`), shift, join, visual (selected node is the current parent returns false; missing span end returns false; register updated only on success).
- Oracles: hook tests "repeats subtree and forest puts with fresh identities and repeats structural deletion", "does not repeat a whole-node mutation when its sibling span is unavailable", "repeats sibling opening with %s and captured text" and the "replays ..." and "stops ..." tests around them; `vim-structural-repeat.property.test.ts`; E2E "replays counted dd with complete subtrees and one undo per successful iteration", "replays shifts and joins with exact sibling spans and stops counted dot on failure", "replays counted gp and gP with captured incoming subtrees and their destination".
- Commit: `refactor(renderer): extract structural replay from the input bindings hook`.

### T5. Whole-node Visual commands (Moderate; reviewer)

- Files: new `src/renderer/vim-node-visual-commands.ts`, `vim-node-visual-commands.test.ts`; the hook; `vitest.config.ts`; this plan.
- Seam (L289-488): `restoreVisual`, `moveNodeVisual`, `commandNodeVisual`, `verticalOperator`, `shiftNodeVisual`, `joinNodeVisual`, `shiftCurrentNode`. One exported function per callback, each taking only the deps its body used: `store`, `session`, `commandState`, `selection`, `setSelection`, `changeVimMode`, `syncImageCaretToFocus`, `schedulePendingVisualSelection`. Character `restoreVisual` keeps its write order (`store.selectNode`, then the pending write, then `changeVimMode('visual')`); node restoration sets endpoints, selects focus, changes mode, then synchronizes the image caret. `shiftCurrentNode` keeps its actual order: store shift, repeat recording, then pending selection restoration. Shells keep their dependency arrays. Do not merge the four copies of the anchor and focus span computation in this move (F2). Split into two commits if the diff passes about 300 lines.
- Tests (real store): guards per function (store not ready, no selection, anchor or focus not located, current-parent heading); move clamps and keeps direction; command: `y` copies through `copyVimForest`, `p` and `P` count and register exchange, `c` and `s` begin a structural session and enter Insert, the rest return to Normal and clear command assembly; shift and join record repeat changes only on success; `restoreVisual` for node and character memory.
- Oracles: hook tests on whole-node Visual (endpoints, `>` and `<`, counts, `dj`, `d2j`, `dk`, `yj`, `cj`, `J` and `gJ`, put and register exchange), the `gv` describe, "resyncs the image caret after a whole-node Visual command keeps the same node selected", "keeps whole-node Visual active when a range move blurs the previous input"; E2E whole-node Visual tests in `vim-navigation-and-visual.spec.ts` and `vim-clipboard.spec.ts` (this code calls `copyVimForest`; no boundary behavior changes, the existing contract tests stay the guard).
- Commit: `refactor(renderer): extract whole-node Visual commands from the input bindings hook`.

### T6. Caret projection rules (Moderate; reviewer)

- Files: new `src/renderer/caret-projection-rules.ts`, `caret-projection-rules.test.ts`; the hook; `vitest.config.ts`; this plan.
- Seam: three decisions that read no ref: the pending-caret filter in `changeVimMode` (L172-173), the "is the Normal caret already drawn" test in the focus effect (`const matches`, L740-744), and the currency guard in the pending-caret effect (L782-791). Module: `pendingCaretAfterModeChange(pending, mode, revision)`, `normalCaretIsDrawn(input, target)`, `currentPendingCaretInput(pending, snapshot, revision, input)` (returns the input to project on, or `undefined` when the pending caret is stale). The hook keeps all refs and effects; only the expressions move.
- Tests: one negative case per currency condition (store not ready, selected node differs, focus token differs, revision superseded, input missing or disconnected, recorded element replaced) plus the positive case; mode-compatibility filter both ways; drawn-caret test for block, collapsed, and non-textarea inputs.
- Navigation and caret inventory (Development Guide §8): use the writer inventory in Evidence 8. T6 changes no transition; the reviewer traces each moved condition.
- Oracles: hook tests "abandons a queued focus pass after a newer same-node pointer selection", "keeps a newer motion after a queued focus pass on the same token", "keeps the native append position when Insert supersedes queued Normal focus", "ignores focus intents for nodes that are not registered", "focuses registered inputs with the %s caret"; `use-node-input-bindings.property.test.tsx`.
- Commit: `refactor(renderer): extract caret projection rules from the input bindings hook`.

### T7. Session finishing and editing switch (Moderate; reviewer; R1 default applies)

- Files: new `src/renderer/vim-session-finish.ts`, `vim-session-finish.test.ts`; the hook; `vitest.config.ts`; this plan.
- Seam: `finishStructuralInsert` (L266-271), `finishVimReplace` (L555-591), `finishPendingEdits` (L593-608; the `registerPendingEditFinisher` effect at L610 stays), `finishVimInsert` (L612-631), `setVimEditing` (L1182-1224). Module: `finishStructuralInsertSession`, `finishReplaceSession`, `finishInsertSession`, `finishPendingEditSessions`, `switchVimEditing`. Ports added in the hook: `getInput(id)`, `readAuthority()`, `getMode()`; existing: `applyCaretState`, `changeVimMode`, `setNodeVisualSelection`. Shell dependency arrays stay as they are, so `finishPendingEdits` keeps the identity the store's registration effect depends on (`[store, finishPendingEdits]`).
- Tests (real store): Replace with and without a typed buffer and input; `preserveDomSelection`; `retreatCursor`; attached node; a second call after the session was consumed is a no-op; Insert: structural always captures, plain records only when `completed` and the registered input matches; the pending-edit finisher returns the committed flag and returns Replace to Normal; switch on and off, with and without a focused input, multi-character selection kept, structural Insert finished.
- Extra E2E: `e2e/shutdown-failures.spec.ts` (the three pending-Replace tests) and `e2e/undo-sessions.spec.ts`. Reclassify as High Risk (`npm run check:full`) if the finisher registration or the quit-flush order changes in any way.
- Oracles: hook tests "overwrites and appends in Replace mode, then commits one repeatable range edit", "registers a pending-edit finisher with the store and unregisters it on unmount", "flushes a Replace session once, with typed content: %s", "commits a pending Replace session exactly once when the store re-enters the finish path", "does not record a plain Insert session finished by %s", "keeps the previous repeatable change when a blur interrupts an Insert session", "does not record a plain Insert session ended by a shutdown flush", "captures opened child text for structural dot repeat after %s", and the "Vim editing switch" describe.
- Commit: `refactor(renderer): extract session finishing from the input bindings hook`.

### T8. Vim keyboard-state adapter (Moderate; reviewer; R1 default applies)

- Files: new `src/renderer/vim-keyboard-state.ts`, `vim-keyboard-state.test.ts`; the hook; `vitest.config.ts`; comment-only edit to the header of `src/renderer/test/vim-keyboard-double.ts` (it names the hook as the production wiring); this plan.
- Seam: the `vim` object built for `createEditorKeyDownHandler` (L978-1091). Module: `createVimKeyboardState(deps, node): VimKeyboardState`. The hook keeps the `!vimEnabled ? undefined : ...` gate and passes the render-time `vimMode`, `registerHandle`, the shells, the ports, `schedulePendingCaret`, the Visual selection and its setter, `onFoldCommand`, `onPreviewAttachment`. Never spread or copy the returned object (C2.4). `npm run typecheck` proves every `VimKeyboardState` member is supplied.
- Tests: `getCaretState` same node versus another node; `setImageCaret` active and inactive (cursor at text end versus clamped, return cursor kept or cleared); the `imageTextCursor` setter publishes through `applyCaretState(..., 'preserve-selection')` only when the authority has a node; `nodeVisual.enter` refuses the current-parent heading and a store that is not ready; `swap` only with a selection; `beginStructuralOpen` and `beginStructuralChildOpen` pass the node ID; forwarding members reach the right port.
- Oracles: every hook test that presses keys; `editor-input-handlers.test.ts` (uses the double; unchanged); the property suites.
- Commit: `refactor(renderer): extract the Vim keyboard state adapter from the input bindings hook`.

### T9. Text edit, link, and composition handlers (Moderate; reviewer)

- Files: new `src/renderer/node-input-text-handlers.ts`, `node-input-text-handlers.test.ts`; the hook; `vitest.config.ts`; comment-only edit in `editor-input-handlers.test.ts` (the comment that says "`use-node-input-bindings.ts` makes"); this plan.
- Seam: `onTextChange` (L860-882), `onContentInput` (L883-901), `onContentChange` (L902-911), `onCompositionEnd` (L912-925), `onCompositionStart` (L926-930). Module: `createTextEditHandlers(deps, node)` returning those five. `pendingLinkDraft` stays a ref in the hook and is passed as the ref object; `composing` is the render-time value. The two copies of the link-draft reconciliation stay as they are (F2).
- Tests: a link appears only when typing completes a URL; composing text defers linking; the textarea-to-rich-editor swap schedules a `refocus` pending caret; a draft is reused only while it still matches the node text; composition start clears a pending command, finishes Replace without rewriting the DOM, and sets composing; composition end resumes a Replace session only in Replace mode.
- Real IME cannot be driven by Playwright (Development Guide §8), so the unit contract sequences are the guard, plus the Product Owner's manual check.
- Extra E2E: `e2e/hyperlink.spec.ts`, `e2e/typed-input.spec.ts`, `e2e/editing.spec.ts`.
- Oracles: hook tests "turns a typed URL into a link only once the typed word is a valid URL", "waits for the end of a native composition before linking a typed URL", "edits content using existing links and defaults to no links for plain text", "reuses a pending link draft while its text still matches the edited node", "resumes Replace mode after native text composition", "keeps the native insertion end when composition consumes a typed Replace buffer", "clears an unfinished Vim operator on blur and composition start".
- Commit: `refactor(renderer): extract text edit handlers from the input bindings hook`.

### T10. Pointer, focus, clipboard, and menu handlers (Moderate; reviewer; R1 default applies)

- Files: new `src/renderer/node-input-pointer-handlers.ts`, `node-input-pointer-handlers.test.ts`; the hook; `vitest.config.ts`; this plan.
- Seam: `onBlur` (L844-859), `onContextMenu` (L931-954), `onClick` (L955-961), `onCut` (L962), `onFocus` (L963-971), `onMouseDown` (L1093-1120), `onMouseUp` (L1121-1134), `onPaste` (L1135-1140), `onSelect` (L1141-1148). `inputRef`, `selectedAll`, `disabled` stay in the hook (C2.2). Module: `createPointerHandlers(deps, node)`. `onContextMenu` keeps calling `window.treeApi.showEditorContextMenu` directly; the IPC boundary and its contract tests are untouched.
- Tests: blur clears command assembly, finishes Insert except a structural session that began on this node, commits Replace, returns Normal from Replace, and ends the text session; mousedown publishes the pointer caret with `preserve-selection`, a right click keeps the selection and DOM, a structural session is left to blur; mouseup acts only in Normal; focus selects an unselected node and redraws the Normal caret at an attached node's terminal position; select ends the text session only outside Normal and only for a non-collapsed selection; paste finishes Replace first; menu: locked store, missing API, and async failure reported; link click prevented, Cmd+click opens.
- Extra E2E: `e2e/context-menu.spec.ts`, `e2e/clipboard.spec.ts`, `e2e/pointer-cursor.spec.ts`, `e2e/drag-and-drop.spec.ts`.
- Perf at T10: compare `perf/typing.spec.ts` and `perf/vim.spec.ts` with the T1 baseline, using the `PERF_BASELINE` and `PERF_RESULTS` forms in Development Guide §12 and `test-results/perf-input-bindings-after-t10.json` as the output. If the per-call deps literal shows up, hoist the deps into one `useMemo` with access-time getters, as `vimTextCommandState` does.
- Product Owner action afterwards: the manual native-keyboard check.
- Commit: `refactor(renderer): extract pointer and clipboard handlers from the input bindings hook`.

### T11. Caret-projection hook (Blocked until R3; reviewer)

- Files: new `src/renderer/use-caret-projection.ts`, `use-caret-projection.test.tsx`; the hook; `vitest.config.ts`; a new ADR (next free number) that refines ADR 0014 without editing it, plus its row in `docs/decisions/README.md`; comment-only edit in `src/renderer/vim-interaction.property.test.ts` ("mirroring `use-node-input-bindings.ts`"); this plan.
- Seam: refs `inputs`, `normalCaretResizeObserver`, `caretRevision`, `pendingCaret`, `pendingVisualSelection`, `latestFocus`, `syncedImageFocusToken`, `latestVimMode` (L112-135) and `caretAuthority` (L159-161); `changeVimMode`, `applyCaretState`, `syncImageCaretToFocus` (L165-179, L237-287); `schedulePendingCaret` and `schedulePendingVisualSelection` (T2b); the seven layout effects (L703-794) and the selection-change and resize-observer effects (L797-827). The body of `inputRef` becomes `registerInput(nodeId, input)` while the closure itself stays per call.
- Module: `useCaretProjection(options)` returning the ports used since T7 (`getInput`, `registerInput`, `readAuthority`, `getMode`, `changeVimMode`, `applyCaretState`, `syncImageCaretToFocus`, `schedulePendingCaret`, `schedulePendingVisualSelection`). Called once from `useNodeInputBindings`, at the position of the first moved effect. Layout-effect order stays as C2.3 says. The two passive effects now run before the freeze and finisher effects; the reviewer confirms they are independent (inference). The identity of `applyCaretState`, `changeVimMode`, and `syncImageCaretToFocus` must change under the same conditions as today (T1 guard).
- Tests, one per rule in ARCHITECTURE §9 (L297) and the Evidence 8 inventory: a newer intent supersedes earlier pending work; a pending caret is consumed only under the T6 conditions and `refocus` focuses first; a mode change keeps only a compatible pending projection; the focus effect projects now and once more in the microtask only if token and revision are unchanged, and uses the authority cursor on the same node; a new focus token replaces local image state and an old token is a no-op; the pending Visual selection is restored after the focus projection, bumps the revision, and rewrites the live endpoints; selection change marks `node-input-text-selected` for a multi-character selection on the active input; the resize observer skips a multi-character selection. Optionally commit the contract tests first against the unchanged hook, then the move.
- Validation: Moderate plus the full E2E suite (`npm run test:e2e`) and the perf comparison; Product Owner manual check.
- Commit: `refactor(renderer): move caret projection into its own hook`.

### T12. Drag-freeze hook (Blocked until R3; depends on T11; reviewer)

- Files: new `src/renderer/use-drag-caret-freeze.ts`, `use-drag-caret-freeze.test.tsx`; the hook; `vitest.config.ts`; this plan. `drag-caret-freeze.ts` (mutation-scoped) is not edited.
- Seam: refs `frozenCaret`, `frozenPointerListener` (L162-163), `clearFrozenPointerListener`, `releaseFrozenCaret`, `beginFrozenCaret` (L181-227), the unmount effect (L229-235), the `dragFreeze` memo (L1227-1230). Module: `useDragCaretFreeze({ getInput, readCaret })` returning the same `{ begin, end }` object, stable for the mount (T1 guard).
- Tests: the hook's "drag caret freeze" describe stays; add direct tests of the same transitions. Extra E2E: `e2e/drag-and-drop.spec.ts`, `e2e/drag-and-drop-hierarchy.spec.ts`, `e2e/vim-image-caret.spec.ts` (cancelled drag).
- Commit: `refactor(renderer): move the drag caret freeze into its own hook`.

### T13. Close-out (aggregate validation)

- Files: `docs/ARCHITECTURE.md` (L244, 256, 299, 694, 696, 698, 704: name each new module and keep "one instance of each owner" accurate for what was done), `src/renderer/AGENTS.md` (L9), `vitest.config.ts` (final floors and comments), this plan and its README row (removed in the closing commit once the Product Owner confirms no further tasks remain: `npm run retire:file -- plans/input-bindings-decomposition.md`).
- Validation: `npm run check:full` on the final snapshot; perf comparison with the T1 baseline; `npm run check:docs`; the Product Owner's manual native-keyboard check.
- Commit: `docs(architecture): record the input bindings module map and close the decomposition plan`.

## Decisions

| ID | Decision | Principle followed |
| --- | --- | --- |
| D1 | Narrow reading of ADR 0014 for T3 to T10; R1 approved by the Product Owner on 2026-10-04 | ADR 0014's own rationale; explicit Product Owner decision |
| D2 | Shells keep their dependency arrays; modules take explicit `deps` | Same callback identities; PRODUCT.md §22.2, no added render work |
| D3 | Flat files in `src/renderer/`, named by responsibility | Existing layout (`vim-*.ts`, `use-*.ts`); ARCHITECTURE §21 calls structure a guideline |
| D4 | Existing tests stay in place; new tests in new files | Development Guide §12 (L445); `docs/VIM_CONFORMANCE.md` citations |
| D5 | Leaf modules first, projection core last and gated | Risk grows with shared state; R3 |
| D6 | `inputRef`, `selectedAll`, `disabled` stay in the hook | C2.2 |
| D7 | Rebase hook floors after extraction; new module floors meet the hook's original floors. R2 approved by the Product Owner on 2026-10-04 | Explicit Product Owner decision; per-module coverage guards retained |

## Follow-up candidates (not authorized; each needs a Product Owner request)

- F1. `src/renderer/test/vim-keyboard-double.ts` copies the authority formulas (`getCaretState`, `setImageCaret`, `imageTextCursor`); move them to one pure function both use.
- F2. Four copies of the anchor and focus span computation (T5) and two copies of the link-draft reconciliation (T9).
- F3. `useRef(createVimEditSessionState())` and `useRef(createVimCommandState())` run their factory on every render.
- F4. Splitting `use-node-input-bindings.test.tsx` (2,571 lines); cited tests would need `docs/VIM_CONFORMANCE.md` edits.
- F5. `vim-keyboard-handler.ts` (926 lines) and `editor-input-handlers.test.ts` (about 3,900 lines).
- F6. Sibling-range and span arithmetic (`locateNode` plus index math in T4 and T5) belongs to the application layer by AGENTS.md §7; moving it crosses a layer and needs Product Owner approval.

## Baseline (T1 fills the last column)

| Item | At plan time | Recorded by T1 |
| --- | --- | --- |
| `HEAD` and snapshot | `c95c30c`, clean worktree | Runtime HEAD `7e5fcc988028eab7e5cd5c8e5b16ca5666e7da66`; initially clean. Measurement snapshot with the new identity test: `sha256:3e30387d9bb3c86f328dff9790bd0e6fff67e40286f9ed3a69fe6026594fad8e`. |
| Hook lines | 1,251 | 1,251; unchanged |
| Hook test lines (`.test.tsx`, `.property.test.tsx`) | 2,571, 281 | 2,571, 281; unchanged |
| Hook coverage (statements, branches, functions, lines) and headroom | unmeasured | Statements 580/609 (95.23%), branches 438/489 (89.57%), functions 94/100 (94%), lines 503/508 (99.01%). Headroom, covered minus floor × total: 1.45 statements, 5.235 branches, 0.5 functions, 5.16 lines. |
| `npm run fix:history -- src/renderer/use-node-input-bindings.ts` | 22 `fix` commits for this file in the 14-day default window (2026-10-04) | 23 entries on 2026-10-04, from `59da5c3` to `e3f63f7`; the command reports a possible shared design cause. This initiative already addresses the cluster. |
| `git log --oneline -30 -- src/renderer/use-node-input-bindings.ts` | 10 `fix` subjects among the 30 newest commits | Confirmed 10; newest hook commit remains `c95c30c`. |
| Perf baseline artifact (local, never committed) | none | `test-results/perf-input-bindings-baseline.json`, created `2026-10-04T16:11:37.719Z`, darwin/arm64, Node v24.13.1, visible Electron, one worker; all 41 scenarios passed. SHA-256 `2c369d62b5db4de5349983f5d739daf8defe42e20f7d9187c89b4dd3b0a0430a`. |

### T1 findings

The eight new identity tests confirm the planned dependencies on unchanged runtime code. A focus-only token/cursor update preserves all three public identities. Changing exactly one of `vimMode`, `vimEnabled`, `selectedNodeId`, `persistenceLocked`, `nodeVisualSelection`, `onPreviewAttachment`, or `onFoldCommand` changes `bindings` while preserving `dragFreeze` (including its `begin` and `end` members) and `setVimEditing`. Every optional callback is stable, as in App; omitted callback defaults are outside these assertions (C2.6).

Coverage report inspected: `coverage/renderer/use-node-input-bindings.ts.html` (local generated artifact). Six uncovered functions: default callbacks at hook lines 106, 107, 109, 110; the yank failure handler at 366; the keyboard command-state getter at 1005. The HTML highlights uncovered branch alternatives at 106, 107, 109, 110, 260, 281, 448, 466, 626, 903, 905, 908, 942, 957, 960, 1196, 1219, and 1236. These include missing focus/node/DOM fallbacks, plain Insert textarea completion, pending-link-draft matching, and native selection/link fallbacks. Total uncovered branch count is 51/489; the HTML line highlights are navigation anchors, not a one-to-one enumeration of V8 branch counters. Existing floors were not changed.

The first performance attempt could not launch Electron inside the sandbox (SIGABRT, kill EPERM). The approved retry outside the sandbox completed all 41 scenarios and produced the baseline above; use that artifact for T10/T13 on this machine. No runtime defect was found or fixed. R1 and R2 were asked in the T1 handoff and both recommended options were approved by the Product Owner on 2026-10-04.

## Next task

T8 (Ready): extract the Vim keyboard-state adapter into `vim-keyboard-state.ts`, under R1's approved default, preserving the Vim-enabled gate and access-time owner getters. T1 through T7 are complete; R1 and R2 are approved. T7 extracted five session-finishing and editing-switch bodies with 25 direct tests. The new module measures 100 statements, 96.92 branches, 100 functions, and 100 lines, with floors 99.9, 96.9, 99.9, and 99.9. Under approved R2, the hook measures 97.55 statements, 90.82 branches, 94.73 functions, and 98.41 lines, with floors 97.5, 90.8, 94.7, and 98.4. Existing tests, callback dependencies, owner refs, effect order, write order, and pending-edit finisher registration remain unchanged. No requirement gaps or product decisions were introduced. T6 extracted the three caret projection expressions with 26 direct tests and floors 99.9 each. T5 used two extraction commits under its diff-size rule, starting with `restoreVisual` and `moveNodeVisual` in `0b81f8e`, then the remaining five callbacks; its module floors remain unchanged. For T2a, the Product Owner explicitly authorized adding direct helper cases to the existing `editor-dom.test.ts` while preserving its existing cases; this exception to C3/C8 applies only to T2a. Suggested later sessions: T8 to T9; T10, then T13, or T11 first if R3 is approved; later T12 and T13.

Resume prompt: "Continue the input-bindings decomposition initiative. Read AGENTS.md, docs/DEVELOPMENT.md section 11, plans/README.md, plans/input-bindings-decomposition.md, and git status. State the task you are taking (the plan's next task), do it under the plan's Common rules, commit it together with the plan's status update, and stop after at most four committed tasks or at the first stop condition (C8)."
