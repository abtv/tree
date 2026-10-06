# Development Guide

<!-- validation-mechanics-owner -->
<!-- workflow-policy-reference: AGENTS.md -->

## 1. Project Overview

This is a macOS desktop application built with:

* Electron
* React
* TypeScript
* Vite

The project is developed primarily through an AI coding agent.

The repository is the source of truth for the current implementation, documentation, tests, and architectural decisions.

---

## 2. Prerequisites

The development environment requires:

* Node.js 24.13.1;
* npm 11.8.0;
* Git

The Node.js version is pinned in `.nvmrc`. The supported Node.js and npm ranges are also declared in `package.json`.

Do not assume a different Node.js version without checking the project configuration first.

Run `npm run doctor` to check the toolchain, installed Electron and Playwright packages, display availability for the Electron suites, registry reachability for `npm audit`, and build output. It reports `PASS`, `WARN`, `FAIL`, or `INFO` per check and exits nonzero on a blocking problem.

---

## 3. Installing Dependencies

After cloning the repository or when dependencies need to be installed:

```bash
npm install
```

The install runs the project's `postinstall` script to download the Electron runtime for the current platform, and its `prepare` script to point Git at the repository's tracked hooks (`.githooks/`). Do not disable lifecycle scripts when preparing a development environment.

The tracked `commit-msg` hook rejects a commit message that adds an agent co-authorship or attribution line, per `AGENTS.md` §12. It applies to every coding agent through Git itself, not through any one tool's configuration, so it holds regardless of which tool is committing or what a session-level instruction suggests. It only runs on the machine that makes the commit, so the Attribution GitHub Actions workflow (`§9`) is the backstop for a commit made without the hook installed and for a pull request description, which no Git hook can see.

The end-to-end suite drives Electron, not browser binaries, so the Playwright browser download is not needed. To skip it and reduce install size and time:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

---

## 4. Running the Application

The application should provide a development command:

```bash
npm run dev
```

Successful persistence operations are quiet during normal development. To enable detailed persistence operation and path logging while investigating a failure, run:

```text
TREE_PERSISTENCE_DEBUG=1 npm run dev
```

Persistence failures remain logged regardless of this flag.

This command should start the Electron application in development mode with the Vite development environment.

To run an existing production build locally:

```bash
npm run start
```

Both commands first run `scripts/rename-dev-app.mjs` (the `predev` and `prestart` hooks). On macOS it rewrites the bundle name in `node_modules/electron/dist/Electron.app/Contents/Info.plist` to "Tree", so the menu bar shows the application name instead of "Electron". This changes a dependency file in place and is repeated after every `npm install`. The Dock tooltip and icon still say "Electron" in development, because macOS takes them from the bundle itself; a packaged build sets its own name.

---

## 5. Production Build

Build the application with:

```bash
npm run build
```

The validation matrix in §9 determines when a production build is required.

---

## 6. Type Checking

Run TypeScript type checking with:

```bash
npm run typecheck
```

The node, renderer, and end-to-end projects compile with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.

When type checking is required by §9, type errors must be fixed before the corresponding validation can pass.

---

## 7. Linting

Run the project linter with:

```bash
npm run lint
```

New code must follow the project's linting rules.

Do not disable lint rules locally merely to make a task pass unless there is a documented reason.

---

## 8. Tests

Run the test suite with:

```bash
npm test
```

Run tests in watch mode during development with:

```bash
npm run test:watch
```

Run the unit and component tests with a coverage report with:

```bash
npm run test:coverage
```

Coverage uses the V8 provider and reports statements, branches, functions, and lines for sources under `src/`. It covers the unit and component tests only; end-to-end coverage is not collected. Coverage output is written to `coverage/`, which is not committed.

The unit coverage metric excludes the Electron and React composition roots (`src/main/index.ts` and `src/renderer/main.tsx`). Their import-time global wiring is exercised through the end-to-end suite; lifecycle orchestration is extracted into testable modules and remains included in unit coverage.

Tests should primarily cover domain and application behavior.

Domain tests must not require Electron or a browser environment.

Vitest uses the Node.js environment by default. Renderer tests opt into jsdom when behavior requires a DOM.

End-to-end tests live in `e2e/` and run with:

```bash
npm run test:e2e
```

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. Hidden runs execute spec files in parallel across six workers locally or four in CI, and selected long-running suites distribute their independent tests across those same workers; visible runs stay serial. Parallel execution is safe because each worker cleans only its own `tree-e2e-p<pid>-` applications, the machine-global `Cmd+0` shortcut is stubbed for every launch except the serial `e2e/shortcut.spec.ts`, and the shared system clipboard is serialized through a cross-process lock. The execution model and its rationale are recorded in `docs/decisions/0012-parallel-e2e-execution.md`. Use Playwright's `--workers` option when a local or CI environment needs a different concurrency limit. The suite is macOS-only, requires a display, and must not run as two concurrent Playwright invocations.

Application windows are created hidden by default so the suite does not steal desktop focus. The test-owned entry `e2e/electron-entry.cjs` applies hidden mode through `e2e/hidden-windows.cjs` before the application bundle loads, and every launch asserts the selected window mode, so an Electron or Node upgrade that invalidates the override fails on the first launch instead of silently showing windows. Run with visible windows when observing the real UI, for example during product verification:

```bash
TREE_E2E_VISIBLE=1 npm run test:e2e
```

To observe a single spec, run `TREE_E2E_VISIBLE=1 npm run test:e2e -- <spec>` (this rebuilds the application first) or `TREE_E2E_VISIBLE=1 npx playwright test <spec>` (this uses the current `out/` build).

Hidden mode still requires a macOS GUI session; it does not make the suite headless.

Drag tests start a gesture through `startRowDrag` in `e2e/fixtures.ts`. A visible run happens on a live desktop, so that helper verifies the active drag survives a short settling window and retries the gesture a bounded number of times, since a window that loses focus releases pointer capture and the application cancels the drag by design. The hidden default removes desktop focus changes from the gesture, and the bounded retries remain for visible runs.

Breadcrumb drag coverage in `e2e/drag-and-drop-hierarchy.spec.ts` checks toolbar destinations, focus/mode transitions, and both visible and hidden restored move sites after undo. Native pointer capture can also fail without a lost-capture event; renderer tests exercise outside-list move, release, invalid-target, and cancellation events through the same gesture handlers, so toolbar coverage does not assume capture succeeded.

Window addressing in `e2e/fixtures.ts` is focus-independent for the same reason: closing, resizing, or reading the main window through `closeMainWindow`, `setMainWindowBounds`, and `readMainWindowBounds` addresses the application's window directly instead of relying on the application being frontmost, so the window-close flush and quit path stays testable while the application is inactive.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**` and the `test-results/**` scratch directory where finished diagnostic specs are parked, and Playwright only reads `e2e/`.

Native editor context-menu behavior is covered by renderer and IPC contract tests. The macOS popup itself must be product-verified on supported macOS hardware with a display because the Playwright Electron driver cannot reliably inspect or select native menu items; use a visible suite run (`TREE_E2E_VISIBLE=1 npm run test:e2e`) when the popup must be observed. The popup only captures a small selection snapshot and does not add persistence work, tree traversal, or retained state; disk writes, interactive CPU, and memory growth remain unchanged outside the selected editing command.

### Defect regression workflow

The defect-first and boundary-testing rules are defined in `AGENTS.md` §9. Boundary contract tests live next to the implementation; end-to-end tests live in `e2e/`. Use unit tests for deterministic state-machine branches and E2E tests for the real Electron wiring.

