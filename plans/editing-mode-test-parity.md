# Editing-Mode Test Parity

## Objective

Give standard editing and Vim editing the same depth of automated coverage, so a defect in either mode is caught before release. Standard editing is the first-run default (`docs/PRODUCT.md` §20.2); Vim editing is the Product Owner's daily mode. Both are permanent parts of the product (`docs/PRODUCT.md` §1 and §1.1).

## Scope

In scope: E2E fixtures and specs, renderer unit tests, the performance fixture, a check script that keeps every E2E spec's editing-mode category explicit, and `docs/DEVELOPMENT.md`. Fixes for standard-mode defects that the new coverage exposes are in scope as separate defect-first commits (`AGENTS.md` §9).

Out of scope: any change to product behavior beyond what `docs/PRODUCT.md` already requires. A defect whose fix needs a product decision is a material gap under `AGENTS.md` §5 and goes to the Product Owner.

## Authorization

Authorized by the Product Owner on 2026-10-02, together with two decisions:

* the E2E suite may grow by the cost of running mode-sensitive tests in both modes;
* standard-mode defects found by this work are fixed inside this initiative, each in its own defect-first commit.

Reserved for the Product Owner: any requirement gap the new tests expose.

## Findings

Standard editing is implemented as Vim Insert without the Vim key handler: the renderer keeps the mode `insert` and passes `vim: undefined` to `createEditorKeyDownHandler` (`src/renderer/use-node-input-bindings.ts`, `src/renderer/App.tsx`), and the stylesheet keys every mode rule on `vim-state-*`, so standard editing shares the `vim-state-insert` rules. Behavior can therefore differ between the two modes only at these points:

| ID | Divergence | Owner |
| --- | --- | --- |
| D1 | Startup mode and the caret placed on startup, on focus restoration, and after a collapse or relaunch moves the selection | `App.tsx` initial mode; `use-node-input-bindings.ts` pending-caret `normal` flag |
| D2 | `Escape` in an editor: Vim leaves Insert and ends the text session; standard editing does nothing | `editor-input-handlers.ts` |
| D3 | Undo grouping: Vim also ends a text session on `Escape` | `editor-input-handlers.ts`, `EditorStore.endTextSession` |
| D4 | Pointer handling in an editor: `onMouseUp`, `onSelect`, and `onFocus` branch on Normal mode | `use-node-input-bindings.ts` |
| D5 | Rendering of empty and image-only editors, the caret, and selection colors | `styles.css` `vim-state-*` rules |
| D6 | Status-bar layout: the mode indicator is absent in standard editing | `App.tsx`, `styles.css` |
| D7 | Opening the image preview from a text caret and returning focus after it closes | `editor-input-handlers.ts`, preview component |
| D8 | Application commands whose Vim pre-resolution is skipped in standard editing: `Cmd+A/C/X/V`, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, `Cmd+Z`, `Cmd+E`, and context-menu Cut/Paste | `editor-input-handlers.ts` |

Coverage before this initiative (2026-10-02, commit `3b7af57`):

* E2E: `launchTree` enables Vim unless told otherwise (`e2e/fixtures.ts`), so all 200 general tests ran in Vim. Only the four `e2e/vim-toggle.spec.ts` tests exercised standard editing.
* Unit: `useNodeInputBindings` defaults `vimEnabled` to `true`; 4 of the 66 `App` renders in `App.test.tsx` use standard editing; 15 key-handler tests in `editor-input-handlers.test.ts` run without `vim`, against 140 with it.
* Performance: the fixture enables Vim only.

## Spec Categories

Every E2E spec file declares one category on its first line, as `// @editing-modes: <category>`:

* `both` — the file's tests run once per editing mode through the shared helper. Tests whose behavior exists only in Vim sit in a separate `Vim editing only` describe block of the same file that launches with Vim explicitly.
* `vim` — the behavior under test exists only in Vim editing.
* `independent` — the asserted behavior does not pass through D1–D8. These tests run once, with Vim editing set explicitly.
* `explicit` — every launch sets its own preference because the file tests the preference itself (`vim-toggle.spec.ts` only).

