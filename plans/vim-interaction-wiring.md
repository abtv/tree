# Vim Interaction Wiring Consolidation

## Objective

Finish applying [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md) to the Vim
renderer layer, so that renderer-local Vim state has one implementation rather than two, and the fast unit suite
exercises the path that ships.

This is a structural change to renderer wiring only. It does not change product behavior, the domain model, the
persistence model, process boundaries, or dependency direction.

## Scope limits

In scope:

* the shape of `VimKeyboardState` and the fallback branches its optionality forces;
* how `vim-keyboard-handler.ts` and `editor-input-handlers.ts` reach the Vim command-state owner;
* extraction of the counted vertical-navigation loop.

Out of scope, and requiring separate Product Owner authorization:

* any change to user-visible Vim behavior, including deliberate divergences recorded in
  [VIM_CONFORMANCE.md](../docs/VIM_CONFORMANCE.md);
* splitting `vim-keyboard-handler.ts` by key family;
* consolidating or shrinking the large test files for their own sake;
* converting regex literals to hoisted constants or character-code comparisons.

Sources of truth: [PRODUCT.md](../docs/PRODUCT.md) §4.3 and §20.2 for behavior,
[ARCHITECTURE.md](../docs/ARCHITECTURE.md) §9 and §21 for renderer state ownership,
[VIM_CONFORMANCE.md](../docs/VIM_CONFORMANCE.md) for the test inventory,
[AGENTS.md](../AGENTS.md) for workflow and [Development Guide §9](../docs/DEVELOPMENT.md#9-full-validation)
for validation tiers.

## Authorization state

The Product Owner authorized this objective and its three tasks on 2026-09-28, after an architecture assessment
requested for the purpose of deciding whether refactoring was needed before new feature work. Each task is
authorized; the Product Owner still starts each session.

Reserved for the Product Owner:

* any behavior difference discovered while removing the fallback path. A difference is a finding to report, not a
  decision to make. If the shipped path and the fallback path disagree, the shipped path is not automatically
  correct — ask which one matches the intended product behavior before encoding either.
* whether to act on the mode-ownership watch item recorded under Findings below. It is not part of this initiative.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- |
| VIW-1 | `VimKeyboardState` members that production always supplies are required; every caret-state fallback and `applyCaretState` branch is deleted; the `editor-input-handlers.test.ts` double wires the shipped path | — | No `getCaretState?.`, `?? { cursor, imageActive`, or `applyCaretState !== undefined` remains in `src/renderer/`; the `vimHandler` double supplies the members production supplies; Vim unit, property, and E2E suites pass | Moderate | Done |
| VIW-2 | `vim-keyboard-handler.ts` and `editor-input-handlers.ts` receive the `VimCommandState` owner and call its transitions; `createVimCommandHandles` and the mirrored clearing helpers are deleted | VIW-1 | `createVimCommandHandles`, `clearCommandAssemblySlots`, and the raw `vim.pending.current = undefined` slot writes no longer exist; the command-assembly invariant has one implementation in `vim-command-state.ts` | Moderate | Done |
| VIW-3 | The counted `j`/`k` vertical-navigation loop is a separate module with a narrow store interface, and its per-step snapshot read is hoisted out of the count loop | VIW-1 | New `vim-vertical-navigation.ts` with focused unit tests; `handleVimKey` no longer contains the inline loop; counted-motion property tests pass unchanged | Moderate | Planned |

### VIW-1 — Require the supplied `VimKeyboardState` members

Expected files: `src/renderer/vim-keyboard-types.ts`, `src/renderer/vim-keyboard-handler.ts`,
`src/renderer/editor-input-handlers.ts`, `src/renderer/editor-input-handlers.test.ts`, and
`src/renderer/use-node-input-bindings.ts` only if the wiring must move to satisfy the narrowed type.

Distinguish members that are optional because a test double omits them from members that are optional because a
real caller genuinely lacks them. `VimTextCommandState` in `editor-input-handlers.ts` is a deliberately narrowed
structural subset used by the context-menu path; do not widen it to force the keyboard surface onto that caller.

Removing the fallback can surface assertions that encode the fallback's behavior rather than the product's. Rewrite
an assertion only when it tests the obsolete branch. When the two paths disagree about behavior a product
requirement covers, that is a defect: reproduce it first, per `AGENTS.md` §9 defect-first workflow, and report the
difference to the Product Owner before choosing which behavior to keep.

Validation tier: Moderate. Renderer behavior in one process with no persistence or platform boundary. Shared Vim
interaction infrastructure changes, so broaden E2E to the three Vim specs rather than a single focused spec.

Visual evidence: not required while the change is behavior-preserving, per
[Development Guide §9](../docs/DEVELOPMENT.md#9-full-validation) — do not generate screenshots for a non-rendering
change. If a genuine caret or selection rendering defect is found and fixed, that fix is rendering-sensitive and
needs its own visual-evidence record.

### VIW-2 — Give the command-assembly invariant one implementation

Expected files: `src/renderer/vim-command-state.ts`, `src/renderer/use-node-input-bindings.ts`,
`src/renderer/editor-input-handlers.ts`, `src/renderer/vim-keyboard-handler.ts`, and the affected tests.

`vim-command-state.ts` already exports `clearPending`, `clearVisualRange`, and `clearCommandAssembly`. Today the
handlers cannot call them because they receive access-time handles instead of the owner, so the invariant is
re-implemented in four places: the owner's own transitions, `clearCommandAssemblySlots` and
`clearCommandAssemblyBeforeCommand` in `editor-input-handlers.ts`, the raw slot writes in
`vim-keyboard-handler.ts`, and `discardsUnfinishedCommand`. Pass the owner and delete the duplicates.

Two comments in the code name this constraint explicitly and should be removed with it:
`editor-input-handlers.ts` ("which this module cannot call because it receives access-time handles to the owner
rather than the owner itself") and `vim-keyboard-handler.ts` ("The local clearPending helper below is declared
after this branch, so write the owner slots directly").

Validation tier: Moderate, same reasoning as VIW-1.

### VIW-3 — Extract counted vertical navigation

Expected files: new `src/renderer/vim-vertical-navigation.ts` and its unit test,
`src/renderer/vim-keyboard-handler.ts`.

The loop currently inside `handleVimKey` mixes store snapshots, sibling-index lookup, focus-token comparison, and
caret transitions across roughly eighty lines. Extract it behind a narrow store interface so it is unit-testable
without React or the DOM, following the existing pure-module pattern. The loop calls `store.getSnapshot()` and
`displayedNodes()` once per count step; hoist what does not change between steps.

`displayedNodes` is O(depth) through the memoized index, so this is a readability change with a small incidental
win, not a performance fix. Do not present it as one.

Validation tier: Moderate.

## Findings and decisions

Baseline measured at `a54e360`, before any task landed:

* `VimKeyboardState` declares 15 optional members: `lastChange`, `beginInsert`, `finishInsert`, `beginReplace`,
  `handleReplaceKey`, `finishReplace`, `imageTextCursor`, `getCaretState`, `applyCaretState`, `openAttachment`,
  `setImageCaret`, `nodeVisual`, `beginStructuralOpen`, `beginStructuralChildOpen`, `repeatStructural`. Its sole
  non-test construction site, the unconditional object literal at `use-node-input-bindings.ts` 645-733, supplies
  every one of them, so none is optional because a real caller lacks it.
* The caret-state read is duplicated at 5 sites: `vim-keyboard-handler.ts` 39, 376, 451, 780 and
  `editor-input-handlers.ts` 250. The `??` branch derives caret state from the `node-input-image-caret` CSS class
  instead of from the caret authority, so it is a second implementation, not a default.
* 8 sites branch on `applyCaretState !== undefined`: 7 in `vim-keyboard-handler.ts`, 1 in
  `editor-input-handlers.ts`.
* A ninth dead site at `vim-keyboard-handler.ts` 91-92 guards on `vim.getCaretState === undefined`. It is
  unreachable in production and runs on nearly every keypress under the current test double.
* The `vimHandler` double in `editor-input-handlers.test.ts` omits `getCaretState`, `applyCaretState`,
  `nodeVisual`, `repeatStructural`, `beginReplace`, `handleReplaceKey`, `finishReplace`, `beginStructuralOpen`,
  and `beginStructuralChildOpen`. That 2509-line suite therefore exercises the fallback branch, and `V`,
  whole-node Visual commands, and structural dot-repeat are silent optional-chain no-ops within it. Production
  supplies every one of those members.
* Churn over the last 120 commits touching Vim modules: `use-node-input-bindings.ts` 43, `editor-input-handlers.ts`
  33, `vim-keyboard-handler.ts` 31. The pure owner modules changed 2-3 times each. Churn concentrates in the
  wiring, not in the Vim logic.

Rationale for not splitting `vim-keyboard-handler.ts`: a key dispatcher of this size is appropriate, and splitting
it by key family would spread the mode and pending-command handling across more modules, which is the coupling
VIW-2 exists to remove. Reconsider only after VIW-2 lands, and only with evidence.

Watch item, not scheduled: Vim mode has two representations — the `vimMode` React prop and the `latestVimMode` ref
that mirrors it — and `setMode` is a React setter, so a handler cannot read back what it just set within one
keystroke. `handleVimKey` works around this by snapshotting `vim.mode` at entry and threading a local `visual`
boolean through its branches. This is the same shape as the two defect clusters ADR 0014 addressed. It has not
caused a recorded defect. Raise it with the Product Owner if a third cluster appears.

## VIW-1 outcome

Landed behavior-preserving. `use-node-input-bindings.ts` needed no change, confirming that its object literal
already supplied every member. Independent review and product verification both reported no meaningful issues.

Two results worth carrying forward:

* The three per-file `VimKeyboardState` literals were replaced by one shared double,
  `src/renderer/test/vim-keyboard-double.ts`, built over a real caret authority and a real `vim-command-state.ts`
  owner. Build the next test against that helper rather than a fresh literal; a per-file literal is how the
  suites drifted onto an unshipped path in the first place.
* The fallback and the shipped path diverged at two no-op branches of the `j`/`k` loop, where the fallback passed
  `fromFocus` and the shipped path did not. The shipped path was preserved. The flag is redundant at both sites
  because the focus token is already in sync there, so no user-visible behavior was ever affected. Coverage:
  `e2e/vim-image-caret.spec.ts` "keeps the image-only caret when k is clamped at the first root" and "moves k onto
  an attached current-parent image from its first child" (third `k` press).

## VIW-2 outcome

Landed behavior-preserving. `VimKeyboardState` and `VimTextCommandState` carry the `VimCommandState` owner instead
of five `{ current }` slot handles; `createVimCommandHandles`, `VimCommandStateHolder`, `VimCommandHandles`, the
handler-local `clearPending`, and `clearCommandAssemblySlots` are deleted. Every clear now calls `clearPending`,
`clearVisualRange`, or `clearCommandAssembly` in `vim-command-state.ts`, and every repeat-change write calls
`recordRepeatChange`. `use-node-input-bindings.ts` exposes the owner through an access-time getter on both handler
shapes, so the owner identity stays stable without reading the ref during render.

Two results worth carrying forward:

* `vim-keyboard-types.ts` now imports the `VimCommandState` type from `vim-command-state.ts`, a type-only cycle
  erased under `verbatimModuleSyntax`. Keep it type-only; do not import runtime values across the pair.
* The `vim-command-state.property.test.ts` handle model became a direct-owner model plus a `recordRepeatChange` op,
  keeping the transition-scoping property without the deleted accessors.

## Next task

VIW-3 — extract counted vertical navigation.

## Resume prompt

```text
Continue the Vim interaction wiring initiative in plans/vim-interaction-wiring.md.
Read plans/README.md, that plan, AGENTS.md, and any WORKING_PLAN.md first, then
compare plan status against git status and recent commits. Take the next Ready
task and stop after committing it.
```