### Navigation and caret changes

Navigation and caret behavior must be designed and reviewed as a state-transition matrix, not as isolated key fixes. The matrix must cover:

* entry motions (`h`, `j`, `k`, `l`, boundary motions, counted motions, and pointer/focus restoration when applicable);
* exit motions and repeated-key behavior;
* text-caret positions (beginning, middle, final character, and empty text);
* node context (root, current parent, sibling, child, attached image, and image-only node); and
* expected destination caret state, including whether an image caret is active and which text position must be restored.

Build the affected-path inventory before editing code. Start from the state being changed (selected node, text cursor, saved image-entry position, image-caret indicator, selection, or mode) and trace every relevant writer and caller, not only the command that exposed the defect. Include keyboard commands, counted and repeated commands, pointer/focus changes, node entry and exit, edits, undo/redo, and mode changes when they can affect that state. For each buffered or transient editing session (including Replace mode), explicitly inventory what happens when each relevant command arrives before the session's ordinary finish event: whether the edit is committed or discarded, whether the command acts before or after that resolution, and the resulting selection, cursor, active caret, and mode. Do not assume shortcut handlers follow the same path as ordinary mode-specific key handling. Include transitions where the selected node ID stays the same or a motion clamps at a boundary. For each affected path, record the starting state, action, expected selected node, text cursor, active caret, restored position when applicable, and mode. Mark its focused test and representative Electron test, or explain why a path is inapplicable. Update the inventory when a newly discovered path changes the affected state; avoid expanding it to unrelated commands.

The current Vim requirement-to-test inventory is in [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md). The inventory marks every row whose expected behavior deliberately diverges from Vim, with the reason. A row without the marker is expected to match Vim for the keys and commands it names, so an unmarked divergence is a defect. The implementation review must check each affected row against both the behavior and its marker.

The invariant for an attached image is explicit: the image is a separate character; entering it records the originating text caret; leaving it either restores that recorded caret or, when crossing to another node, applies the documented destination position. Every entry path and every exit path must have focused unit coverage and end-to-end coverage for the representative process boundary. Tests must include at least one non-final text position, a same-node round trip, a cross-node transition, and a repeated motion at the boundary.

A screenshot or a single happy-path test is not sufficient evidence for navigation or caret work. The implementation review must trace each affected state-changing path in the code, compare its resulting state and tests against the inventory and matrix, and explicitly report any intentionally unsupported combination. When several defects involve the same state, review whether multiple owners or scattered resynchronization calls are causing omissions; record the conclusion and address a confirmed design cause within the authorized scope.

### Input-path consistency

`docs/PRODUCT.md` §20.7 requires the same result from every input path to a state. Before changing a command, control, overlay, or focus target, list every path that reaches it (pointer, each keyboard shortcut, Vim key, menu item, restored session) and give each one an end-to-end assertion on the resulting state: appearance including focus indicators, focused element, caret and selection. Compare the paths in one test where the state allows it. Two causes recur and deserve a direct check:

* Browser heuristics tied to the last input device. `:focus-visible` on an element focused by script shows its ring after a keyboard action and hides it after a mouse action. Style a programmatically focused control with `:focus`, and keep `:focus-visible` for controls the user focuses directly.
* A handler wired to one event type. A pointer handler that sets focus or state before it calls the shared command, and a keyboard handler that does not, produce different results from one command.

Playwright's default light color-scheme emulation and its synthetic pointer events can hide or fake such differences, so the assertion reads computed style or state after each real input path, as `e2e/preview.spec.ts` does for the image preview close button.

### Vim end-to-end coverage

Keep Vim coverage layered. Caret arithmetic and clamps, counts, image return positions, session commit ordering, mode transitions, and dot-repeat bookkeeping belong in the focused suites (`src/renderer/vim-*.test.ts`, `vim-*.property.test.ts`, `editor-input-handlers.test.ts`, `use-node-input-bindings.test.tsx`). Handler-level fixtures paint the resolved caret themselves, so they cannot detect a competing or omitted projection in the production hook; `use-node-input-bindings.property.test.tsx` runs generated sequences through `useNodeInputBindings` with a real `EditorStore`, flushes deferred focus work at arbitrary points, and checks the DOM caret, image indicator, and an `Enter` preview probe against the independent model in `src/renderer/test/vim-sequence-model.ts`. Its fixture supplies only the rendered text and the image class, so it does not replace the Electron specs for native focus, pointer timing, real rendering, or contenteditable. Keep a case in the Vim end-to-end specs (`e2e/vim-image-caret.spec.ts`, `e2e/vim-text-editing.spec.ts`, or `e2e/vim-navigation-and-visual.spec.ts`) when it proves something those suites cannot: application shortcut dispatch, real keyboard, pointer, blur, or focus sequences, the real store or attachment rendering, or a committed light/dark screenshot baseline. Before removing a case, confirm that a focused test covers the same rule, that a retained case still exercises the boundary or the rendered state, and that it is not the last real-Electron coverage of a shortcut's dispatch path, a pointer, blur, or focus trigger, a pending-session commit, or an image-caret rendered state. Update [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md) in the same change: merge duplicate rows instead of leaving a row without real-Electron evidence. `npm run check:docs` verifies that every test name it cites still names an existing test. Snapshot baselines that only a removed case referenced become orphans; remove them when the session's file-operation permissions allow it, and otherwise list the exact paths for the handoff. A suite-composition change is a test and documentation change for §9 purposes; re-measure the focused E2E suite with the same command and environment as its recorded baseline.

Vim command sequences that need a shifted continuation key must be tested in physical key order. A real keyboard fires the modifier's own keydown before the key it modifies — `Shift` before `O` in `zO`, `$` in `d$`, `A` in `rA`, or `{` in `ys{` — and that keydown must not consume the pending command. A test that dispatches only the capital or shifted key event (for example Playwright's `press('O')` or a focused test that sends `key: 'O'` directly) does not exercise that order and can hide a defect that breaks physical typing. Use `pressShifted` from `e2e/fixtures.ts` for real-boundary cases, and in focused tests send the bare modifier keydown explicitly between the prefix and its continuation.

The same event-sequence fidelity applies wherever handler behavior depends on platform-generated surrounding events, such as lock or dead keys, native composition, or key repeat. A helper or double that collapses a physical keypress into one synthetic event can stay green while real typing is broken, so model the event sequence the platform actually delivers whenever the handler observes more than the logical key. Native IME composition cannot be driven through Playwright, so composition handling is verified with unit-level contract sequences; do not claim real-IME end-to-end coverage.

### Editing-mode end-to-end coverage

Standard editing is the first-run default and Vim editing is a permanent mode (`docs/PRODUCT.md` §20.2), so a test whose behavior can differ between them must run in both. Standard editing is Vim Insert without the Vim key handler, so the modes differ only at a few points: the startup mode and restored caret, `Escape` and undo grouping, pointer handling in an editor, rendering of the caret and selection, the status-bar layout, the image preview, and the application commands that Vim pre-resolves (`Cmd+A/C/X/V`, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, `Cmd+Z`, `Cmd+E`, `Cmd+Enter`, and the context-menu Cut and Paste).

