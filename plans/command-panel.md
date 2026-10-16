# Vim Command Panel

## Objective

Add a command panel to Vim Normal mode. Pressing `:` opens a panel at the bottom of the window that lists application commands, filters them as the user types, and runs the selected one. The first version provides five commands: quit, toggle always-on-top, and the three appearance choices. Every command is one registry entry, so later commands are added without changing the panel.

Sources of truth: `docs/PRODUCT.md` §2.2, §9.1, §9.3, §16, §20.2, §20.4, §20.5, §20.9, §22; `docs/ARCHITECTURE.md` §§7, 8, 13, 17; `docs/VIM_CONFORMANCE.md`.

The agreed specification below is not yet product behavior. Task T2 moves it into `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/VIM_CONFORMANCE.md` in the same commit as the implementation.

## Authorization

* Scope: whole initiative (T1 and T2). The Product Owner approved the specification below and authorized implementation on 2026-10-16.
* Coding tool: Claude Code.
* T1 is an explicitly requested prototype: no tests, no full validation, and no commit. It stops for Product Owner review of the running application.
* T2 starts only after the Product Owner accepts the prototype or requests finalization. Owner feedback that stays inside this specification is applied in T1 or T2 without another approval; feedback that changes the specification is recorded in this plan first.
* Reserved for the Product Owner: any new command, any new verb in the naming rule, any new alias, prefix abbreviations, commands with arguments, and the panel in modes other than Normal.
* Delegated: component structure, file layout, IPC channel names, styling values within the current palettes, and test selection, following `AGENTS.md` and the existing patterns named below.

## Specification

### Opening and closing

1. With Vim editing enabled, `:` in Normal mode opens the command panel, in Tree and in Agenda. It does nothing in Insert, Replace, character Visual, or whole-node Visual mode, and with Vim editing disabled.
2. Opening the panel discards a pending count and an unfinished Normal-mode command.
3. `Escape`, `Backspace` on an empty input, and loss of focus (including window deactivation and a click outside the panel) close the panel without running a command.
4. After the panel closes, for any reason, the editor is in Normal mode with the focus, node, and caret it had before `:`. A command that changes them (none in this version) defines its own result.

### Appearance

5. The status bar becomes the input line: its left end shows `:` followed by the typed text, in place of the mode indicator. The right end shows the match count as `<matching> of <total>`. The `VIM` and pin toggles stay in place.
6. Above the status bar, a panel spans the full window width and lies over the bottom of the document. It does not move the document or change its scroll position.
7. The panel shows at most 8 rows; further rows scroll inside it. Its height follows the row count up to that limit.
8. Each row shows the command name, a short description in the secondary text color, and at its right end the current state (a check mark on the active choice) and the keyboard shortcut when one exists.
9. The selected row uses the shared selection highlight pair. Colors come from the current appearance's palette in light and dark.
10. The panel appears and disappears immediately, with no animation (§20.4).

### Filtering, selection, and running

11. The input is case-sensitive. Leading and trailing spaces are ignored.
12. A command matches when the input is a prefix of its name starting at the beginning of any hyphen-separated segment. For example, `theme`, `dark`, and `set-th` all match `set-theme-dark`. An alias matches only when the input equals it exactly.
13. Row order: an exact name or alias match first; then the matching commands from the history, most recent first; then the remaining matches in alphabetical order. With an empty input, every command is listed in that order.
14. The first row is selected whenever the input changes. `↓`/`↑` and `Ctrl+N`/`Ctrl+P` move the selection and wrap at the ends, as in the shared completion lists (§20.9). Clicking a row runs it.
15. `Enter` runs the selected row. When no row matches, `Enter` keeps Normal mode, closes the panel, and shows `Not a command: <input>` at the left end of the status bar until the next key press.
16. Prefix abbreviations are not run: `Enter` on `qui` runs the selected row (`quit`), not an abbreviation lookup. The panel always runs a listed command.
17. Text after a space is reserved for future arguments. No command accepts arguments in this version, so such input matches no command.

