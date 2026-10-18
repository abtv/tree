# Ctrl as the Primary Modifier in the Browser Version

Status: In progress. T1 to T3 are Done. Round A passed on 2026-10-18; T4 is next.

Planned 2026-10-18 at `10bf845`, clean tree. Coding tool: Claude Code. A smaller model is expected to implement the tasks, so each task names its files, steps, evidence and validation tier.

## 1. Objective and Scope

On Linux and Windows, the browser version (`src/web/`) uses Ctrl where macOS uses Cmd. Every Cmd or Option shortcut in [PRODUCT.md](../docs/PRODUCT.md) keeps an equivalent. macOS behavior is unchanged in the browser and in Electron. Electron is macOS-only and out of scope.

* **Primary modifier.** Cmd on Apple platforms (macOS, iOS, iPadOS). Ctrl on every other platform. Linux and Windows are the targets. Other platforms (ChromeOS, Android with a keyboard) get the Ctrl mapping without a verification claim.
* **Shortcut profile.** A constant object, injected into the renderer, that answers "is this key event a primary-modifier shortcut" and formats shortcut labels.
* Out of scope: Electron, new shortcuts, a user setting for the platform, touch behavior, and browsers other than Chromium. Safari stays outside the publication gate ([PRODUCT.md §1.4](../docs/PRODUCT.md#14-browser-static-hosting-checkpoint)).
* Priorities, in order: macOS behavior unchanged; correct Ctrl behavior in Chromium on Linux and Windows; small reviewable diffs; short documentation.
* Sources: [AGENTS.md](../AGENTS.md) §§5, 8, 9, 13; [Development Guide](../docs/DEVELOPMENT.md) §§8, 9, 11, 12; [Agent Workflow Procedures](../docs/AGENT_WORKFLOW.md) §§8, 9, 12; [PRODUCT.md](../docs/PRODUCT.md) §§1.3, 1.4, 4.3, 20.2.28, 20.7, 20.9.3, 23.4; [VIM_CONFORMANCE.md](../docs/VIM_CONFORMANCE.md); [ADR 0003](../docs/decisions/0003-renderer-owns-standard-editing-commands.md); [src/web/AGENTS.md](../src/web/AGENTS.md); [e2e/web/AGENTS.md](../e2e/web/AGENTS.md).

## 2. Authorization, Decisions and Delegation

Authorization: the whole initiative (T1 to T4, required review corrections, closure). The Product Owner approved decisions D1 to D7, the principle-directed delegation below, the gap decisions G1 to G8 in section 8, and the absence of a real-keyboard check on Linux or Windows (RD3 resolved) on 2026-10-18.

Decided by the owner. Do not reopen:

* **D1** Platforms: Linux and Windows (non-Apple). Only Ctrl is primary there. Super/Meta does not act as Cmd.
* **D2** Cmd maps to Ctrl and Option to Alt. Cmd+Left/Right (line start/end) map to Home/End, not Ctrl+Left/Right (word motions there). Cmd+click maps to Ctrl+click. The left-Command hold (`MetaLeft`) maps to left Control.
* **D3** In Vim non-Insert modes, Ctrl+D/U/O/R stay Vim commands (the app has no Cmd+D/U/O/R). Other Ctrl combinations run the mapped application command. Ctrl+V pastes (Vim visual block is not implemented). The rule that blocks every other Ctrl combination in non-Insert Vim modes changes on non-Apple platforms only.
* **D4** Ctrl+P is contextual. With a completion popup or the command panel open, Ctrl+P and Ctrl+N navigate. Otherwise Ctrl+P is the mapped Cmd+P (Agenda). The same principle settles any other collision.
* **D5** Labels such as `⌘Q` show as `Ctrl+Q` on non-Apple platforms.
* **D6** Browser-reserved shortcuts (Ctrl+W/T/N) cannot be intercepted. T3 proves in Chromium E2E that the application handles each mapped shortcut and prevents the browser default. Whether Chromium delivers a key from a real keyboard is not verified (RD3).
* **D7** PRODUCT.md gets one platform-mapping rule and an exceptions table, not a rewrite of each Cmd reference.

Delegated decisions (principle-directed, inside D2 to D4): mapping details and collisions. Precedence, highest first:

1. Vim Ctrl+D/U/O/R in Vim non-Insert modes.
2. Ctrl+N and Ctrl+P navigation while a completion popup or the command panel is open.
3. The mapped application command.
4. Otherwise the per-mode rule that exists today: native in standard editing and Vim Insert, blocked in the other Vim modes.

Record each choice in section 8 and in PRODUCT.md §1.5. A collision this order cannot settle is reserved. macOS behavior and Electron are never changed.

Reserved for the owner:

* **RD1** A mapped shortcut that automated checks show is not handled or not prevented in Chromium: keep it as a documented constraint, choose another binding, or drop it.
* **RD2** Support or verification beyond Chromium, a platform override setting, any new shortcut, any change to Electron or macOS behavior.
* **RD3** Resolved: the owner has no Windows or Linux desktop. PRODUCT.md §1.5 records real-keyboard delivery in Chromium on Linux and Windows as unverified. There is no Round B.

## 3. Findings That Shape the Work

Checked in the repository at `10bf845` unless marked otherwise.

* **F1** `Ctrl+N` is already bound. It cycles completion suggestions (PRODUCT.md §§20.9.3, 20.12) and command-panel rows (§20.2.28). Chromium reserves Ctrl+N (unverified recall), so on Linux and Windows it likely cannot reach the page. ↓/↑ and Ctrl+P still work.
* **F2** `Cmd+J` and `Cmd+K` are not application shortcuts. PRODUCT.md §20.9.3 only says a bare modifier keydown must not dismiss suggestions. The non-Apple counterpart is a bare Control keydown.
* **F3** Playwright sends keys over the DevTools protocol. They reach the page and very likely skip browser accelerators (unverified). E2E can prove that the application handles a key and calls `preventDefault`. It cannot prove that Chromium delivers a reserved key from a real keyboard. T4 runs a throwaway probe to confirm this.
* **F4** On Linux, Chromium binds Ctrl+Z/A/C/X/V natively. A Linux E2E can therefore pass through Chromium's own editing. Keep the ADR 0003 guard ([Development Guide](../docs/DEVELOPMENT.md) §12): assert the application result and that the native default was prevented or blocked.
* **F5** Chrome specs press `Meta+…` on Linux CI today: `native-editing`, `paste`, `quit`, `storage`, `theme`. `menu.spec.mjs` uses `Meta+Shift+p` only under iPhone, iPad and MacIntel identity overrides, which stay Apple. Activation breaks the other specs unless T3 migrates them in the same commit. `e2e/web/fixtures.mjs` `pressPaste` already emulates Command+V with the CDP paste command on Linux.
* **F6** `Cmd+0` has no browser function. Its handler only calls `preventDefault`. The mapping therefore blocks Chrome's zoom reset (Ctrl+0) while a node has focus, exactly as Cmd+0 does on macOS today (G5).
* **F7** Mapped commands shadow native or browser keys: `Cmd+Y` (image preview) shadows Windows redo, `Cmd+Backspace` (delete node) shadows word delete, `Cmd+P` (Agenda) shadows Print. Redo stays on Ctrl+Shift+Z and deletion is undoable. These follow D3 and go in the exceptions table (G6).
* **F8** On macOS, Ctrl+click is a context-menu gesture, and two sites exclude it (`node-input-pointer-handlers.ts`, `use-node-input-bindings.ts`). Outside Apple platforms it is an ordinary click and the mapped link-open gesture.
* **F9** Windows reports AltGr as Ctrl+Alt (recall; unverified). The profile must treat AltGraph state as character entry, not a shortcut. Unit event doubles here lack `getModifierState`, so the profile must tolerate that.
* **F10** Gates that bite:
  * `docs/VIM_CONFORMANCE.md` cites test titles and `npm run check:docs` verifies them. Do not rename cited tests.
  * Per-file coverage floors apply to `node-input-pointer-handlers.ts` and `use-node-input-bindings.ts`.
  * A new numbered PRODUCT.md section needs a `// @requirement PRODUCT.md §N` marker, and an E2E marker if it is in `BOUNDARY_SECTIONS`.
  * PRODUCT.md blocks are limited to 700 characters and sections to 8000.
  * Web specs need `// @editing-modes: independent` on line 1.

## 4. Design

### 4.1 Shortcut profile (suggested shape; T1)

* One pure module, `src/renderer/shortcut-profile.ts`, with no React, DOM or Electron imports. Two constant profiles: `apple` and `other`.
* `isPrimary(event)`: `apple` is `event.metaKey`. `other` is `ctrlKey && !metaKey && !AltGraph`, read as `event.getModifierState?.('AltGraph')`.
* Also: the bare-modifier key name (`Meta` or `Control`), the left key code (`MetaLeft` or `ControlLeft`), the macOS-only context-menu click test, the word-motion modifier (Option or Ctrl), and `format(shortcut)` (`⌘Q` or `Ctrl+Q`).
* `command-registry.ts` keeps `shortcut` as data (key and shift flag, primary modifier implied), not the string `'⌘Q'`. `CommandPanel.tsx` formats it with the profile.
* Injection follows `vimAvailable`: `App` gets an optional prop `shortcutPlatform` (default `'apple'`), resolves the constant profile, and passes it to hooks and handler factories as an optional dependency that defaults to `apple`. No module-level mutable state. No per-event allocation. `src/renderer/main.tsx` (Electron) stays unchanged.
* Detection lives in `src/web/device.ts` and is wired in `src/web/main.tsx` (T3).
* No ADR is needed. The seam is local to the renderer input layer, matches an existing injection pattern, and changes no dependency direction. `docs/ARCHITECTURE.md` records it.

### 4.2 Where primary-modifier checks live

Find them with `rg 'metaKey|ctrlKey' src --glob '!*.test.*'`. Line numbers drift.

| File | Sites |
| --- | --- |
| `src/renderer/editor-input-handlers.ts` | Agenda branch (Cmd+Backspace, Enter, Cmd+Enter, P, `.`, `,`, E); select-all, copy and paste flags; main chain (A C X V P `.` E Enter Y `,` Backspace Z Q 0); Vim Ctrl D/U/O/R clauses; the catch-all Ctrl block |
| `src/renderer/agenda-row-keyboard.ts` | the `if (event.metaKey) { … return }` block; the Vim `ctrlKey` block |
| `src/renderer/agenda-row-text-keys.ts` | `ctrlKey` early return; Cmd copy, select-all and Left/Right; Alt word motion |
| `src/renderer/use-completion.ts` | popup close on a Cmd shortcut; Ctrl+N/P cycling |
| `src/renderer/use-command-panel.ts` | Cmd+Shift+P; Ctrl+N/P in the open panel |
| `src/renderer/App.tsx` | Cmd+P in the root `onKeyDown`; `useLeftCommandKey` |
| `src/renderer/node-input-pointer-handlers.ts`, `use-node-input-bindings.ts` | Cmd+click link open; two `!event.ctrlKey` replace-click exclusions |
| `src/renderer/use-left-command-key.ts` | `MetaLeft` |
| `src/application/command-registry.ts`, `src/renderer/CommandPanel.tsx` | `shortcut: '⌘Q'` |

Callers of `createAgendaKeyDownHandler`: `AgendaView.tsx`, `App.tsx`, `editor-input-handlers.ts`, `vim-keyboard-handler.ts` (two). Pass the profile to all of them that can see a modified key.

### 4.3 Rules outside Apple platforms (source for PRODUCT.md §1.5)

* **R1** The primary modifier is Ctrl alone. Super/Meta combinations have no command. AltGr is character entry.
* **R2** Every Cmd shortcut in PRODUCT.md runs on Ctrl with the same Shift and Alt qualifiers: Cmd+Shift+P, Cmd+Shift+Z, and Cmd+Option+Enter (does nothing). Ctrl+click opens a link. Holding left Ctrl over a link shows the link cursor.
* **R3** Line start and end use Home and End. Word motion in Agenda rows without an editor uses Ctrl+Left/Right. Home, End and Ctrl+arrows add no node-crossing behavior (PRODUCT.md §4.3 gives crossing to plain Left and Right).
* **R4** In Vim non-Insert modes, Ctrl+D/U/O/R stay Vim commands, Ctrl+V pastes, and every other unmapped Ctrl combination stays blocked. In standard editing and Vim Insert, unmapped Ctrl combinations keep their native behavior.
* **R5** Ctrl+N and Ctrl+P navigate while a popup or the command panel is open. Otherwise Ctrl+P opens or closes Agenda.
* **R6** A bare Control keydown neither dismisses suggestions nor discards a pending Vim command.
* **R7** Labels show `Ctrl+Q`.
* **R8** Consequences recorded in the exceptions table:
  * Ctrl+0 is swallowed, so browser zoom reset is unavailable while a node has focus.
  * Ctrl+Y previews an image and does not redo.
  * Ctrl+Backspace deletes the node and does not delete a word.
  * Ctrl+P replaces Print.
  * Ctrl+N likely cannot work in Chromium (F1).
  * Real-keyboard delivery in Chromium on Linux and Windows is unverified (RD3).

### 4.4 Path inventory for T2 (non-Apple, per key class and mode)

| Key class | Standard editing, Vim Insert | Vim Normal | Vim Visual, Visual-node, Replace |
| --- | --- | --- | --- |
| Ctrl+D/U/O/R | native | Vim command | blocked (as today) |
| Mapped: A C X V Z Shift+Z Y E P Shift+P `.` `,` Enter Backspace 0 Q | application command | application command | application command |
| Ctrl+N/P with popup or panel open | navigation | navigation (panel only) | navigation (panel only) |
| Ctrl+N without popup, other Ctrl+key | native | blocked | blocked |
| Bare Control keydown | nothing | keeps pending command | keeps pending command |
| AltGr character | never primary; same as Option+key today | same | same |
| Super/Meta combinations | no command | no command | no command |

Agenda rows without an editor also cover:

* Ctrl+C and Ctrl+A.
* Home and End.
* Ctrl+Left/Right word motion, with Shift, in standard-style modes only.
* Ctrl+P, `.`, `,`, E, Z and Shift+Z.
* The swallow list.
* Vim Normal Ctrl+D/U/O/R, which must not be captured by the primary block.

## 5. Tasks

Working tasks: 4 (T1 to T4). Closure and the owner rounds are not working tasks. Because the count is at least three, final owner acceptance is required (AGENTS.md §8).

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | Shortcut profile seam; Apple behavior identical | none | Apple table equals `metaKey`; Electron and Chrome suites pass unchanged | Done |
| T2 | Non-Apple rules, parity tests, PRODUCT.md §1.5, Vim conformance row | T1 | both profiles pass the parity and precedence matrices; docs checks pass | Done |
| Round A | Owner macOS native-keyboard check | T2 | Owner reported “I checked on Mac, it works” on 2026-10-18 | Done |
| T3 | Browser activation, labels, Chrome E2E on both mappings | T2, Round A | macOS Chrome and Linux arm64 container checks passed (accepted pre-push equivalent); CI awaits owner push | Done |
| T4 | Probe, constraint record, acceptance package | T3 | every constraint recorded in PRODUCT.md §1.5; no open reserved decision | Planned |
| Closure | Owner acceptance, plan retirement | T4, Round C | explicit owner acceptance | Planned |

Each task uses a temporary `WORKING_PLAN.md` for its reviewer's clean context. Delete it before the task commit. Commit the task together with this plan's status and next-task update.

### T1. Shortcut profile seam (Apple behavior identical)

Files:

* New: `src/renderer/shortcut-profile.ts`, `src/renderer/shortcut-profile.test.ts`.
* Edit production code: every file in section 4.2, plus `AgendaView.tsx`.
* Edit tests: `src/application/command-registry.test.ts`, `src/renderer/use-left-command-key.test.ts`. Other existing tests change only mechanically.
* Edit other: `stryker.config.mjs` (add the new pure module to the renderer mutation scope), `docs/ARCHITECTURE.md` (§7 sentence on shortcut data; short §8 subsection for the seam with the performance assessment).

Steps:

1. Write the profile module and its table tests first.
2. Add the optional profile dependency (default `apple`) to each factory, hook and options object in 4.2.
3. Replace only positive Cmd checks, meaning "the Cmd form of a command". Leave every other `metaKey` and `ctrlKey` guard literal. T2 audits them.
4. Make `shortcut` data in `command-registry.ts`. Format it in `CommandPanel.tsx`.
5. Add `shortcutPlatform` to `App`. Use the profile in `useLeftCommandKey`.
6. Do not rename tests cited by `docs/VIM_CONFORMANCE.md`.

Acceptance evidence:

1. Table test: for all 16 combinations of the four modifier flags, `apple.isPrimary` equals `metaKey`, with and without `getModifierState`.
2. Table test for `other`: Ctrl alone, Ctrl+Shift, Ctrl+Alt with AltGraph on and off, Ctrl+Meta, and Meta alone.
3. A command-panel test shows `⌘Q` on the Apple profile.
4. The profile is a module constant. The binding-identity tests in `use-node-input-bindings.test.tsx` pass unchanged.
5. The reviewer lists every remaining `metaKey` and `ctrlKey` hit and classifies it as a plain-key guard, a Vim Ctrl command, or moved. No positive Cmd check remains outside the profile.

Validation: High Risk (shared interaction infrastructure; Electron and the browser share the handlers).

* `npm run check`.
* `npm run test:e2e` (full, hidden).
* `npm run test:web` (full, macOS Chrome).
* `npm run audit` (reuse while `package-lock.json` is unchanged).
* `npm run test:mutation -- --mutate src/renderer/shortcut-profile.ts,src/application/command-registry.ts`; read the survivors.
* Electron performance: none. The change adds one constant-time predicate per key event and no state, writes or retained memory. Record this reason with the evidence.

Review: independent reviewer (shared interaction state). No separate product verifier (no user-visible change). Reserved decisions: none.
Commit: `refactor(renderer): route the primary modifier through a shortcut profile`.

### T2. Non-Apple rules (inert in production until T3)

Files:

* Production: the T1 files. Apply 4.3 and 4.4 at each site. Do not select `other` in any composition root.
* New tests, in new `describe` blocks with new titles: `editor-input-handlers.test.ts`, `agenda-row-keyboard.test.ts`, `agenda-row-text-keys.test.ts`, `node-input-pointer-handlers.test.ts`, `use-node-input-bindings.test.tsx` (popup Ctrl+N/P, Ctrl+click), `use-command-panel.test.tsx`, `use-left-command-key.test.ts`, `command-registry.test.ts`.
* Extend: `agenda-command-matrix.test.ts` (loop both profiles). Run `use-node-input-bindings.property.test.tsx` and `vim-mixed-interaction.property.test.ts` under both profiles with their existing models, using `propertyRuns`.
* Docs:
  * `docs/PRODUCT.md`: a sentence in §1.3 pointing to §1.5; a new "1.5 Keyboard Modifiers Outside Apple Platforms" with the rule and exceptions table from 4.3; the `quit` row of the §20.2.28 table.
  * `docs/VIM_CONFORMANCE.md`: one row marked **Vim divergence** (mapped application commands replace Vim's Ctrl+A/X/E/Y/P/V and others on non-Apple platforms, by owner decision D3).

Audit list (negative guards whose meaning changes). Decide each, and write a test for each:

1. Agenda branch `Enter && !metaKey` should become `!primary`.
2. Agenda branch `!metaKey && !altKey && (ArrowUp || ArrowDown || Vim Ctrl+D/U)`: arrows use `!primary`; Vim Ctrl+D/U must still pass.
3. The catch-all Ctrl block must exempt the mapped keys. Ctrl+Q in Replace mode must flush and close (`quit.spec.mjs` covers this in T3).
4. `agenda-row-keyboard.ts`: the primary block must not capture Vim Ctrl+D/U/O/R in Normal.
5. `agenda-row-text-keys.ts`: Ctrl early return, copy, select-all, word motion.
6. The two `!event.ctrlKey` replace-click exclusions become Apple-only.
7. Popup close on a primary shortcut ignores a bare Control keydown.
8. `use-command-panel.ts`: the Cmd+Shift+P test ends with `&& !event.ctrlKey && !event.altKey`. On `other`, `isPrimary` requires Ctrl, so the `!event.ctrlKey` term must go or Ctrl+Shift+P never opens the panel. Found in the T1 review.

T1 left these as implemented (Apple-equal): the two replace-click exclusions already call `shortcuts.isContextMenuClick` (item 6 only needs the `other` tests), and the Agenda word motion in `handleThinKey` already calls `shortcuts.isWordMotion`. T1 did not touch any other negative guard.

Acceptance evidence:

1. **Parity.** For each mapped command and each mode in 4.4, the real-store outcome under `apple` with Cmd equals the outcome under `other` with Ctrl.
2. **Precedence and edge tests.** Tests for each 4.4 row, plus:
   * Ctrl+V pastes in Normal and Visual.
   * Ctrl+P with a popup, with the panel open, and with neither.
   * Ctrl+Shift+P.
   * AltGr never primary.
   * Meta inert.
   * A bare Control keydown keeps a pending count.
3. **Agenda rows without an editor.** Copy, select-all, Home/End and Ctrl+Left/Right with Shift work. Vim Normal Ctrl+D/U/O/R still work.
4. **Pointer.** Ctrl+click opens a link on `other`. Ctrl+press stays excluded on `apple`.
5. `npm run check` passes. That includes `check:docs` (conformance citations, PRODUCT limits) and `check:requirements` (marker `// @requirement PRODUCT.md §1.5` on the new tests). Per-file coverage floors are unchanged.

Validation: High Risk, same commands as T1 (reuse the audit).
Review: independent reviewer. The reviewer traces every 4.4 row and audit-list item in code (AGENT_WORKFLOW §9 path inventory). No separate product verifier: users cannot reach the behavior until T3, and the T3 verifier covers it.
Reserved: any collision outside the precedence order.
Commit: `feat(renderer): add non-Apple shortcut rules and document the mapping`.
After T2, stop for Round A.

### T3. Activate in the browser and prove it in Chromium

Files:

* `src/web/device.ts` and `src/web/device.test.ts`.
  * Add `isApplePlatform(device)`. It uses `navigator.platform` and `userAgent` as `isIPhoneOrIPad` does. It does not use `userAgentData`, so Playwright overrides work.
  * Apple is `Mac*`, iPhone, iPad, iPod, or an iPadOS desktop identity. Unknown or empty is Apple (existing behavior).
  * Table test: Mac, iPhone, iPad mobile, iPad desktop, Windows, Linux x86_64 and aarch64, Android, ChromeOS.
* `src/web/main.tsx`: pass `shortcutPlatform`.
* `e2e/web/fixtures.mjs`:
  * Export the host primary key (`Meta` on macOS, `Control` elsewhere).
  * Add a `shortcutPlatform` option to `newContext`. It installs an init script that overrides `navigator.platform` (`MacIntel` or `Win32`).
  * Change `pressPaste(page, modifier)` to send the CDP paste command with the matching modifier bit (Control 2, Meta 4) on every host. This keeps paste working on a macOS host under the `other` override.
* Migrate to the host primary key: `native-editing.spec.mjs`, `paste.spec.mjs`, `quit.spec.mjs`, `storage.spec.mjs`, `theme.spec.mjs`. Keep `menu.spec.mjs` on Meta (its overrides are Apple identities).
* New `e2e/web/shortcuts.spec.mjs`. Line 1 is `// @editing-modes: independent`. Add the marker `// @requirement PRODUCT.md §1.5`.
* Docs and tooling:
  * `e2e/web/AGENTS.md`: replace the `Meta+v` rule.
  * `src/web/README.md`.
  * `docs/ARCHITECTURE.md` §2: one sentence.
  * `docs/DEVELOPMENT.md` §8: web E2E uses the host primary key; synthetic events skip accelerators.
  * `scripts/check-requirement-coverage.mts` and its test: add §1.5 to `BOUNDARY_SECTIONS`.

`shortcuts.spec.mjs` runs a representative set once per override (`MacIntel` with Meta, `Win32` with Control), on any host:

* Agenda (P), command panel (Shift+P), enter and leave (`.` and `,`), delete node (Backspace), undo and redo (Z, Shift+Z), strikethrough (Enter), fold (E).
* Select-all, copy, cut and paste (A, C, X, V), and quit from Vim Replace (Q).
* In Vim Normal: Ctrl+D/U/O/R, Ctrl+P with a popup and with the panel, and Ctrl+click on a link.
* Negative checks: Meta is inert on `other`; Ctrl does not act as Cmd on `apple`.
* The `quit` row label shows `Ctrl+Q` or `⌘Q`.
* A keydown probe records `defaultPrevented` for P, 0, E, Z, Y and Backspace. Use a `window` capture listener that reads the flag after dispatch (for example with `setTimeout`), because the command panel calls `stopImmediatePropagation`.
* For A, C, X, V, Z and Shift+Z, assert the application result and that the native default cannot satisfy it (F4, ADR 0003).
* Screenshot the command-panel row with `Ctrl+Q` at the default and a narrow width, and inspect it. Electron cannot render this label, so the Chrome screenshot is the real-renderer evidence.

Acceptance evidence:

1. `npm run test:web` and `npm run test:web:built` pass on macOS Chrome. Every migrated spec passes. The dual-mapping spec passes on both overrides.
2. Detection table test passes.
3. `Browser Chrome` on `ubuntu-24.04-arm` passes for the T3 commit. A local run in a `linux/arm64` `mcr.microsoft.com/playwright:v1.63.0-noble` container (Node from `.nvmrc`, `npx playwright install --with-deps chromium`, `npm run test:web:built`) is an acceptable pre-push check. The owner pushes; ask before pushing, because a push to `main` publishes the browser build.
4. Reviewer and verifier report no meaningful issues.

Interim state: each push to `main` publishes the browser build after CI. T3 must land code, migrated specs, labels and docs in one commit.

Validation: High Risk (platform activation; shared web fixture).

* `npm run check`.
* `npm run test:web`.
* `npm run test:web:built`.
* Reuse T2's `npm run test:e2e` and audit results unless T3 changes a file outside `src/web/`, `e2e/web/`, `scripts/` and `docs/`.

Review: independent reviewer and a separate product verifier (user-visible, cross-platform).
Reserved: RD1 if a mapped shortcut is not handled or not prevented.
Commit: `feat(web): use Ctrl as the primary modifier on non-Apple platforms`.

### T4. Probe and constraint record

Files: `docs/PRODUCT.md` §1.5 (final constraints), `docs/DEVELOPMENT.md` (one note), `src/web/README.md`, this plan. Change code or tests only for defects that the checks reveal.

Steps:

1. Run the F3 probe. In headed Chromium, press `Control+n` (or `Meta+n` on macOS) through Playwright. Record whether a window opens. Keep the probe in `.scratch/`; do not commit it.
2. Record in PRODUCT.md §1.5 which constraints are verified by automation and which remain unverified on a real keyboard (RD3), including F1 and F9.
3. Fix, or escalate under RD1, each failure.
4. Do a final documentation pass.
5. Prepare the acceptance package: commit hash, Round A result, the §1.5 link, and limitations.

Acceptance evidence: every constraint is recorded as verified, expected constraint, or unverified. No reserved decision is open.
Validation: Moderate Risk for documentation and tests: `npm run check` and `npm run test:web`. Re-tier by the files touched if code changes. A reviewer is needed only if code changes. A verifier is needed only if behavior changes.
Commit: `docs(web): record browser shortcut constraints`.

### Closure

After explicit owner acceptance of the T4 commit:

1. Confirm that lasting knowledge is in PRODUCT.md §1.5, ARCHITECTURE.md, DEVELOPMENT.md, VIM_CONFORMANCE.md and `src/web/README.md`.
2. Remove this plan and its `plans/README.md` row.
3. Run `npm run retire:scratch -- <task>` if scratch exists.
4. Run `npm run check:docs`.
5. Commit: `docs(plans): retire the Ctrl primary modifier initiative`.

On rejection, record the issues and the exact repair task in this plan. Repair within the closure allowance, then ask for acceptance again.

## 6. Owner Involvement

Verification inventory:

* **Automated:** unit and property parity (T1, T2); full Electron E2E (T1, T2); Chrome E2E on both mappings (T3); Linux CI (T3); reviewer (T1 to T3); product verifier (T3).
* **Owner required:** Rounds A and C.
* **Not verified (accepted, RD3):** real-keyboard delivery in Chromium on Linux and Windows.

Working tasks: 4. Owner rounds: 2 (A, C). T1 to T4 have no owner pre-commit gate. Possible extra rounds: a repair round after C.

| Round | When | Check | Why automation is not enough | Owner action and expected result |
| --- | --- | --- | --- | --- |
| A | After T2, before T3 starts | SC1 to SC13 on macOS with Cmd, in Electron (`npm run dev`) and the browser (`npm run dev:web`), plus popup keys Ctrl+N, Ctrl+P, Tab, Escape | Playwright keys are not native keyboard routing ([Development Guide](../docs/DEVELOPMENT.md) §9); completion shortcuts changed ([AGENT_WORKFLOW §9](../docs/AGENT_WORKFLOW.md#9-tests)) | Run the list in a synthetic profile (about 10 minutes). Every result equals today's behavior. The owner may waive. |
| C | After T4 | Final acceptance of the delivered commit | Required by AGENTS.md §8 | Inspect PRODUCT.md §1.5 and the acceptance package. Accept, or list issues. |

Shortcut check list for Round A (Cmd on macOS):

* **SC1** P: Agenda opens and closes. No print dialog.
* **SC2** Shift+P: the command panel opens. The `quit` row shows `⌘Q`.
* **SC3** `.` and `,`: enter and leave a node.
* **SC4** E: a fold toggles.
* **SC5** Z and Shift+Z: undo and redo document changes.
* **SC6** A, C, X, V: select, copy, cut and paste text.
* **SC7** Enter strikes a node through. Y previews a node's image.
* **SC8** Backspace deletes the selected node (Z restores it).
* **SC9** 0 does nothing visible while a node has focus.
* **SC10** Q runs Tree's quit flow.
* **SC11** Vim on, Normal mode: Ctrl+D/U move half a page, Ctrl+O leaves a node, Ctrl+R redoes.
* **SC12** Type `tomorrow` to open date suggestions. Ctrl+N and Ctrl+P move the selection.
* **SC13** Cmd+click on a link opens it. Holding left Cmd over a link shows the hand cursor.

Capabilities not yet verified. Each can block a stage:

* **Browser E2E in the Claude Code sandbox.** The sandbox blocks local port binding, so `npm run test:web*` must run outside the sandbox with owner approval. Preflight with `npm run test:web -- --list`, then one spec, in T1. Do not edit `.claude/settings.json`.
* **Linux CI results.** `git push` needs owner approval and `gh` is blocked by the sandbox. The owner pushes and reports the run.
* **Reviewer and verifier roles.** They are configured in `.claude/agents/`. Confirm their access on first use.

## 7. Budget

* Approved scope: T1 to T4 and required review corrections.
* Commits: 4 task commits, at most 1 review-correction commit per task, and at most 2 commits for Linux-only CI findings after T3.
* Primary sessions: at most 5. Expect one per task, with a spare session for CI repair.
* Recovery: two attempts per blocker without new evidence, then escalate ([AGENT_WORKFLOW §12](../docs/AGENT_WORKFLOW.md#12-git)). Escalate immediately for a reserved decision or a permission denial.
* Closure allowance (separate): one session, one retirement commit, and at most one repair commit per rejection round, for at most two rounds. More than that needs a new plan.

## 8. Decisions and Findings for Later Sessions

Minor gaps settled under the section 2 delegation and approved by the owner on 2026-10-18. Record the final wording in PRODUCT.md §1.5.

* **G1** Detection treats every non-Apple platform as `other`; empty platform is Apple. Principle: D1 names the class "non-Apple", and PRODUCT.md §1.4 already detects device identity from `navigator`.
* **G2** Word motion in Agenda rows without an editor uses Ctrl+Left/Right, not Alt+Left/Right. Principle: PRODUCT.md §20.7 (the same result on every path) and D2's reason for Home/End.
* **G3** Home, End and Ctrl+arrows add no node-crossing. Principle: PRODUCT.md §4.3.
* **G4** Ctrl+click is an ordinary click that also opens links. Principle: D2, and Ctrl+click is a context-menu gesture only on Apple platforms.
* **G5** Ctrl+0 is swallowed, as Cmd+0 is today (owner confirmed).
* **G6** Ctrl+Backspace deletes the node and Ctrl+Y previews an image (owner confirmed). Redo stays on Ctrl+Shift+Z.
* **G7** A bare Control keydown is neutral. Principle: PRODUCT.md §20.9.3.
* **G8** AltGr is character entry, never a shortcut. Principle: D1 (only a deliberate Ctrl is primary).
* Constraint, not a gap: Ctrl+N likely cannot work in Chromium on Linux and Windows (F1).
* Unverified recall to confirm during the work:
  * Chromium's reserved shortcut list.
  * Windows AltGr reporting.
  * That synthetic events skip accelerators (the T4 probe).

## 9. Next Task

Exact next task: **T4**. The owner reported Round A passed on macOS on 2026-10-18.
T3 activated browser detection and passed standard validation, macOS development
and built Chrome suites, and the accepted local Linux arm64 Chromium equivalent.
Independent reviewer and product verifier found no meaningful issues. Normal and
narrow Ctrl+Q label screenshots were inspected. No push was made; hosted behavior
and the actual CI run are not verified. The owner controls publication by pushing.

T3 pointer evidence: macOS reserves native Ctrl+click even with a non-Apple
navigator override, so the Mac test uses a renderer click contract for that case.
Linux exercises the actual Ctrl pointer sequence. Browser automation does not
establish real-keyboard accelerator delivery (RD3).

Decisions made in T2 (inside D2 to D4, recorded in PRODUCT.md §1.5):

* Meta is inert on the `other` profile in the editor and Agenda handlers (early return when Meta is held and is not primary).
* Unmapped Ctrl keys are blocked in Agenda rows without an editor in non-Insert Vim modes, like in editors (R4).
* Alt+Left/Right is inert in Agenda rows without an editor on `other`; word motion is Ctrl+Left/Right (G2).
* `Ctrl+Left/Right` in node editors follow `Option+Left/Right` today, including crossing at a node boundary; Home and End never cross.

Environment notes from T1:

* `npm run check`, `npm run test:e2e` and `npm run test:web` ran outside the Claude Code sandbox. Inside it, `scripts/web-release/selection.test.mts` fails on `git init` templates.
* A narrow mutation run needs `--ignorePatterns '.scratch,src/**/*.performance.test.ts'` as one value. Otherwise Stryker fails copying an older task's `.scratch/browser-feasibility` Chrome bundle.

Prompt for the next session:

```text
Continue the initiative in plans/ctrl-primary-modifier.md with T4. Round A passed and T3 is complete. Run the headed browser-accelerator probe, record verified and unverified constraints in their owning documentation, validate and commit T4, then request final owner acceptance. Do not push or publish. The plan records the approved scope, decisions, budget and closure gate.
```