`launchTree` writes the Vim preference from the Playwright option fixture `editingMode` (`'vim'` by default) unless the test passes `vimPreference` itself. `describeForEachEditingMode(title, body)` in `e2e/fixtures.ts` runs a describe body once per mode, names each block `<title> [vim editing]` or `<title> [standard editing]`, and hands the body a `screenshotName` function that gives each mode its own baseline (`name-vim.png`, `name-standard.png`). Tests whose behavior exists only in Vim sit in a separate `Vim editing only` describe block of the same file, outside the helper.

Every `e2e/*.spec.ts` file declares one category on its first line, as `// @editing-modes: <category>`, and `npm run check:e2e-modes` enforces it:

* `both` — the file's tests run through `describeForEachEditingMode`; the check fails a `both` file that never calls it, and any other file that does.
* `vim` — the behavior under test exists only in Vim editing.
* `independent` — the asserted behavior does not pass through a point where the modes differ. These tests run once, with Vim editing.
* `explicit` — every launch sets its own preference because the file tests the preference itself; only `e2e/vim-toggle.spec.ts` uses it.

A new spec file picks its category when it is created. Choose `both` when any step involves typing, the caret, selection, pointer input in an editor, an application editing command, the preview, or the status bar.

---

## 9. Full Validation

The repository must provide:

```bash
npm run check
```

This is the standard validation command for day-to-day work.

It should run:

1. type checking;
2. linting;
3. formatting check (`prettier --check`);
4. documentation governance (`npm run check:docs`);
5. requirement traceability (`npm run check:requirements`);
6. end-to-end editing-mode categories (`npm run check:e2e-modes`);
7. OpenCode permission checks (`npm run check:opencode`);
8. tests with coverage enforcement;
9. production build.

The documentation governance step validates ADR metadata and indexing, checks that relative links and ADR references in live documents (including active initiative plans) resolve, and rejects restated product quantities outside `docs/PRODUCT.md`.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This runs `npm run check`, the end-to-end suite, the performance suite, and finally the dependency audit (`npm audit`), so an advisory without an available fix reports after the suites rather than hiding their results. The matrix below defines when complete validation is required; the normative validation policy is in `AGENTS.md` §10.

### GitHub Actions

GitHub Actions runs `npm run check` on Ubuntu and the real Electron end-to-end suite on macOS for every pull request and push to `main`; the Electron suite also supports manual dispatch, and its job is limited to 12 minutes. The jobs run independently, and superseded runs for the same pull request or branch are canceled. The performance suite runs on a scheduled or manual macOS workflow and is intentionally separate from pull-request validation because its measurements are machine-sensitive and macOS minutes are limited for private repositories. Failed E2E and performance runs upload their available reports and result artifacts. Mutation testing runs on a weekly or manual Ubuntu workflow, separate from pull-request validation because of its run time (§12).

The Attribution workflow runs `scripts/check-attribution.mjs` on every pull request. It fails the check when the pull request description or any of its commits carries an agent co-authorship or "generated with/by" line, per `AGENTS.md` §12. This is the server-side backstop described in §3; it holds regardless of whether the author's machine had the `commit-msg` hook installed.

### Risk-Based Validation

Use the highest applicable tier. Focused checks may be run during implementation, but they do not substitute for a broader required tier.

| Tier | Change risk | Required validation |
| --- | --- | --- |
| Minimal Risk | Documentation or content only, with no executable configuration change | Run `npm run format:check:changed` and `npm run check:docs`. Also run `npm run check:opencode` when agent workflow documentation changes. |
| Low Risk | Executable tooling or configuration, tests, or an isolated non-runtime refactor | Run affected type, lint, formatting, governance, and focused test checks. Run `npm run check` when executable source, dependency metadata, build configuration, or validation tooling changes. Agent-prompt documentation remains Minimal Risk unless executable configuration such as `opencode.json` changes. |
| Moderate Risk | Product, domain, or renderer behavior contained within one process, without a persistence or platform boundary | Run `npm run check`, affected unit or property tests, and focused E2E coverage for every affected user-visible requirement. Broaden E2E coverage when shared interaction or lifecycle infrastructure changes. Perform product verification of the changed flows. Run performance checks when `docs/PRODUCT.md` §22 applies. |
| High Risk | Process, IPC, filesystem, persistence, clipboard, attachment, native shortcut, startup, shutdown, security, dependency, toolchain, shared fixture, or scale-sensitive state changes | Run `npm run check:full`, the unit, contract, real-boundary, and failure-path coverage required by `AGENTS.md` §9, applicable security checks and audit, same-machine performance comparison when performance may change, and visible verification for native behavior automation cannot inspect. |

When categories overlap or the tier is uncertain, use the higher tier. A suite that cannot execute its real boundary is blocked, not passed.

For a contained change, use a concise conversation plan, a focused development loop, the tier's required validation, and a primary-agent diff review. Add a working plan, independent reviewer, or separate product verifier only under the triggers in `AGENTS.md` §§8 and 13. A user-visible change still needs product verification by the primary agent when no separate verifier is required. Keep defect-first regressions, boundary tests, and visual evidence whenever their specific triggers in `AGENTS.md` §9 apply.

Classify the complete change, not only its purpose. For example, a workflow-documentation change that also modifies a validation script or its tests is Low Risk because executable validation tooling changed.

`npm run format:check:changed` is the canonical scoped formatting check. It checks supported staged, unstaged, and non-ignored untracked files relative to `HEAD`, excludes deleted files, safely passes filenames without shell interpolation, and succeeds with an explicit message when there are no eligible files. The full-repository `npm run format:check` remains part of broader validation.

### README Screenshot Maintenance

The README gallery uses [the synthetic demo document](images/demo-document.json). It is a documentation resource, not a copy of a user's application data. Preserve its contents across captures; changes to the example itself should be deliberate and reviewed. The capture script launches the built Electron application with a newly created temporary profile and never opens the normal profile. It captures the overview and then enters the meetup branch in the same running application without editing the document or changing that branch's expanded state.

Run `npm run screenshots:readme` on macOS to build and capture both images. Inspect `docs/images/tree-overview.png` and `docs/images/tree-focus-dark.png`, including matching node text and order. The command updates `docs/images/refresh.json` only after both captures succeed; commit that marker with the inspected images even when their bytes are unchanged. The marker records the captured source revision, demo digest, and capture time. Its committing revision, rather than a timestamp or the PNG's most recent byte change, starts the refresh interval.

Run `npm run screenshots:status` after a feature commit. It reports how many commits follow the last committed refresh marker and whether the interval in `AGENTS.md` requires another capture. A missing marker requires an initial capture; a pending marker must be reviewed and committed before it counts as a completed refresh. These commands never stage or commit files. After a due capture, inspect and commit it separately from the feature, subject to any standing review or no-commit condition.

The README maintenance rules are owned by `AGENTS.md` §11. This documentation gallery is separate from visual regression baselines: it is not a pixel acceptance test, and small cosmetic differences need not trigger a gallery refresh.

### Demo Video Generation

Run `npm run demo:video` on macOS to build the app, install Playwright's recording encoder, and record the predefined sequence in `scripts/record-demo.mjs`. The script uses the committed synthetic screenshot document in a fresh temporary profile and opens a visible window so native keyboard input reaches the editor. The entire demo must use dark appearance, including window creation and closing, regardless of the machine's system appearance. Vim editing must remain enabled throughout the demo. All demonstrated interactions must use the keyboard: `zo` opens the root fold, `3j` selects the meetup branch, `zO` opens its nested folds, `gd` enters the branch, and `3j` selects the note. `A` appends in Insert mode and Escape returns to Normal mode. `0vw` demonstrates character Visual selection; `Vj` selects two sibling nodes; `>` and `<` move the selected nodes into and out of a parent; `u` and `Ctrl+r` demonstrate undo and redo of a move. No mouse clicks are used. Pauses are brief so the demo shows these actions within its duration budget. The original fixture and normal application profile are never edited.