### Commands

| Name | Alias | Description | State | Shortcut | Effect |
| --- | --- | --- | --- | --- | --- |
| `quit` | `q` | Quit Tree | — | `⌘Q` | Exactly `Cmd+Q` (§9.1, §16), including the save-before-quit, failure, and locked-state behavior |
| `toggle-always-on-top` | — | Keep the window above other windows | Check mark while pinned | — | Exactly the Window > Always on Top item and the pin toggle (§2.2, §9.3) |
| `set-theme-auto` | — | Follow the system appearance | Check mark while Automatic | — | Exactly View > Appearance > Automatic (§20.5) |
| `set-theme-light` | — | Use the light appearance | Check mark while Light | — | Exactly View > Appearance > Light |
| `set-theme-dark` | — | Use the dark appearance | Check mark while Dark | — | Exactly View > Appearance > Dark |

Running a command has the same result as its menu item or toggle in every way, including the saved preference, the menu check marks, the status-bar toggle state, and focus (`docs/PRODUCT.md` state-not-path rule). The pin and appearance commands work in the locked save-failure state because they change preferences, not the document.

### Naming rule

18. A command name is lowercase ASCII words joined by hyphens. The verb comes first.
19. Allowed verbs:
    * `toggle-<object>` switches an on/off state, for example `toggle-always-on-top`.
    * `set-<object>-<value>` selects one value out of several, for example `set-theme-dark`.
    * A bare verb is an action on the whole application, for example `quit`.
20. A new verb is added only together with an update of this rule.
21. `q` is the only short alias. A new alias requires a Product Owner decision.
22. `theme` is the command-name term for the View > Appearance choice, and `auto` names its Automatic value.

### History

23. Each successfully run command except `quit` moves to the top of the history. A command appears at most once.
24. The history holds at most 100 commands and drops the oldest beyond that.
25. The history persists across restarts as a user preference stored apart from the document, like the Vim toggle (§20.2.1). It is not a document edit, creates no undo entry, and does not trigger a document save.
26. The history file is written once per successfully run command, never per keystroke. A missing or unreadable file means an empty history. Entries that name no current command are ignored.

### Vim divergence

27. Vim shows a single command line and runs the typed text. This panel instead lists commands, selects with `↓`/`↑`, and runs the selected row; `↑`/`↓` do not recall history, which instead orders the list. This is a deliberate divergence requested by the Product Owner, recorded in `docs/VIM_CONFORMANCE.md` by T2.

### Architecture requirements

28. One registry module in the application layer lists every command: name, aliases, description, shortcut label, state query, and run action. Adding a command means adding one entry.
29. A run action calls an existing application command or service (the same path as the menu item or toggle). It never duplicates its logic.
30. Matching and ordering are pure functions, unit-testable without React, DOM, or Electron (`AGENTS.md` §7).
31. Filtering, selection, and wrapping reuse the shared suggestion model used by date and emoji completion (`src/renderer/completion-controller.ts`, `src/renderer/completion-sources.ts`) where it fits; the panel is a separate view, not `CompletionPopup`.
32. Performance (`docs/PRODUCT.md` §22): no document writes; one small preference write per run command; history bounded at 100 entries; filtering is linear in the command count on each keystroke.

## Implementation Notes

Existing code the tasks build on:

* Preferences: `src/infrastructure/main/window-state.ts` (`createBooleanPreferenceStore`, `createAppearancePreferenceStore`), wired in `src/main/index.ts` and exposed through `src/main/ipc-handlers.ts`, `src/preload/index.ts`, and `src/shared/ipc.ts`.
* Appearance is currently set only from the application menu (`src/main/application-menu.ts`); the renderer needs a validated IPC path to read and set it.
* Always-on-top already has renderer IPC (`getAlwaysOnTop`, `setAlwaysOnTop`, `onAlwaysOnTopChanged`).
* Quit: the renderer side of the shutdown handshake is in `src/renderer/lifecycle.ts` and `src/main/quit-handshake.ts`; `:quit` must start the same main-process quit as `Cmd+Q`, not a separate path.
* Vim key routing: `src/renderer/vim-keyboard-handler.ts`, `src/renderer/vim-keyboard-state.ts`, `src/renderer/vim-command-state.ts`. Agenda Normal-mode keys: `src/renderer/agenda-row-text-keys.ts`.
* Status bar and mode indicator: `src/renderer/App.tsx`, `src/renderer/styles.css`.
* Existing E2E to extend or model on: `e2e/vim-toggle.spec.ts`, `e2e/always-on-top.spec.ts`, `e2e/appearance-preference.spec.ts`.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | Working prototype of the whole specification, uncommitted, shown to the Product Owner | — | Product Owner reviews the running application and accepts the prototype or requests changes | Ready |
| T2 | Finalized feature: requirements moved to their owners, tests, validation, review, one commit; this plan and its index row removed | T1 accepted | Validation and review evidence below; Product Owner verification of the committed result | Planned |

### T1 — Prototype

* Expected files: new `src/application/command-registry.ts` (name may follow local conventions) and a pure matching/ordering module; a new renderer panel component; `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/renderer/vim-keyboard-handler.ts` and related Vim/Agenda key routing; `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/infrastructure/main/window-state.ts` for appearance and history IPC and the history store.
* Validation: none required for the prototype. Run `npm run typecheck` and launch the application to check the flows before handing it to the Product Owner. State what was checked.
* Stop: show the prototype, list what is provisional, and wait for the Product Owner. Do not commit. Keep the worktree and a `WORKING_PLAN.md` if the review spans sessions.

### T2 — Finalize

* Expected files: T1 files; unit and property tests for matching, ordering, history bounds, and registry; IPC contract tests in `src/main/ipc-handlers.test.ts` and `src/preload/index.test.ts`; a new E2E spec for the panel; `docs/PRODUCT.md` (new §20.2.28 Command Panel, plus cross-references in §9.3 and §20.5), `docs/ARCHITECTURE.md` (registry rule in §7 or §8, history store in §13), `docs/VIM_CONFORMANCE.md`; `plans/README.md` and removal of this file.
* Validation tier: High Risk (new IPC and a persisted preference). Run `npm run check`, `npm run test:e2e`, and `npm run audit`. No Electron performance run unless a concrete §22 trigger appears.
* Required coverage: E2E for opening, filtering, `↓`/`↑` selection, `Enter`, unknown command, `Escape`, each of the five commands, history order after restart, and Agenda opening; real-renderer screenshots of the panel in light and dark, inspected per `docs/DEVELOPMENT.md` §9; a geometry assertion that the panel sits directly above the status bar and does not shift the document.
* Roles: independent reviewer (process and persistence boundary) and a separate product verifier (cross-state user-visible change), per `AGENTS.md` §13.
* HIG check per `docs/PRODUCT.md` §1.3.
* Commit: `feat(vim): Add the Normal-mode command panel`.

## Budget

* T1: one session plus Product Owner review rounds; at most two recovery attempts per blocker without new evidence.
* T2: one to two sessions; same recovery rule.
* The initiative has two working tasks, below the three-task threshold, so no separate final acceptance round applies. The plan is removed in the T2 commit.

## Owner Involvement

| Task | Check or action |
| --- | --- |
| T1 | Review the prototype in the running application; accept it or list changes |
| T2 | Verify the committed result |

Expected rounds: one prototype review (more if changes are requested) and one verification after T2. No capability gaps are known; the E2E suite needs the usual Electron launch permission.

## Next Task

T1 — Prototype.

## Next-Session Prompt

```text
Continue the Vim command panel initiative: start task T1 (prototype) from plans/command-panel.md. Do not commit; stop for my review of the running application.
```