## Inventory

Classification codes: `B` runs in both modes, `V` stays Vim-only, `I` is mode-independent. A cited divergence ID gives the reason for a `B`. Line numbers are those of commit `3b7af57`.

| Spec (category) | B | V | I |
| --- | --- | --- | --- |
| `always-on-top` (both) | 5 pin toggle and restart (D6: geometry without the indicator); 46 pin keeps focus (D4) | | |
| `attachment-cleanup` (independent) | | | all |
| `attachment-validation` (both) | 88 image-only node (D5, per-mode screenshots) | 118 Normal blank-row click; 170 `l` onto image | 25, 44, 70, 197, 218, 234 |
| `clipboard` (both) | 40 paste at cursor (D8); 107 cut link (D8); 132 copy link (D8); 158 writable after paste; 170 mouse link selection (D4); 205 Backspace at link end; 217 caret inside link | | 51, 62, 83, 96, 239, 251, 263, 274, 287 |
| `context-menu` (both) | 40 Copy/Paste route (D8); 80 right-click selection (D4); 103 disclosure right-click (D4) | | 58 |
| `csp` (independent) | | | all |
| `deletion` (both) | 5, 23, 34 (D8 `Cmd+Backspace`, focus) | | |
| `drag-and-drop` (both) | 35 quick click caret (D4); 52 reorder focus; 106 cancelled drag caret (no indicator in standard); 141 unfocused-row caret; 207 Escape cancel (D2); 269 text selection (D4); 306 collapsed selection | 77 keeps Normal | 187, 244, 379, 391 |
| `editing` (both) | all 14 (D8, Enter) | | |
| `empty-node` (both) | all 5 (D5, Backspace) | | |
| `history` (both) | 20 text undo (D3); 33 structural undo; 61 split caret | | 47, 79, 132, 153, 182 |
| `hyperlink` (both) | 4 linked edit caret; 37 corrected link; 99 plain click focus (D4) | 124 Normal `Enter` | 56, 76 |
| `initial-state` (both) | 7 first launch (D1; standard variant uses a true first run with no saved preference) | | |
| `inline-expansion` (both) | 61 disclosure keeps caret (D4); 106 split: ArrowDown part (the `j`/`k` part is V); 141 collapse caret (D1); 227 `Cmd+E` (D8, `PRODUCT.md` §2.4 requires identical behavior); 255 collapse elsewhere (D4); 271 enter/leave focus (D8); 299 split: `Cmd+Backspace`/`Cmd+Z` part (the `dd`/`u` part is V); 342 relaunch focus (D1); 397 older document caret (D1); 433 arrow boundary; 617 disclosure appearance (D5) | 106 `j`/`k` part; 157 fold keys; 299 `dd`/`u` part; 411 `gg`/`G`; 461; 478 | 79, 326, 369, 550, 571, 589 |
| `layout-density` (independent) | | | all |
| `location-path` (independent) | | | all |
| `navigation` (both) | 6, 20, 42, 54, 72, 90, 109, 138, 182, 202, 215 (D4 breadcrumb), 240 | 30 `gd` | |
| `node-gutter-alignment` (both) | 79 focus marker (D5); 129 image-only gutter (D5) | | |
| `persistence` (independent) | 207 restored selection focus (D1), moved into a `both` describe or a new spec | | all others |
| `persistence-lock` (independent) | | | all |
| `persistence-reliability` (independent) | | | all |
| `pointer-cursor` (both) | 26 (D6: no indicator in standard) | | |
| `preview` (both) | 33 button close; 47 Escape close (D7); 59 click close; 114 `Cmd+Enter` (D7) | 77 Normal keys after close | 5, 20, 99, 126 |
| `renderer-failures` (independent) | | | all |
| `shortcut` (independent) | | | all |
| `shutdown-failures` (independent) | | 184, 204, 223, 259 (Replace mode) | 28, 70, 107, 121, 142, 310, 343 |
| `sticky-location-bar` (both) | 46 status bar (D6) | | 5 |
| `text-wrapping` (independent) | | | all |
| `undo-sessions` (both) | all 3 (D3) | | |
| `vim-image-caret`, `vim-navigation-and-visual`, `vim-text-editing` (vim) | | all | |
| `vim-toggle` (explicit) | | | |
| `window-visibility` (independent) | | | all |
| `windowed-list` (both) | 87 off-screen row focus and typing (D1, D4); 103 undo restores row (D3) | | 126, 160, 186, 210 |