`npm install` or `npm ci` installs Playwright. The command downloads Playwright's recording encoder when needed; no Homebrew installation or additional conversion encoder is required. Dependency installation and the first recording-encoder download require network access.

After the move and undo/redo sequence, `gv` restores the two-node Visual selection and `d` cuts the selected discussion topics from the meetup's conversation outline. `Ctrl+o` returns to the overview, `zc` folds the meetup, `2j` selects “Ideas for later”, and `gd` enters that different branch. The destination is shown before `P` pastes the topics above its existing ideas. The capture verifies that the topics disappear from the source and appear together in the destination, with its existing children preserved.

Recording begins after the renderer and fonts are ready. Playwright's screencast captures at maximum frame quality, with a rendering scale of 1.5 and a 1500-by-1080 recording of the 1000-by-720 window. This improves source text clarity without enlarging the logical interface. The output remains a WebM video with standard playback controls.

The WebM video, representative PNG frames, and source metadata are written to ignored `reports/demo/`. Each run replaces that directory. Open `reports/demo/tree-demo.webm` in a compatible browser or video player to review playback and inspect the PNGs for text readability. This documentation demo does not replace visual regression tests. The video must be smaller than 3 MB (3,000,000 bytes) and shorter than 30 seconds. The script rejects empty recordings, missing or invalid WebM duration metadata, and recordings reaching either limit. The measured duration and file size are recorded in the output metadata.

The separate `Generate demo` workflow runs for relevant pushes to `main` and supports manual dispatch. Successful runs upload the video, PNGs, and metadata as a downloadable artifact with seven-day retention. Generation does not commit files, update the README, or publish a Pages site. README screenshots retain their existing maintenance schedule. Pages publication and a stable README link are a separate step.

### Screenshot Rendering Scale

The E2E fixture passes `--force-device-scale-factor=1` in Electron's launch arguments, before the test entry, and asserts `window.devicePixelRatio === 1` after launch. This makes screenshot rasterization independent of the attached display's backing scale. Keep GPU rendering and the existing Playwright comparison settings: CSS-sized output does not by itself fix the scale at which Chromium draws glyphs. The performance fixture retains the native display scale for presented-window measurements.

The investigation on 2026-10-05 at `b47725a` reproduced a scale mismatch without changing application code or baselines: the three light strikethrough screenshots failed at startup scale 1 and passed at startup scale 2. Existing punctuation screenshots passed serial, parallel, and visible runs at scale 1. A screenshot stability regression failed when consecutive launches used startup scales 2 and 1, then passed after the canonical launch override. Setting the scale through `app.commandLine.appendSwitch` in the test entry or through a later CDP metrics override did not reproduce the launch-time scale change. Hidden versus visible windows produced identical diagnostic frames; GPU versus CPU rasterization changed edge pixels but did not resolve the failing strikethrough comparisons. These experiments establish display scale as a reproducible cause; they do not establish the trigger of the failures reported from the earlier session.

`e2e/screenshot-stability.spec.ts` checks both editing modes and appearances, repeated exact PNG captures across conflicting startup scale arguments, the received Chromium switch, and the effective renderer scale. It also verifies that a one-pixel text translation changes the image. Run its serial and parallel repeat guards after changing rendering or launch infrastructure:

```bash
npx playwright test e2e/screenshot-stability.spec.ts --repeat-each=5 --workers=1
npx playwright test e2e/screenshot-stability.spec.ts --repeat-each=12 --workers=6
```

Also repeat an existing `toHaveScreenshot` test, such as `e2e/typed-input.spec.ts --grep 'operator-like punctuation'`, under both worker counts. Do not regenerate baselines merely because a comparison failed: first verify the canonical scale and inspect actual, expected, and diff images. Regenerate only baselines that disagree with confirmed stable rendering, and inspect every changed baseline under the visual workflow below. The scale decision is recorded in [ADR 0019](decisions/0019-canonical-e2e-rendering-scale.md). These checks cover canonical screenshot rendering. Verify native Retina presentation through the regular application (`npm run dev`) on a Retina display during product verification.

### Validation Evidence and Reuse

Run `npm run validation:snapshot` to identify the repository inputs to a validation result. It reports `HEAD` and a deterministic digest of the tracked binary diff plus the paths, normalized executable modes, and contents of non-ignored untracked regular files; paths use locale-independent UTF-8 byte ordering, and untracked symlinks contribute their link target without reading the target. Regular-file modes are normalized to Git-style `100644` or `100755`, so other permission-bit changes do not affect the digest. The command accepts tracked diffs up to 100 MiB and fails rather than emitting partial evidence above that guard. The temporary root `WORKING_PLAN.md` is excluded to avoid making its recorded digest self-referential; supply the plan separately to review roles. Staging alone does not change the digest when file contents are unchanged. Ignored generated outputs are excluded; when a later check consumes generated artifacts such as `out/`, record the command and snapshot that produced them.

For each result, use this compact record:

```text
- Command and scope: <exact command and any narrower scope>
  Result: pass | fail | blocked
  Snapshot: <HEAD and digest from npm run validation:snapshot>
  Environment/artifacts: <relevant environment and generated-input assumptions, or none>
  Invalidation notes: <stages retained or invalidated by later changes, or none>
```

For a rendering-sensitive change as defined by `AGENTS.md` §9, add a separate visual-evidence record after the command results:

```text
- Visual evidence: <affected states inspected>
  Command and artifact: <exact command and screenshot path>
  Result: pass | fail | blocked
  Snapshot: <HEAD and digest from npm run validation:snapshot>
  Notes: <what was visually confirmed, including relevant interaction states>
```

The smallest representative state set is preferred. For focus, caret, selection, or mode styling, that set must include an equivalent focused and unfocused element, plus the transition between them when the state can persist across components. This includes neighboring or repeated components when styling could leak from the active one. When a product requirement specifies relative placement or alignment, add a real-renderer geometry assertion for that relationship where practical; a screenshot baseline alone can preserve an already-misaligned result. Do not create or inspect screenshot artifacts for non-rendering changes, and do not repeat an inspection while the rendered inputs and states remain unchanged. Automated DOM, CSS-class, computed-style, geometry, and screenshot tests complement one another: a passing non-image assertion does not establish visual correctness, and a screenshot baseline must be deliberately inspected when it is created or updated. Inspecting means answering one question for every text run in the image: does each character appear exactly as stored, in the stored order, without a joined, shifted, missing, or substituted glyph? Read the stored text from the test's own seed or typed input and compare it with the picture character by character; a baseline that merely looks plausible is not inspected. A baseline of text drawn by the bundled typeface is the case this question exists for: before the fix in `c085f1e`, committed baselines showed `https: //example` because the typeface joined `://` into a ligature, and the tests had accepted it. `e2e/text-fidelity.spec.ts` compares risky character sequences with a character-by-character reference, and `e2e/typed-input.spec.ts` types realistic lines key by key; add a string to the first when a new sequence draws oddly, and a line to the second when typing a new kind of text matters.

When the Product Owner reports a defect that the suites did not catch, name in the handoff the test level that should have caught it (domain, hook or component, real-renderer end to end, screenshot, performance, or manual native-keyboard check) and the reason it did not, and add the missing coverage at that level together with the fix. Keystroke dispatch through Playwright is not native macOS text input: input-method composition, system autocorrection, and key repeat are not exercised, so a change to input handling is also checked by hand in `npm run dev` with the real keyboard.

