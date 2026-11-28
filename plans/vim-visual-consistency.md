# Consistent Vim character Visual mode

Status: In progress

## Objective and scope

Make character Visual mode (`VISUAL`, not `VISUAL NODE`) behave consistently, modeled on Evil (Emacs) and Vim: Visual mode owns its own range and is synchronized with the native selection by two explicit rules, activation and deactivation, and the mouse decides by the character under the pointer. Source of truth: `docs/product/vim.md` §20.2.6, §20.2.8, §20.2.20; `docs/VIM_CONFORMANCE.md`; `docs/architecture/vim.md` §8.3.3 and §21.

Out of scope: Replace and Insert click placement, the Vim help view's pointer path, cross-node character Visual (`V` covers several nodes), and Normal mode with a multi-character selection that comes from enabling Vim with an Insert selection or from modified, touch or pen pointer selections.

## Authorization

- 2026-11-28: the Product Owner authorized the whole initiative ("Just make sure it works consistently and implement it") after the comparison with Evil and IdeaVim, with the recommended decisions:
  - R1: a command or press that replaces the selection or reaches another node ends character Visual for Normal; commands that do neither keep the mode with its range.
  - R2: pointer presses and drags decide by the character under the pointer, not the nearest native boundary.
  - R3: `Cmd+A` in Normal mode enters character Visual.
  - R4: a click on node text ends whole-node Visual mode.
- Coding tool: Claude Code. Execution budget: 3 tasks. Recovery budget: 2 fix cycles per task. Closure allowance: 1 cycle.
- Decision made under the recorded Vim principle (not an owner question): a secondary click inside a character Visual selection keeps Visual and its range for the context menu, as Vim's `mousemodel=popup_setpos` keeps a selection its popup menu was opened on.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | One owner for the character Visual range; R1 and R4; operators read the range | — | Mode and range exist together on every path (unit table per interruption, hook tests for focus reaching another node, `gv` into another node, primary and secondary presses, R4); E2E for breadcrumb, enter control, `Cmd+.`, paste, R4, a no-op undo and leave, an Agenda day collapse | Done |
| T2 | R2: mouse by character | T1 | Right-half click, a few pixels of movement within one character, and a click past the end of a wrapped line place the Normal block on the character under the pointer; a drag includes both end characters; plain and rich editors, Tree and Agenda | Done |
| T3 | R3: `Cmd+A` enters Visual | T1 | `Cmd+A` and context-menu Select All in Normal and Visual enter Visual over the whole text; empty text stays in Normal; Insert and standard editing unchanged | Planned |

### T1 files

`src/renderer/vim-command-state.ts`, `vim-session-finish.ts`, `vim-keyboard-handler.ts`, `vim-node-visual-commands.ts`, `use-node-input-bindings.ts`, `editor-input-handlers.ts`, `App.tsx`, `AgendaView.tsx`, `agenda-row-keyboard.ts`, `SearchPrompt.tsx`, their tests, `e2e/electron/vim-navigation-and-visual.spec.ts`, `docs/product/vim.md`, `docs/product/tree-model.md`, `docs/product/agenda.md`, `docs/VIM_CONFORMANCE.md`, `docs/architecture/vim.md`. Tier: Moderate with broadened E2E (shared interaction state): `npm run check`, `npm run test:e2e`, `npm run test:web:chromium`, independent Reviewer and Product Verifier.

### T2 plan

- Files: a new pure `src/renderer/text-cell-hit.ts` (the cell whose visual rect contains the point, otherwise the nearest cell on that visual line; a point past a visual line's end is its last cell), `editor-dom.ts` (a `characterAtPoint` adapter on `visualTextGeometry` rects), `use-node-input-bindings.ts`, `vim-caret-transition.ts`, `node-input-pointer-handlers.ts`, `e2e/electron/text-pointer.ts`, a short ADR if the native press stops owning the selection.
- Approach to evaluate first, in this order: (a) keep the native press and correct the caret and Visual endpoints by character on each follow and on release, if Chromium tolerates a programmatic selection write during a held press; (b) otherwise own single ordinary presses in Normal and Visual (`preventDefault` on `mousedown`, write the selection from the hit test, add edge autoscroll), recorded in an ADR. Multi-clicks stay native.
- Tests: pure hit-test unit and property tests on synthetic layouts (wrapped lines, emoji, empty text, points outside); hook tests moved from native selection to pointer positions; E2E for right-half click, small movement, past-end click on a wrapped line (plain and rich), drag in both directions, Agenda editor. Inspected screenshots of the block after a right-half click and of a mid-drag highlight.
- Tier: Moderate with broadened E2E, Reviewer, Product Verifier. Performance: one hit test per pointer move on the pressed line only; add a bounded rect-read unit guard.

### T3 plan

- Files: `editor-input-handlers.ts` (`selectEditorText`), `vim-session-finish.ts` (`select-all`), tests that assert Normal with a whole-text highlight after `Cmd+A` (`editor-input-handlers.test.ts`, `App.test.tsx`, `node-input-pointer-handlers.test.ts`, E2E in `vim-navigation-and-visual.spec.ts`, `strikethrough.spec.ts`, `context-menu.spec.ts`, `vim-text-editing.spec.ts`, `clipboard.spec.ts`, `completion-links.spec.ts`), `docs/product/vim.md` §20.2.6 and §20.2.20, `docs/VIM_CONFORMANCE.md`.
- Tier: Moderate; `npm run check`, affected E2E, `npm run test:web:chromium`, Reviewer.

### T1 outcome notes

- Minor gap settled under R1: an Agenda day collapse that hides an entry in character Visual mode ends the mode, as a Tree collapse does; `docs/product/agenda.md` §23.5 records it.
- `npm run fix:history` flagged `use-node-input-bindings.ts` (3+ fixes in 14 days). This initiative is the structural response for character Visual state (one range owner, one mode writer); the owner declined a separate Replace gesture extraction on 2026-11-20.
- Left as is: `startRowDrag` in `e2e/electron/fixtures.ts` releases on node text when it retries after a lost window focus, which under R4 ends whole-node Visual mode; only a retried attempt of the same-parent reorder test is affected.

### T2 outcome notes

- Approach (a) was kept: the native press still owns the drag, so no ADR. Electron and browser probes established the Chromium rules recorded in `docs/architecture/vim.md` §8.3.4: a written anchor survives as the drag base; a collapsed write turns the drag into a caret move; a write before the drag extends makes Chromium drag the selected text and cancel the pointer; the moving end is recomputed on every move.
- Decisions under the recorded principle (not owner questions): a drag that leaves the node above or below reaches the first or last character, as a native text field does, rather than the nearest character on the first or last line; a `Shift`-click stays native and is listed as a divergence; the highlight's moving end may lag one character while the button is held.
- Two full-suite runs had one or two 60-second timeouts in unrelated specs (`selection-interruptions`, `hyperlink`, `line-numbers`) that pass alone; they are load contention under six workers.

## Next task

T3: `Cmd+A` and context-menu Select All enter character Visual mode (see T3 plan).

## Owner involvement

- Working tasks: 3, so final owner acceptance is required before closure (one round after T3).
- Recommended, not mandatory: one real-mouse and trackpad round after T2, because Playwright's synthetic pointer cannot reproduce hand tremor during a click.
- No other owner checks are planned.