This puts 86 tests in both modes, about 43% more E2E executions.

New tests are needed where neither mode has a counterpart:

* N1 — standard editing: clicking the blank part of an image-only row focuses its editor, shows the insertion line, and accepts typing (`attachment-validation`; D4, D5).
* N2 — standard editing: focus and caret return to the editor after the preview closes by button, `Escape`, or click (`preview`; D7).
* N3 — standard editing: `Escape` in an editor leaves the text, caret, selection, and undo grouping unchanged (`undo-sessions`; D2, D3).
* N4 — standard editing: a text selection renders with the highlight pair in light and dark (screenshot; D5; `docs/ARCHITECTURE.md` color rule).

## Tasks

| ID | Outcome | Depends on | Files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Inventory and plan | — | this plan, `plans/README.md` | Inventory recorded | Minimal | Done |
| T2 | Editing-mode mechanism and categories | T1 | `e2e/fixtures.ts`, every `e2e/*.spec.ts` (category line only), new `scripts/check-e2e-editing-modes.mjs` with its test, `package.json` (`check` wiring), `docs/DEVELOPMENT.md` §§8–9 | `launchTree` takes the mode from a Playwright option fixture `editingMode` when `vimPreference` is absent; a `describeForEachEditingMode` helper runs a describe body once per mode with the mode in the title; screenshot names receive a `-standard`/`-vim` suffix only inside that helper; the check fails on a missing or unknown category and on a `both` file that does not call the helper; files not yet converted keep their current behavior and carry the category `pending` (accepted only until T6); full suite unchanged in pass count | High (shared fixture) | Ready |
| T3 | Convert `both` batch 1: `editing`, `clipboard`, `history`, `undo-sessions`, `empty-node`, `deletion`, `context-menu`, with N3 | T2 | those specs | Each `B` test passes in both modes; Vim variants unchanged; E2E duration recorded against the T2 baseline | Low (tests), raised to the defect tier for any fix | Planned |
| T4 | Convert batch 2: `navigation`, `inline-expansion`, `windowed-list`, `hyperlink`, `initial-state`, `persistence` (207), `always-on-top`, `sticky-location-bar`, `pointer-cursor` | T3 | those specs | As T3; split tests (`inline-expansion` 106 and 299) keep their Vim halves in `Vim editing only` | Low | Planned |
| T5 | Convert batch 3 (pointer and rendering): `drag-and-drop`, `preview`, `attachment-validation`, `node-gutter-alignment`, with N1, N2, N4 | T4 | those specs and new standard-mode baselines | As T3, plus the visual-regression workflow (`AGENTS.md` §9): every new standard baseline inspected, light and dark where styling differs | Low, visual evidence required | Planned |
| T6 | Unit, performance, enforcement, close-out | T5 | `src/renderer/use-node-input-bindings.ts` (make `vimEnabled` required), its callers and tests, `src/renderer/App.test.tsx` (standard counterparts for D1–D8 where a unit test can observe them), the performance fixture and one standard typing scenario under `docs/PRODUCT.md` §22, the check script (drop `pending`), `docs/DEVELOPMENT.md`, removal of this plan and its index row | No `pending` category remains; `npm run check:full` passes; the final E2E duration is recorded in the handoff | High (shared fixture, performance) | Planned |

A defect found in T3–T5 is fixed in its own `fix(...)` commit before that batch's test commit, following the defect-first workflow; the batch then continues. When the fix needs a product decision, stop and ask.

## Next Task

T2 — the editing-mode mechanism and spec categories.

## Resume Prompt

> Continue the editing-mode test parity initiative: read `plans/editing-mode-test-parity.md` and do its next ready task.