When inline rich text can wrap or fragment across lines, include deterministic synthetic content that wraps and inspect the affected line fragments and caret or selection boundary in the real renderer.

For changes to appearance, window creation, renderer loading or reloading, or closing, verify `docs/PRODUCT.md` §20.5 in both light and dark appearances. Run `TREE_E2E_VISIBLE=1 npx playwright test e2e/window-appearance.spec.ts --workers=1` for the native background regression and inspect the affected lifecycle transitions with a visible Electron window. Include startup and closing when window lifecycle or appearance changes; include reload and system appearance switching when those paths are affected. Observe the transition itself, using a screen recording when needed to inspect brief flashes. A screenshot of the loaded editor, a computed CSS color, or a native background value at a checkpoint cannot establish that a transition is free of flashes. Record the observed transitions, appearance, command, and outcome as visual evidence, and identify any transition that could not be observed as unverified. Reuse still-valid evidence under the rules below; documentation-only changes do not require a new visual run.

A result remains reusable only while those inputs remain valid. `npm run check:full` subsumes the `npm run check`, E2E, and performance stages it contains; `npm run check` subsumes its listed stages. A focused result does not establish broader coverage. Documentation-only edits invalidate documentation and formatting checks, plus OpenCode governance when agent workflow files change, but do not invalidate runtime suites. Source changes invalidate affected static checks, tests, and artifact-dependent suites. Test or fixture changes invalidate that suite. Dependency, build, test-runner, and OpenCode-policy changes invalidate every affected stage.

If an aggregate command fails or is blocked after some stages pass, record the aggregate command's actual result; never relabel it as passed. Its completed successful stages remain reusable when their inputs are still valid. Run every failed, blocked, or not-run required stage separately on the same snapshot. The required tier is then satisfied by composed stage evidence, recorded as the aggregate attempt plus the supplemental commands. A later edit invalidates only the affected evidence under the rules above.

Pass the validation record to review roles. They consume still-valid results and run an automated check again only for an uncovered scenario, stale or incomplete evidence, or a finding that requires it. Read-only review does not invalidate evidence. After a fix, rerun affected checks and their dependencies; repeat complete validation only for a tier that requires it or after a substantial, architectural, high-risk, or materially scope-changing fix.

An E2E suite that cannot launch Electron or execute the relevant boundary is not a passing validation result. Report the exact environment failure and rerun the suite on supported macOS hardware with an available display before claiming full validation.

Security-sensitive changes must also verify the Electron boundary tests, including IPC validation, renderer navigation restrictions, attachment validation, and the production content security policy. Run `npm audit` when the network is available; a registry connectivity failure must be reported rather than treated as a clean audit result.

Shutdown and attachment changes should also verify that queued renderer saves are flushed before quit and that non-PNG or malformed image bytes are rejected at the main-process boundary.

The E2E and performance fixtures continuously observe the renderer's persistence and operation error messages. Any visible `.save-error` occurrence fails the test, including transient `Changes could not be saved:` and `Operation failed:` messages that disappear before the test completes. New persistence or autosave work must retain this guard and include a regression scenario for rapid edits or overlapping saves.

The fixtures register each launched Electron child process before waiting for readiness. Teardown requests the application shutdown handshake, waits on the child process exit event, then uses bounded SIGTERM/SIGKILL escalation and fails if the owned process remains alive. Per-test teardown runs in the isolated-data fixture rather than a module-level hook, because Playwright caches imported helper modules for a worker's lifetime and a module-level hook would apply only to the first test file; the save-error guard and the clipboard-lock release share that teardown. Save-status observation uses both a DOM mutation observer and a final collection, so transient document-save and attachment-cleanup errors are retained even if the status disappears before test teardown. Observations are released with their owning app, so restart tests never query stale Playwright pages during worker teardown.

The E2E and performance `launchTree` helpers write the Vim editing preference as enabled before launch, because most suites exercise Vim editing; an E2E test passes `vimPreference: false` for standard editing, or `'saved'` to keep what an earlier launch persisted or to observe the first-run default. With Vim enabled, the helpers start an Insert session for ordinary editing suites; Vim tests pass `initialMode: 'normal'` to verify the application's Normal-mode startup. The E2E `typeInto` helper also enters Insert mode when needed and restores a textarea's insertion position before typing. Tests that assert Normal-mode key handling press the keys directly instead of using that helper.

If Electron shows a macOS crash dialog or a full suite fails during application launch, first treat it as a process-lifecycle failure. The E2E fixtures clean up stale applications per worker through their own `tree-e2e-p<pid>-` marker, and `e2e/global-setup.ts` removes leftovers from earlier runs before any worker starts. The performance fixtures clean up only stale Electron processes carrying their own temporary `tree-perf-*` user-data marker. Cleanup retries after launch failure and the launch error is included in the test failure. Do not use an unrestricted Electron process kill because it may terminate unrelated applications. After cleanup, rerun the isolated failing test and then the complete suite.

File-service diagnostics identify `load`, `save`, `writeAttachment`, `readAttachment`, and `cleanupAttachments` operations, their phase, and the paths involved. Failures are logged with the original error message.

---

## 10. Development Workflow

The root `CLAUDE.md` imports `AGENTS.md` so Claude Code sessions load the same repository policy as Codex and OpenCode, including versions that do not load `AGENTS.md` directly. Keep the shared policy in `AGENTS.md`; the import is only a compatibility adapter.

OpenCode uses the project configuration in `opencode.json`. Start a task with the `develop` primary agent. The normative task lifecycle, approval rules, review requirements, completion criteria, and Git discipline are owned by `AGENTS.md`. The role prompts in `.opencode/agents/` define only the inputs and actions specific to each role. Use the matrix and evidence rules in §9 when executing that lifecycle.

For product discovery, ask the `develop` coordinator to delegate one bounded question to the read-only `product-researcher`. Supply the relevant entry from `docs/OPEN_QUESTIONS.md`, the Product Owner's statements and disagreements, available usage evidence, and the desired research scope. The researcher returns labeled evidence, counter-hypotheses, tradeoffs, and a proposed experiment to the coordinator; it does not edit the record or approve a direction. Open-question policy and the promotion boundary into product requirements are owned by `AGENTS.md`.

The `develop` agent's shell permissions are consent guardrails for host execution, not an operating-system sandbox. Routine repository and read-only process inspection, the named npm development and validation workflows, append-only Git work, and fixture-owned process cleanup run without approval. Unfamiliar commands require approval, while command categories that are destructive, publish externally, rewrite history, mutate dependencies, escalate privileges, or execute unrestricted interpreters are denied. Named npm workflows keep their ordinary arguments and attached output redirections inside the same approval boundary. Documented environment prefixes on the named workflows are inside the same boundary; ad-hoc diagnostic variables remain unfamiliar commands that require approval and must not be added to the policy. The permitted destructive file operations are deleting the temporary root implementation plan (`WORKING_PLAN.md`), retiring one tracked file with `npm run retire:file -- <repository-relative path>` (the script refuses untracked files, directories, symlinks, option-like names, and paths that escape the repository, and stages the deletion with Git), and moving temporary diagnostic specs and probe files (`e2e/_*.spec.ts`, `perf/_*`) into the gitignored `test-results/` scratch directory; copying artifacts within `test-results/` is also permitted. Rules use OpenCode's last-matching-rule semantics, so their order is security-sensitive. OpenCode resolves each command in a pipeline or chain separately and applies the strongest effect across the segments, so a chain runs without approval only when every segment is allowed. Keep the exact patterns in `opencode.json` rather than duplicating them here, and run `npm run check:opencode` after changing either the policy or the OpenCode version. That check also fails when an npm workflow named in this document falls outside the `develop` approval boundary, so a documented workflow cannot silently start prompting. OpenCode loads its configuration at startup, so restart OpenCode before verifying a policy change.

