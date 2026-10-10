# Vim Matrix Corrections

## Objective and Authorization

Implement the Product Owner's M3, M4, M22, and M25 decisions recorded in
[PRODUCT.md structure](product-structure.md), authorized on 2026-10-10.
Keep the changes separate from the documentation migration PS-11.

## Boundaries

* M3: interrupted structural Insert does not replace the saved dot-repeat change.
* M4: select-all, cut, and paste interrupt dot recording without ending Insert mode.
* M22: Escape and `v` leave character Visual at its active endpoint, as in Vim.
* M25: ordinary text clicks move the caret and preserve Replace mode. Navigation
  controls, outside clicks, and drag behavior retain their existing rules.
* No data model, persistence model, or architecture boundary changes.
* Other matrix-only proposals remain undecided; this plan does not approve them.

## Tasks

| ID | Outcome | Expected files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- |
| VC-1 | Interrupted Insert preserves the previous repeat, including structural sessions and text commands | `src/renderer/vim-session-finish.ts`, `node-input-pointer-handlers.ts`, `editor-input-handlers.ts`, `use-node-input-bindings.ts`, focused tests, `e2e/vim-navigation-and-visual.spec.ts`, clipboard tests, PRODUCT §20.2.19, VIM_CONFORMANCE matrix | Failing regression before fix; Escape still records; pointer and shortcut interruptions do not; native/menu paths covered; full validation; independent review and verification | High Risk (clipboard paths) | Done |
| VC-2 | Character Visual exit uses its active endpoint | `src/renderer/vim-keyboard-handler.ts`, Agenda row keyboard/text key adapters, corresponding unit tests and E2E specs, PRODUCT §§20.2.20 and 23.4, VIM_CONFORMANCE matrix | Both selection directions, exchanged endpoints, text/image exit, Escape and `v`, noneditable Agenda parity, inspected Electron screenshots; `npm run check` and affected E2E; review and verifier | Moderate Risk | Done |
| VC-3 | Ordinary text clicks preserve Replace and move the next overwrite position | `src/renderer/node-input-pointer-handlers.ts`, `vim-edit-session.ts`, `use-node-input-bindings.ts` as needed, tests and `e2e/vim-text-editing.spec.ts`, PRODUCT §§20.2.5–6, ARCHITECTURE state assessment, VIM_CONFORMANCE matrix | Same-node and other-node clicks with pending/empty replacement, subsequent typing at clicked position, Escape/undo, rich input/image cases, existing control and blur behavior, inspected screenshots; applicable full validation; review and verifier | High Risk if attachments or buffered-edit boundary changes; otherwise Moderate Risk | Done |

## Decisions and Next Task

The Product Owner already chose the four behaviors. M25 is limited to ordinary
text clicks; any newly discovered material choice beyond them must be raised
before implementation. Each task inventories its state transitions in
`WORKING_PLAN.md`, records performance and validation evidence, and updates this
plan in its commit.

VC-1 implemented the approved M3/M4 policy in the existing session owners and
adapters. Plain and structural interruptions preserve the previous dot change;
the structural command's incidental source blur still permits Escape recording.
Keyboard, native-paste, and editor-menu paths are covered. No further product
decision was made. Independent review and product verification findings were
resolved. No additional structural refactor is indicated: repeat session ownership
already exists, and the corrections remove the conflicting capture policy and
missing adapter calls.

The full-validation attempt passed its static, governance, unit/coverage, and build
stages. The Electron run had a clipboard-lock timeout before application launch
and a Normal-caret screenshot discrepancy; both failed scopes passed separately
without changing application code or baselines. Additional hook and Electron
cases cover every structural start. Performance and audit passed separately,
satisfying the tier through composed evidence. Physical keyboard/IME input was
not manually inspected; character input and native popup presentation were not
changed. Under AGENTS §12, this session stops after resolving the broader-suite
failures rather than starting another task.

### VC-3 implementation notes

* `node-input-pointer-handlers.ts` currently commits Replace on press and returns
  to Normal on blur. `vim-edit-session.ts` buffers typed text; preserving mode
  without starting a new session makes the next typed key inert.
* Capture the ordinary primary editor target before source blur. Commit pending
  replacement with the existing selection-preserving path, allow native caret
  placement, then start a fresh Replace session at the target's actual caret and
  current document text. The existing Tab continuation is a useful reference.
* A press is not yet a click: the hold gesture may become a drag. Coordinate with
  `use-node-list-drag.ts` and the drag-caret-freeze owner to distinguish completed
  text clicks from drag, cancellation, controls, and outside release. Clear
  temporary pointer intent on cancellation; preserve existing non-click paths.
* Each click-separated replacement is one ordinary standalone undoable edit,
  using `EditorStore.replaceTextRange`; no new Undo grouping model is needed.
* Verify same-node and cross-node focus, empty buffers, continued typing, links,
  images, Escape/history, and a click on an Agenda direct match. The original
  pending buffer must never be lost or applied to the destination node.

VC-2 changed the explicit Tree and noneditable Agenda exit paths to use the
inclusive active endpoint before clearing Visual state. Existing clamp and
rendering owners are reused; yank and operated-range commands retain their
documented behavior. Regression tests failed before the fix and passed after it.
Both directions, exchanged ends, Escape and `v`, and image-to-text exits are
covered. `npm run check` and all 121 affected Electron tests passed. Independent
review and product verification found no meaningful issues. Tree, Agenda, and
image screenshots were inspected; deterministic Tree baselines cover the Visual
selection and Normal caret at the active end. No additional product decision or
structural refactor was needed. No unresolved validation failures remain.

VC-3 records an ordinary primary press in Replace as a click intent in the existing
session owner. The previous node's blur commits its buffer but keeps the mode; the
release on a focused, collapsed input starts a fresh Replace session at the clicked
caret. A node-drag hold, a global release or cancel, a window blur, a selection
dragged from another node (ends Replace), and a release over an unfocused input
clear or end the intent. Independent review and product verification findings were
resolved. Observations for the Product Owner, not decided: a double-click in the
same node leaves Replace without a session (typing is inert), and Agenda
non-active rows have no input, so clicking one still ends Replace. No structural
refactor was needed. No visual change: Replace rendering is unchanged.

Next task: none in this plan. Return to PS-11 and obtain decisions for the remaining
matrix queue. Remove this correction plan after the Product Owner confirms no
further correction tasks remain.