For unattended sessions, OpenCode's auto-approve mode (`opencode --auto`, or the TUI command palette) approves permission requests that are not explicitly denied; the deny rules above remain enforced.

`AGENTS.md` §4 requires repository edits to go through the agent's own file-editing tool rather than shell scripting, and every tool's configuration enforces that the way its own permission model allows. OpenCode and Claude Code both deny interpreters and in-place stream editing; Claude Code's rules live in `.claude/settings.json`, and Codex relies on `sandbox_mode = "workspace-write"` in `.codex/config.toml` instead of command patterns. Read-only stream editing and search stay available in both pattern-based tools, because the requirement concerns writes. `npm run check:opencode` asserts that this one category stays denied in both configurations, so the gap that existed until 2026-09-27, when only OpenCode denied it, cannot reappear silently. The check deliberately covers that category alone, because each tool reaches unattended operation through its own mechanism. Keep the exact patterns in each tool's configuration rather than duplicating them here.

Claude Code is configured in `.claude/settings.json` for sessions that run with few or no approval prompts:

* **Mode and boundary.** Sessions start in auto mode, and Bash commands run inside Claude Code's macOS sandbox. Sandboxed commands may write only inside the repository and `$TMPDIR`, may not read the rest of the home directory, may reach only the npm registry and GitHub, and do not see the secret environment variables listed in `sandbox.credentials`. Inside that boundary, Bash commands run without a prompt.
* **Electron workflows.** Electron cannot start under the sandbox, so the end-to-end, performance, and `check:full` workflows are listed in `sandbox.excludedCommands`. They run outside the sandbox, still without a prompt, because they are in the allow list.
* **npm cache.** Commands that write the npm cache under the home directory, such as `npm view` or `npm install`, fail inside the sandbox with an `EPERM` error. That error is the sandbox boundary, not a broken cache.
* **Denied operations.** Replaceable operations are denied outright so the agent switches to the dedicated tool: `cat`, `tee`, `curl`, `wget`, `env`, interpreter wrappers, history rewrites, and writes under `/tmp`. `PreToolUse` hooks also deny `&&` and `||` chains, shell loops, file redirection and heredocs, and `find` with `-exec` or `-delete`. Redirection to `/dev/null` and `2>&1` stays allowed.
* **Prompts that remain.** Pushing, dependency changes, and recursive deletion keep a prompt.
* **Agent self-modification.** In auto mode, the auto-mode classifier refuses an agent's attempt to edit Claude Code's own permission settings. The sandbox also denies Bash writes to the settings files. A change to this policy therefore needs the Product Owner to leave auto mode and approve the edit.

Allowed npm scripts and Git hooks execute mutable repository code with the host user's authority. The policy assumes this repository is trusted and reduces accidental or unexpected shell use; it does not protect the host from deliberately malicious repository code. OpenCode-native file tools remain subject to the denied external-directory boundary.

Before fixing a reported defect, run `npm run fix:history` — with no arguments it inspects the fix at `HEAD` or the working-tree diff, and it takes repository-relative paths otherwise — to see the earlier `fix` commits in the same production files, and when it reports a possible shared design cause include the proposed structural initiative or the reason none is needed in the handoff.

When an authorized outcome or session ends, provide a handoff recording what was completed, validation that passed, validation that failed or was blocked, unresolved issues, and the exact next task. Include a suggested prompt when another session is needed to resume the work. A commit followed by another authorized task in the same session needs only a brief progress update. An incomplete validation result must never be presented without a follow-up action.

---

## 11. Multi-Session Initiatives

The active initiative index is [`plans/README.md`](../plans/README.md). Use an initiative plan when an outcome needs coordination across sessions. The same plan type records a review follow-up batch whose tasks the Product Owner authorizes one at a time, so repository state — not conversation memory — shows what remains. A single-session outcome may contain several focused commits without an initiative plan; use a temporary `WORKING_PLAN.md` only when `AGENTS.md` §8 requires it. Active plans are coordination records; they do not replace `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, an ADR, or the Product Owner's authorization.

Each active plan should contain:

* the objective, scope limits, and relevant source-of-truth links;
* an explicit authorization state, including decisions still reserved for the Product Owner;
* an ordered table of task IDs, outcomes, dependencies, acceptance evidence, and status (`Planned`, `Ready`, `In progress`, `Blocked`, or `Done`);
* for each task, the files it is expected to change and its §9 validation tier, as required by `AGENTS.md` §8;
* the source review or report and its task IDs when the plan tracks a review follow-up batch, plus an explicit unverified-remainder note when the full list is unavailable;
* a single exact next task, or the reason no task can proceed;
* concise decisions and findings needed by later sessions, including baseline or final measurements when they affect the initiative;
* a copyable prompt for the next session.

At the start of a continuation session, read the index, the plan the request named or the one resolved from the index under `AGENTS.md` §8, `AGENTS.md` itself, and any existing `WORKING_PLAN.md`. Compare plan status with `git status` and recent commits. A dirty worktree or unfinished working plan means resuming that task first; do not skip ahead from a stale status field. When the worktree is clean, take the plan's next `Ready` task if the Product Owner requested continuation and its scope is authorized. Create or update a temporary working plan only when `AGENTS.md` §8 calls for one, perform the task's required validation and review, and commit the task together with the initiative status update. Whether the next task starts in the same session is decided under `AGENTS.md` §12, which also caps how many tasks one session may commit. In the handoff, cite the plan, completed task, next task, and a resume prompt. Do not repeat still-valid validation merely because the session changed.

If blocked, record the concrete blocker and the safe next action in the active plan when that update can be committed independently; otherwise preserve the uncommitted work and `WORKING_PLAN.md` and give the same information in the handoff. A plan's status must never imply a task passed validation or was committed when it did not. At completion of an initiative, or of a review follow-up batch whose last task has landed and for which the Product Owner confirmed no further tasks remain, move lasting product, architecture, or development knowledge to its owner, then remove the plan and index entry in the commit that records completion. Git history provides the completed plan's record; do not keep an archive or permanent validation log.

---

## 12. Testing Strategy

Tests should be placed as close as practical to the code they validate.

The most important product rules should be tested independently from the UI.

In particular, domain tests should cover:

* tree manipulation;
* node creation;
* node deletion;
* subtree deletion;
* node splitting;
* navigation;
* sibling reordering;
* clipboard transformations;
* image attachment rules;
* undo/redo;
* serialization and deserialization.

Tests should verify behavior rather than implementation details.

Requirement traceability uses a standalone comment directly above a test or suite:

```typescript
// @requirement PRODUCT.md §13.1
```

`npm run check:requirements` scans `src/**/*.test.*`, `e2e/**/*.ts`, and `perf/**/*.ts`.
It requires a marker for every numbered leaf section of `docs/PRODUCT.md` and for
parents with their own text; unnumbered subheadings belong to the nearest numbered
section. It rejects unknown section numbers and malformed markers. The checker
owns explicit exemptions with reasons for overview and product governance prose,
and a boundary-section list derived from `AGENTS.md` §9. Boundary sections also
require a marker under `e2e/`; a unit or performance marker cannot replace it.
Review the boundary list when adding or changing requirements. Section-level
traceability locates executable evidence; it does not prove that every sentence
has an assertion. Add markers only to tests that exercise the cited behavior and
review their assertions against the requirements when behavior changes.

A refactoring that preserves behavior should not require unnecessary test changes.

Store interaction tests use `createRealStoreHarness` from `src/renderer/test/real-store-harness.ts` by default for outcome assertions. It builds a real `EditorStore` over the shared application property-test load/save fakes, with in-memory clipboard and attachments. Assert the resulting document, location, focus, and renderer mode; use current snapshot nodes rather than supplying content that differs from the store. Tests own pending save timers with fake timers or an injected clock. Typed doubles in `src/renderer/test/` (`vim-keyboard-double.ts`, `editor-store-double.ts`) are for failure injection and calls that are themselves the contract, such as error reporting or lifecycle registration. A double supplies every member of its owner, so adding, removing, or renaming a member fails `npm run typecheck` at the double, while an unchecked literal can silently diverge and exercise a path the application never takes — the failure class [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md) removed for the interaction-state owners. When a double is needed, supply its snapshot and exercised behaviors through `createEditorStoreDouble`; do not recreate an `as unknown as EditorStore` literal.

End-to-end tests complement unit tests by exercising the real Electron application through the UI. They should target integration points that unit tests cannot cover: preload/IPC wiring, autosave and restart behavior, attachment files, the system clipboard, and the application startup path. See `docs/decisions/0002-e2e-testing-with-playwright.md`.

Platform-routed shortcuts need boundary-faithful end-to-end tests. Playwright injects key events through the DevTools protocol, which triggers Chromium's native editing behavior even though macOS does not route those commands in the running application. An end-to-end test for an editing command (Undo, Redo, Cut, Copy, Paste, Select All) must therefore suppress or disable the native browser behavior, such as the `copy`, `cut`, or `paste` event, and assert that the application still performs the action. A test that relies on the native default can pass while the product is broken. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

Coverage policy is defined in `AGENTS.md` §9. The enforced global and per-file floors are configured in `vitest.config.ts`, and `npm run check` runs the coverage-enabled unit suite that fails when a floor is not met. Coverage output can vary slightly between runs with identical inputs; treat a single-run global delta of a statement or two as measurement noise rather than a regression.

Per-file floors for the renderer interaction-state owners, their projection point, and scroll restoration are configured in `vitest.config.ts` and enforced by this coverage run. They are set just below coverage measured when each guard is introduced or strengthened, so losing a guarded module's focused coverage fails `npm run check`. Treat them as regression guards, not coverage targets: add behavior in its owner module with focused or property tests and restore coverage rather than lowering a floor. The single-owner pattern they guard is recorded in [ARCHITECTURE.md](ARCHITECTURE.md) §9 and [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md).

Property-based tests using `fast-check` cover domain invariants and `EditorStore` command sequences. They run as part of `npm test` and are written as `*.property.test.ts` files. The rules for when to add one are in `AGENTS.md` §9.

Property tests explore with a random seed on every run, locally and in CI, so each run can find a counterexample that an earlier run did not. A failure prints its seed and path. Replay it exactly with `FC_SEED=<seed> FC_PATH=<path> npx vitest run <file>`; `src/test/fast-check-setup.ts` applies both variables through `fc.configureGlobal`. A fixed seed on one property is allowed only when the test asserts that a branch was reached, and needs a comment saying so. Turn every reproduced counterexample into a named deterministic test in the same commit as the fix, as `vim-mixed-interaction.property.test.ts` does.

Write every run count as `propertyRuns(base)` from `src/test/property-runs.ts`. `TREE_PROPERTY_RUNS` multiplies all of them (default 1). `npm run test:property:soak` runs the property files at a factor of 20, and `.github/workflows/property-soak.yml` runs it nightly. A property whose every run builds the typed doubles passes a `maxScale` (`propertyRuns(base, maxScale)`), because Vitest retains every `vi.fn` it creates and thousands of runs exhaust the worker heap; do not create `vi.fn` inside a generated event. A soak failure is a candidate defect: replay it, then fix it under the defect-first workflow.

Mutation testing measures assertion strength, which coverage does not: Stryker changes one expression at a time in `src/domain`, `src/application`, and eleven pure renderer modules (the Vim editing, text-command, surround, caret-transition, vertical-navigation, command-state, and edit-session modules, `link-caret.ts`, `drag-caret-freeze.ts`, `node-drag.ts`, and `list-window.ts`, all under `src/renderer/` with no React, DOM, or Electron imports) and reruns the tests that cover it. A mutant that no test fails on has survived, and the mutation score is the share of mutants the tests detected. `npm run test:mutation` runs the full scope configured in `stryker.config.mjs`; arguments after `--` pass through to Stryker, so a narrower run is `npm run test:mutation -- --mutate src/domain/document-operations.ts`. Pass several files as one comma-separated `--mutate` value; a repeated `--mutate` flag keeps only the last one. Runs are incremental: `reports/stryker-incremental.json` lets a later run retest only mutants whose code or covering tests changed, and `--force` retests everything. The console prints the score table; read surviving mutants in `reports/mutation/mutation.html`. A full run takes about 15 minutes with the renderer modules included (measured 15m22s on 2026-10-02), so it is not part of `npm run check` or `npm run check:full`. `thresholds.break` in `stryker.config.mjs` is 93, below the full-run score of 94.97% recorded when it was set for the domain and application scope (93.86% on 2026-10-02 with the renderer modules added; timeout classification moves a module's score by a few points between runs), so a run fails (and the weekly workflow with it) when the score drops by more than timeout and random-seed noise. Raise it only after a measured full run is higher; never lower it to pass a run. The surviving mutants that remain are documented in source comments as equivalent or defensive. `.github/workflows/mutation.yml` runs the full scope weekly and on manual dispatch and uploads the HTML report.

When a task changes logic in `src/domain`, `src/application`, or one of the renderer modules named above, run mutation testing on the changed files and read their surviving mutants before handoff. Read the weekly report when the score drops. Treat a survivor as a question about a missing assertion, not a target to chase: kill it with an assertion on behavior, or leave an equivalent mutant (one that cannot change observable behavior) with a Stryker disable comment stating why. The Stryker Vitest runner does not yet work with Vitest 5, which is why `vitest` is pinned to 4.x; upgrade Vitest only together with a runner release that supports the new version, and confirm that a narrow run still kills mutants.

Run ordinary Vitest validation after Stryker has finished and removed its sandbox.
The temporary `.stryker-tmp/` tree contains copied and mutated tests, which the
normal test configuration can collect while it exists. Read a mutant against the
source recorded in its report, and confirm its exact expression before manually
replaying it. Suppress a mutator only when every replacement it produces at that
expression is equivalent. If one replacement is meaningful, keep the mutator
enabled and explain the equivalent survivor in a source comment.

Preserve expression grouping when replaying a mutant. Stryker replaces a syntax
node, so a nested `a && b` changed to `a || b` inside `(a && b) && c` becomes
`(a || b) && c`. Pasting the report's replacement as raw text without parentheses
would instead test `a || (b && c)`, a different program. A passing synthetic search
is evidence about its cases, not proof of equivalence; use the recorded invariants
to justify an equivalent disposition and name unsupported inputs separately.

Performance tests live in `perf/`. They run as part of `npm run check:full`, and can also be run on their own with:

```bash
npm run test:perf
```

They measure startup, typing, state/persistence work, and sustained renderer-memory growth at several document scales and print one JSON line per scenario. Unlike the e2e suite, the performance fixtures keep the application window visible: the typing scenarios measure paint latency for a presented window, and the same-machine baselines are recorded that way, so hidden e2e window mode is intentionally not applied to `perf/`. Every scenario also records its metrics through `perf/results.ts` into a JSON artifact (default `test-results/perf-results.json`, overridable with `PERF_RESULTS`). Set `PERF_BASELINE` to a previously recorded artifact to compare against it: the run fails when the baseline lacks a recorded scenario or metric, or when a metric regresses beyond `PERF_REGRESSION_TOLERANCE` (default `1.5`). Pass an artifact override as a single quoted value, for example `PERF_RESULTS="test-results/perf-after.json" npm run test:perf`; `PERF_RESULTS` output must stay under `test-results/`, and an unquoted value is treated as an unfamiliar command and requires approval. Re-record the baseline when adding a scenario or metric. The comparison is meaningful on the same machine, so baselines are captured locally and never committed. The recorded budgets, measured baselines, and scenario parameters are owned by the `perf/` suite; they are not restated here.

Each typing scenario focuses a specific input, asserts the seeded text is present and focused, types, and asserts the field received the typed text while the current-parent heading was not edited. This matters inside a parent, where the first textbox is the current-parent heading rather than the selected child. The scenario measures wall-clock typing time and paint latency; the `inputTurnaround` metric is an observation only, not React commit latency. The supported document-scale target is 100,000 nodes. A 30,000-sibling wide scenario guards that windowed rendering keeps typing cost independent of the displayed sibling count.

The state/persistence scenario in `perf/state.spec.ts` seeds a large attachment-bearing document and runs a structural burst, a typed-word burst, and a reference-changing delete; a second scenario exercises attachment-bearing history through structural commands, undos, and redos; a third measures attachment image validation and write latency. Each prints its measurements and enforces ceilings. The save count and the summed document bytes written confirm the automatic save policy triggers on inserted-word volume rather than per keystroke, and the cleanup scan duration guards the reference-changing path against unbounded history or document scanning. The budgets and their measured baselines are recorded by the `perf/` suite and its result artifacts.

The Vim performance scenarios measure repeated Normal, character Visual, whole-node Visual, and Insert interactions, standalone `dd`, and sibling movement through the visible Electron renderer. The save-responsiveness scenario measures the key that triggers a ten-word automatic save and the next key while a deliberately delayed save remains in flight. Selected scenarios repeat under four-times renderer CPU throttling as a reproducible constrained-CPU proxy; this does not model macOS Low Power Mode or system-wide contention. The memory scenario records renderer JavaScript heap and Electron process working sets at a warm point and after two further edit bursts. Summed process working sets may count shared pages more than once, so they are a diagnostic footprint rather than unique physical memory.

Behavioral guards live next to the code they protect and are named after the behavior they assert. The main guard families are automatic-save accounting and quit-time flushing (`editor-store.test.ts`, `editor-store.property.test.ts`, `e2e/shutdown-failures.spec.ts`), bounded save-failure retries and the locked save-failure state (`editor-store.test.ts`, `e2e/persistence-lock.spec.ts`), unexpected renderer errors and reload recovery (`ErrorBoundary.test.tsx`, `e2e/renderer-failures.spec.ts`), undo and redo command breadth with text-edit session boundaries (`editor-store.test.ts`, `editor-history.test.ts`, `e2e/history.spec.ts`, `e2e/undo-sessions.spec.ts`), attachment and PNG validation (`ipc-security.test.ts`, `ipc-handlers.test.ts`, `png-decoder.test.ts`, `e2e/attachment-validation.spec.ts`), image-display failures (`AttachmentPreview.test.tsx`, `e2e/attachment-validation.spec.ts`), window-geometry coalescing (`window-state.test.ts`), generation retention and recovery (`file-services.test.ts`, `e2e/persistence-reliability.spec.ts`), retention and byte reuse of attachment references (`editor-history.test.ts`, `attachment-bytes-cache.test.ts`), attachment cleanup retention and unlinking (`file-services.test.ts`, `e2e/attachment-cleanup.spec.ts`), save serialization, node lookup, path copying, and attachment-id collection (`document.test.ts`, `document.property.test.ts`), external hyperlink opening (`e2e/hyperlink.spec.ts`), and document-save directory flushing plus attachment-write flushing under abrupt termination (`file-services.test.ts`, `e2e/persistence-reliability.spec.ts`). Current requirements are owned by product and architecture documentation, while test names and fixtures identify their executable guards.

---

## 13. Persistence Testing

Persistence behavior must be tested independently from the React UI.

Tests should cover:

* saving a valid document;
* loading a saved document;
* preserving stable node IDs;
* preserving the tree structure;
* preserving the current parent;
* preserving the selected node;
* preserving remembered inline expansion and the scroll position;
* schema version handling;
* attachment references;
* attachment cleanup where applicable.

The application must not silently lose user data.

Real persistence across an Electron restart is additionally covered by the end-to-end suite in `e2e/persistence.spec.ts`.

---

## 14. Code Organization

The project must preserve the architectural boundaries described in `docs/ARCHITECTURE.md`, which owns the layer responsibilities and dependency direction.

Do not move logic across architectural boundaries simply to reduce the amount of code in a single task.

---

## 15. Dependencies

Before adding a new dependency:

1. Check whether the functionality can reasonably be implemented using existing dependencies or platform APIs.
2. Consider the maintenance cost.
3. Consider bundle size and startup impact.
4. Consider whether the dependency is actively maintained.
5. Avoid adding a dependency for a trivial utility.

Major dependency changes should be documented and, when appropriate, recorded as an architectural decision.

Direct dependencies are declared with exact versions and no range operators (`docs/decisions/0006-exact-dependency-pinning.md`). Upgrade a dependency by changing its exact version, reinstalling, and running `npm run check:full`; do not widen it to a range.

`package.json` `overrides` pins `qs` to a patched version: `@stryker-mutator/core` pins `typed-rest-client` `~2.3.0`, which pins a `qs` release with known advisories. Remove the override when a Stryker release depends on a patched `typed-rest-client`.

`npm audit` runs as the final step of `npm run check:full`, not of `npm run check`, so known vulnerabilities are reported at the end of complete validation. It requires registry access and fails when offline.

## Formatting

Code is formatted with Prettier using `semi: false`, `singleQuote: true`, and `printWidth: 120`, and indentation is declared in `.editorconfig`. `prettier --check` runs as part of `npm run check`; use `npm run format` to apply formatting.

---

## 16. Generated Files and Temporary Files

Do not commit:

* build output;
* temporary files;
* debug logs;
* local environment files containing secrets;
* IDE-specific files unless intentionally shared;
* generated artifacts that are not part of the source repository.

Follow the repository's `.gitignore`.

Electron Vite writes production build output to `out/`. This directory is generated and must not be committed.

---

## 17. Reviewing the Git Change

Git policy is owned by `AGENTS.md` §12. Run `npm run changelog` to regenerate `CHANGELOG.md` from Conventional Commit history.

Before committing, review the change with:

```bash
git status
git diff
```

Confirm that only intentional files are modified. Do not use destructive git commands unless explicitly requested.
