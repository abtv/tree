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

### Terminal shortcuts

Run `make` from the repository root to show these shortcuts. They delegate to the
existing npm workflows; the npm commands remain available for focused runs and
less frequent checks.

| Command | Purpose | Underlying workflow |
| --- | --- | --- |
| `make` | Show help | No tests or preparation |
| `make setup` | Prepare the web-test Docker image; owner only, requires network | [Chromium dependency preparation](#chromium-container-tests) |
| `make check` | Standard checks, unit coverage, timing guards, and production build | `npm run check` |
| `make unit` | Unit tests | `npm test` |
| `make e2e-electron` | Electron end-to-end tests | `npm run test:e2e` |
| `make e2e-web` | Web end-to-end tests in offline Docker Chromium | `npm run test:web:chromium` |
| `make dev-electron` | Electron development mode | `npm run dev` |
| `make dev-web` | Web development server | `npm run dev:web` |
| `make perf-electron` | Full Electron performance suite | `npm run test:perf -- --project=electron` |

Test and development targets never run `setup` automatically. Agents continue
using the named npm workflows and their existing permissions, including only
`npm run test:web:chromium` for container tests. No general Make/Docker permission
is required or added for these owner-facing shortcuts.

### Electron development

The application should provide a development command:

```bash
npm run dev
```

The preserved browser version has separate development, static build, preview
and isolated Chrome commands. See [Browser version](../src/web/README.md)
for their exact invocations, local URLs, storage identity and scope limits.
Local build/check commands do not publish. The source main-push pipeline and
one-time access setup are in [Browser publication](../deployment/github-pages/README.md).

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

Both commands first run `scripts/rename-dev-app.mts` (the `predev` and `prestart` hooks). On macOS it rewrites the bundle name in `node_modules/electron/dist/Electron.app/Contents/Info.plist` to "Tree", so the menu bar shows the application name instead of "Electron". This changes a dependency file in place and is repeated after every `npm install`. The Dock tooltip and icon still say "Electron" in development, because macOS takes them from the bundle itself; a packaged build sets its own name.

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

The node, renderer, end-to-end, and scripts projects compile with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.

Prefer `.mts` over `.mjs` for new Node scripts, browser E2E and performance specs, and their helpers and tests, and migrate an existing `.mjs` script when substantially changing its implementation. This also applies to temporary Node scripts. Keep `.mjs` when a tool requires JavaScript or an existing entry point must remain compatible; document the reason beside the exception. An unrelated edit does not require an extension migration. Existing tool configuration files retain their extensions unless their migration is part of the task.

Maintained Node scripts and their tests use `.mts` to declare TypeScript ES modules explicitly. Node 24 runs them directly by stripping erasable types; no build step or extra runner is required. Use explicit extensions in relative imports and type-only imports for types. `tsconfig.scripts.json` enables `erasableSyntaxOnly` and checks the scripts through `npm run typecheck:scripts`, included in `npm run typecheck` and `npm run check`. It uses the repository's ESNext/Bundler resolution to include shared `.ts` helpers; Node execution still requires real import paths and does not read tsconfig settings. The imported JavaScript tool configuration and compatibility launchers are checked as well.

Browser specs and helpers in `e2e/web/` and `perf/web/` use `.mts` and are checked by `tsconfig.e2e.json` alongside the Electron suites and the native Node comparison runner `perf/comparisons/safari-electron.mts`. ESLint and Stryker configurations retain `.mjs` for their existing loaders and configuration discovery. The three `.mjs` launchers in `scripts/web-release/` preserve installed workflow entry points and delegate to `.mts` implementations.

When type checking is required by §9, type errors must be fixed before the corresponding validation can pass.

---

## 7. Linting

Run the project linter with:

```bash
npm run lint
```

New code must follow the project's linting rules.

ESLint rejects `.mjs` modules outside the five explicit tool-configuration and release-compatibility exceptions in `eslint.config.mjs`. This applies to new files as well as tracked files in the linted source tree; generated output, dependencies and `.scratch/` retain their normal exclusions. Use `.mts` for temporary scripts too, as required by §6. A necessary new exception must have a documented reason and an explicit allowlist entry. `scripts/check-script-extensions.test.mts` checks both rejection and permitted paths. The lint step of `npm run check` enforces this rule locally and in CI.

ESLint rejects static imports and re-exports of React, React DOM, Electron, and Node.js built-ins in `src/application/`, including nested modules and tests. Application services receive platform capabilities through interfaces instead.

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

The unit coverage metric covers shared and Electron source and excludes their composition roots (`src/electron/main/index.ts` and `src/renderer/main.tsx`). Their import-time global wiring is exercised through the end-to-end suite; lifecycle orchestration is extracted into testable modules and remains included in unit coverage. Browser source under `src/web/` retains its pre-relocation exclusion from this metric; its unit tests still run, and Chrome E2E exercises the browser adapter and composition.

Tests should primarily cover domain and application behavior.

Domain tests must not require Electron or a browser environment.

Vitest uses the Node.js environment by default. Renderer tests opt into jsdom when behavior requires a DOM.

### Choosing test coverage

Browser E2E uses `primaryKey` from `e2e/web/fixtures.mts` for the host's Cmd or
Ctrl shortcuts. Dual-profile checks override the browser platform identity and
press the corresponding modifier. `pressPaste(page, modifier)` supplies the CDP
native paste command for either mapping. These synthetic events verify application
dispatch and default prevention; they do not establish real-keyboard delivery of
browser-reserved shortcuts.

A headed macOS Chrome probe on 2026-10-18 delivered Playwright's `Meta+N` to an
unhandled page without creating another browser page target. This confirms that
this automation path did not invoke Chrome's new-window accelerator; it does not
establish real-keyboard routing on any platform. Keep application default-prevention
assertions separate from browser-accelerator claims.

The Chrome E2E target uses Playwright Test specs in `e2e/web/` and the separate
`playwright.web.config.ts`. Electron specs, launch helpers and screenshot baselines
live in `e2e/electron/`, selected by `playwright.config.ts`. Each target discovers
only its own directory.
Browser commands, selection arguments, isolated contexts, restart profiles,
server cleanup and report paths are described in
[Browser checks](../src/web/README.md#browser-checks).

`AGENTS.md` §9 and procedure §9 own the test-level and redundancy policy. Apply it by separating rule variants from the real interaction being verified:

| What can fail | Preferred coverage | Representative Electron coverage |
| --- | --- | --- |
| Date/emoji recognition, ranges and invalid inputs | Domain unit tables and property tests | A qualifying edit opens suggestions and acceptance replaces the correct span |
| Command rules, counts and state combinations | Focused application/renderer tests with a real store where outcomes depend on it | Distinct keyboard dispatch and pending-session transitions that require the real editor |
| Hook/store coordination and popup lifecycle | Hook or component integration tests | Native focus, selection, caret, textarea/contenteditable differences and pointer timing |
| IPC, persistence, clipboard and attachments | Rule and runtime-contract tests | Real boundary success and important failure/recovery paths, including restart when relevant |
| Layout, wrapping and visual state | Focused geometry rules where useful | Real-renderer geometry and deliberately inspected screenshot evidence |

For example, adding another date spelling normally extends the domain table; it does not require another Tree × Agenda × editing-mode E2E matrix. Changing the key that accepts a suggestion requires checking the handler integration and the affected real editor paths. Reuse existing tests if they already assert the changed behavior. When removing a repetitive E2E, identify those retained tests and check that the removed case was not the only coverage of a distinct dispatch path, rendered state or important failure.

Breadcrumb moves use `App.test.tsx`'s `App breadcrumb move matrix` with the real store for all eight ancestor/root × expanded/collapsed × Standard/Vim combinations, including the complete tree, location, focus/caret and Undo/Redo. Its synthetic geometry and pointer events cannot prove native capture, hit testing or browser focus timing. `e2e/electron/drag-and-drop-hierarchy.spec.ts` retains four real-pointer history cases: Standard ancestor/collapsed and root/expanded, plus Vim ancestor/expanded and root/collapsed. Each destination and expansion state remains exercised in each editing mode across those cases. The same spec retains image-only sources, invalid targets and cancellation, toolbar highlight geometry/screenshots, editing-state transitions, and Undo/Redo after unrelated navigation. This split is specific to that matrix; it does not establish a four-case rule for other groups.

Enter-at-start subtree preservation uses real App/store coverage in `App.test.tsx` for Standard and Vim Insert, including exact IDs, children, attachments, links, focus/caret and Undo/Redo. `e2e/electron/editing.spec.ts` retains native beginning/middle/end and repeated Enter, plus linked contenteditable-to-textarea focus transfer. `e2e/electron/navigation.spec.ts` retains entering a node, creating its first child, leaving it and entering through the circular indicator. The integration tests own subtree variants; the retained Electron tests own native input and navigation behavior.

Completion coverage is layered: `src/domain/natural-date.test.ts` and `emoji-completion.test.ts` own expression and shortcode tables; `src/renderer/completion-sources.test.ts` owns the adaptation of recognizer matches to shared suggestions; `completion-controller.test.ts` owns popup selection and dismissal rules; `use-node-input-bindings.test.tsx` exercises the input hook with a real store, including selection retention, reset and acceptance. The Electron completion specs retain representative real-keyboard and pointer flows, textarea and rich editors, Tree and Agenda, both editing modes, focus/caret/Undo, paste, hyperlink exclusion and popup geometry. Add recognition variants to the focused tables rather than repeating each expression across every Electron editor and mode. Keep a real-renderer case when it exercises a distinct input path or rendered state. Emoji's small-window scrolling, plain-editor suffix/restored-text and rich-editor Unicode interactions remain separate boundary checks.

Electron end-to-end tests live in `e2e/electron/` and run with:

```bash
npm run test:e2e
```

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. Hidden runs execute spec files in parallel across six workers locally or four in CI, and selected long-running suites distribute their independent tests across those same workers; visible runs stay serial. Parallel execution is safe because each worker cleans only its own `tree-e2e-p<pid>-` applications, the machine-global `Cmd+0` shortcut is stubbed for every launch except the serial `e2e/electron/shortcut.spec.ts`, and the shared system clipboard is serialized through a cross-process lock. The execution model and its rationale are recorded in `docs/decisions/0012-parallel-e2e-execution.md`. Use Playwright's `--workers` option when a local or CI environment needs a different concurrency limit. The suite is macOS-only, requires a display, and must not run as two concurrent Playwright invocations.

Application windows are created hidden by default so the suite does not steal desktop focus. The test-owned entry `e2e/electron/electron-entry.cjs` applies hidden mode through `e2e/electron/hidden-windows.cjs` before the application bundle loads, and every launch asserts the selected window mode, so an Electron or Node upgrade that invalidates the override fails on the first launch instead of silently showing windows. Run with visible windows when observing the real UI, for example during product verification:

```bash
TREE_E2E_VISIBLE=1 npm run test:e2e
```

To observe a single spec, run `TREE_E2E_VISIBLE=1 npm run test:e2e -- <spec>` (this rebuilds the application first) or `TREE_E2E_VISIBLE=1 npx playwright test <spec>` (this uses the current `out/` build).

Hidden runs of `navigation.spec.ts` and eligible `tab-structure.spec.ts` cases adopt one shared application per worker through same-window reload. Navigation retains its transient native/renderer state poison regression before the next navigation case. Tab cases with nested seeds retain fresh applications; root-level collapsed seeds, native status-bar traversal and the root image-caret case are eligible. Both editing modes and all existing cases remain covered. Use `npm run test:e2e:diagnose -- --shared-reset=fresh <specs>` for matched fresh-process controls, or `--shared-reset=reload` for adopted execution. The diagnostic wrapper sets `TREE_E2E_SHARED_RESET` internally so Codex can reuse the named workflow's approval. The reset disposes the renderer, drains existing IPC work and removes document/preference data between tests, then reloads the same window. Every shared launch checks its seed, focus, editing mode and empty history before proceeding. Lifecycle, persistence, appearance, shortcut and custom launch-option tests retain fresh processes. Chromium session state and main-process caches remain shared, so this is bounded reuse rather than fresh-process isolation. The bounded rollout measurements below cover navigation, Tab structure and the eligible Vim text and navigation/selection cases.

ADR 0021 defines the adoption contract. The fixture exposes `sharedApplicationAdopted()` for reviewed eligible owners: hidden execution selects same-window reload, while visible runs and `TREE_E2E_SHARED_RESET=off` select fresh processes. The global fixture default remains fresh; adoption does not make neighboring specs eligible. All process-owned metadata is invalidated on disposal or process loss, including transitions to fresh cases. Reset failures and load errors dispose the process before data removal; inability to prove exit leaves data intact. Blank-renderer navigation and original-handler IPC draining have deadlines, native move/resize observation drains a surviving bounds debounce even after a move back to the initial bounds, and worker shutdown is bounded.

Eligible hidden `vim-text-editing.spec.ts` groups also adopt reload. The two bodies seeded inside a nested location and the two light/dark screenshot bodies that install Playwright media emulation retain fresh processes. Media emulation survives renderer navigation and is outside the reset contract; renderer-owned paste/cut listeners are discarded. Unnamed groups preserve existing test titles and conformance references. Ordered Visual/Replace poison and successor cases verify clean focus, caret, history and registers with locked clipboard rewriting. The same diagnostic fresh/reload controls and visible fallback apply.

Eligible hidden `vim-navigation-and-visual.spec.ts` groups adopt reload for 54 existing cases. Sixteen nested/expanded-seed cases, eight media-emulation cases and the initial Normal-mode startup assertion retain fresh processes. The deliberate Normal-selection case also installs a page clock through the pointer-drag helper. Unnamed groups preserve existing titles, order and conformance references. Ordered character and whole-node Visual poison/successor cases exercise saved selections, text/node registers, repeat and undo history, clipboard rewriting and focused Normal caret restoration. The same fresh/reload diagnostics and visible fallback apply; this adoption does not extend the reset contract.

Run `npm run test:e2e -- e2e/electron/shared-application.spec.ts --workers=1` for reset/recovery regressions. The infrastructure cases deliberately exercise hidden reuse and test-owned faults; they do not opt an editing spec into adoption. The separate memory tests sample twelve bursts of eight edits/resets or matched fresh launches, treating the first burst as warm-up. They attach raw/GC-retained renderer heap, native process working sets, main-process heap, window/renderer counts, listener counts and pending/error IPC counts. For a longer investigation, use `npm run test:e2e:diagnose -- --memory-burst-size=32 --config=playwright.memory.config.ts --workers=1`. This changes measurement scope, not a memory budget. Measurements are finite-run evidence; Chromium session caches, native allocation and main-process state survive reload, so heap stability alone does not prove native memory is bounded indefinitely.

The shared fault probes are declared only for hidden runs. Visible runs of this infrastructure spec exercise the selector and its two real fresh launches, preserving the complete visible suite's fresh-process contract. Use `npm run test:e2e:visible -- e2e/electron/shared-application.spec.ts --workers=1` to verify that fallback, and `npm run test:e2e:diagnose -- --shared-reset=fresh e2e/electron/shared-application.spec.ts --grep 'adopted selector' --workers=1` for its hidden fresh control. These exclusions concern the hidden-only infrastructure probes; no product editing case or mode is removed.

For Codex, Claude Code, and OpenCode, prefer `npm run test:e2e:visible -- <spec> --workers=1` for visible runs and `npm run test:perf:profile -- perf/electron/agenda-scale.spec.ts --grep deep-100000-dense` for Agenda CPU profiling. Both rebuild first and forward the supplied Playwright arguments. The environment assignments live inside the npm scripts so the outer commands match reusable approval prefixes. Use `npm run test:e2e -- <spec>` and `npm run test:perf -- <spec>` for ordinary runs. Avoid prepending environment assignments or wrapping these commands in an explicit shell invocation when reusing approvals.

Use `npm run test:e2e:timing` to rebuild and measure the complete hidden E2E suite. It writes the Playwright JSON report to `test-results/e2e-timing.json` and prints wall time, summed test time, duration buckets, per-file and editing-mode totals, the slowest tests, launch counts, launch phases, and fixture teardown time. Wall time covers Playwright execution, excluding the build and report summary; test totals include retry attempts. Each `launchTree` call records cleanup, Electron launch, first-window retrieval, and post-launch assertion durations as test annotations. The summary checks that these phases account for total launch time within 10%. Preserve the JSON report outside `test-results/` before another run when comparing measurements, and run timing and other Playwright invocations sequentially.

The ordinary E2E configuration excludes only `e2e/electron/shared-application-memory.spec.ts`. All reset/recovery tests remain in `e2e/electron/shared-application.spec.ts`. Run both long measurements with `npm run test:e2e -- --config=playwright.memory.config.ts`; preview the two sets with `npm run test:e2e -- --list` and `npm run test:e2e -- --config=playwright.memory.config.ts --list`. The memory configuration inherits the ordinary worker, isolation, cleanup and retry settings but replaces its projects with one memory-only project. It requires hidden execution and retains twelve eight-cycle bursts per control, existing resource assertions, annotations and JSON attachments. `TREE_E2E_MEMORY_BURST_SIZE` remains available for longer investigations.

The `Electron E2E memory` workflow owns these measurements on macOS: weekly on Sunday at 04:00 UTC and on manual dispatch. It does not run on pull requests or pushes and does not gate browser publication. It uploads the JSON report, both sample attachments and failure traces. Ordinary CI shards and `npm run check:full` use the regression configuration; they do not run the long memory controls. For related infrastructure changes, run the memory command locally as well as the required validation tier. These measurements remain required before broader reuse adoption under ADR 0021.

The memory separation on 2026-10-15 preserved the original combined coverage as disjoint sets of 785 ordinary and two memory cases, including all 16 ordinary shared-application infrastructure cases. Both memory controls passed with their sample attachments; the shared and fresh controls took 32.12 s and 74.55 s. One sequential same-host hidden six-worker comparison passed the original 787 cases in 219.31 s and the 785 ordinary cases in 195.45 s, excluding builds of 0.61 s and 0.70 s. Ordinary launches fell from 802 to 705. The 23.86 s / 10.9% wall-time reduction is one local comparison with host variance; separate scheduling moves the memory work rather than eliminating it. This result is separate from the reuse rollout measured below.

For a matched full-suite timing pair, run `npm run test:e2e:diagnose -- --shared-reset=reload --json-output=.scratch/<task>/adopted.json --workers=6 --reporter=dot,json`, then `npm run test:e2e:diagnose -- --shared-reset=fresh --json-output=.scratch/<task>/fresh.json --workers=6 --reporter=dot,json`. Use distinct report names for subsequent pairs, keeping runtime inputs, host and worker count unchanged. `node scripts/e2e-timing.mts <report>` summarizes either report. It reports launches but does not summarize `tree-reset-timing` or `tree-memory-evidence`; inspect those JSON annotations separately. Reset timing counts attempted reused launches, including intentionally rejected attempts, rather than successful resets. Fresh regression controls still contain deliberate shared reset/recovery probes. Run the shared/fresh memory controls separately with `npm run test:e2e -- --config=playwright.memory.config.ts`.

The bounded rollout closed on 2026-10-11 with two sequential matched full-suite pairs on the local macOS GUI host, hidden windows and six workers, using runtime inputs from commit `3dff3bf`. Every run passed the same 773 cases without skips, flakes, runner errors or unexpected reset/lifecycle failures. No cases, editing categories or boundary exclusions changed.

| Execution | Launches | Reuse attempts | Summed test time | Wall time |
| --- | --- | --- | --- | --- |
| Adopted 1 | 788 | 236 | 1253.35 s | 254.01 s |
| Fresh 1 | 913 | 111 | 1427.70 s | 280.51 s |
| Adopted 2 | 788 | 236 | 1313.00 s | 257.30 s |
| Fresh 2 | 913 | 111 | 1432.38 s | 280.37 s |

Observed wall reductions were 9.4% and 8.2%; adopted wall spread was 3.29 s and fresh spread 0.15 s. These are two local pairs, not a portable saving or a duration budget. Adopted editing cases contributed 124 reuse attempts per run; infrastructure contributed 112 adopted or 111 fresh. Each run deliberately rejected three reused launch attempts and three direct reset calls, and recovered from an owned-process exit. Direct reset calls are not timing annotations. Whole-suite counts include 96 launches in the fresh memory probe, so they do not measure editing cases alone.

Each full run also sampled twelve eight-cycle shared and matched fresh memory bursts, excluding the first burst from the following ranges. Across all four runs, GC-retained renderer heap was 4.556–4.615 MiB shared versus 4.485–4.592 MiB fresh. Shared main heap rose and reclaimed within 4.523–7.937 MiB; Browser working sets were 155.594–173.781 MiB shared versus 159.500–162.453 MiB fresh. Shared renderer working sets remained higher at 146.625–164.531 MiB versus 121.688–123.547 MiB fresh. GPU working sets varied at 73.844–93.641 MiB shared versus 89.594–94.438 MiB fresh. Window/renderer counts stayed at one, pending/error IPC counts at zero, and recorded listener counts stayed constant within each mode. The earlier 384-cycle investigation also observed main-heap/Browser reclamation and higher shared renderer/GPU working sets. These observations support the current bounded adoption; they do not establish indefinite native-memory bounds or authorize wider eligibility.

Codex's project rules in `.codex/rules/tests.rules` allow these named Electron workflows, plus `npm run test:e2e:changed` and `npm run test:e2e:diagnose`, outside the sandbox, including their spec paths and flags. They load at startup when the project's `.codex/` configuration layer is trusted; restart Codex after adding or changing rules. More restrictive user or administrator rules still take precedence. These allowances authorize the complete npm scripts outside the sandbox, including their builds; review script changes with that permission in mind.

The diagnostic workflow runs the existing build and E2E command with three optional settings: `--shared-reset=fresh|reload|window`, `--memory-burst-size=<positive integer>`, and `--json-output=<path>`. Use the `=VALUE` form. Other arguments are forwarded unchanged to Playwright without shell interpretation. Omitted settings retain the inherited environment; `fresh` explicitly sets `TREE_E2E_SHARED_RESET=off`, overriding inherited reuse for both prototype and adopted owners. For a JSON report, also select a JSON reporter, for example `npm run test:e2e:diagnose -- --shared-reset=fresh --json-output=.scratch/e2e-comparison/tree-fresh.json e2e/electron/navigation.spec.ts --repeat-each=5 --workers=6 --reporter=dot,json`. A report in `.scratch/` survives the next Playwright run's `test-results/` cleanup and remains inside the repository's file-access boundary. This workflow supports the named diagnostic variables only, not arbitrary environment assignments or commands.

For process inspection in all three tools, run `ps -axo pid=,ppid=,command=` by itself and inspect the returned text for the task's processes. Codex allows it through `.codex/rules/processes.rules`; Claude Code explicitly allows it and excludes it from the Bash sandbox in `.claude/settings.json`; OpenCode's `develop` role permits process inspection in `opencode.json`. Piping it into `rg` introduces a separate command requiring its own allowance. Verify task ownership before using the existing termination rules. Rules saved using Codex's terminal persistent-approval option belong to the user's Codex configuration; shared project allowances belong in the tracked `.codex/rules/` files. Check a Codex rule without executing the target command using `codex execpolicy check --rules .codex/rules/tests.rules npm run test:e2e:diagnose -- --shared-reset=reload --workers=6`.

The diagnostic and changed-spec workflows are shared entry points for Codex, Claude Code, and OpenCode. Claude Code's existing `npm run test:e2e*` allowance and sandbox exclusion cover both; OpenCode's `develop` role explicitly allows both script names and their arguments. Configuration checks do not establish that a live tool has loaded these settings. In a fresh session of each tool, run `npm run test:e2e:changed -- --list`, a focused `npm run test:e2e:diagnose` invocation with JSON output, and the standalone process-inspection command. Record whether each ran without a prompt separately from its exit status. Do not save new personal approvals during this check or substitute another command after a denial. A successful check in one tool is not evidence for either of the others.

Hidden mode still requires a macOS GUI session; it does not make the suite headless.

Clipboard helpers acquire the machine-global clipboard lock automatically. Native Copy/Cut/Paste and context-menu interactions must acquire it explicitly through `lockSystemClipboard()` when no preceding helper already holds it. Acquire immediately before clipboard work, and release through `unlockSystemClipboard()` once assertions establish that all asynchronous clipboard reads/writes are finished and no subsequent interaction needs the contents. A completed paste or a pending attachment write that has already received the image bytes no longer needs the clipboard lock during persistence, quit-failure waits, screenshots, or restart checks. Reacquire and rewrite before a later independent paste; keep Copy/Cut-to-Paste sequences and clipboard assertions under one uninterrupted lock. Fixture teardown remains the release fallback. Full-suite diagnostics on 2026-10-11 found two quit-failure tests holding the lock for over five seconds each and other tests waiting up to seven seconds.

Agenda scenarios call `setAgendaToday(window)` after launch and before opening Agenda. The helper fixes the renderer's `Date` to the synthetic calendar date used by the Agenda specification. It also installs the Playwright page clock, whose timers and animation frames keep running in real time until a test fast-forwards them.

A test that asserts a change persisted by the idle save of `docs/PRODUCT.md` §16.1 does not wait for the real idle interval. It calls `fireIdleSave(window)` and then polls the persisted file with `idleSavePoll`. `fireIdleSave` fast-forwards the Playwright page clock by `SAVE_IDLE_MILLISECONDS`; the first `window.clock` call in the test, such as `setAgendaToday`, replaces the page timers and must precede the edit that arms the idle timer. `idleSavePoll` times out at half the interval, so a test whose timer was armed before the clock was installed fails instead of silently waiting. Tests that measure save timing itself, such as save-failure retries and quit flushing, keep real time. Before this rule, idle-save waits took about half of the E2E suite's summed test time (measured 2026-10-11).

Undo inactivity tests install the renderer clock before typing and advance it across the session boundary, retaining real keyboard edits and undo assertions. The queued-save `Cmd+Q` test uses a short edit that triggers a volume save and gates the registered save handler through `__treeIpc`. It observes the quit request while the save is pending, then releases the original handler and checks the persisted text after exit. This avoids long typing races while preserving the real shortcut, IPC and filesystem path.

Notes export and import tests (`e2e/electron/notes-archive-boundary.spec.ts`) stub the native save and open panels and `shell.showItemInFolder` through `app.evaluate`, because Playwright cannot drive `NSSavePanel` or `NSOpenPanel`. To cancel or quit at a known point, the test-owned entry wraps `worker_threads.Worker`: message types listed in `globalThis.__treeArchiveWorkers.hold` are queued instead of delivered, so the worker's finished file or staging directory exists while the main process has not used it yet. The production worker, controller and file system stay unchanged.

Selected quit-failure cases use `captureQuitTimer` from `e2e/electron/quit-timer.ts` after arranging the save failure. The helper captures the timer during the real synchronous IPC request or native `before-quit` event, restores the normal timer function, and returns an explicit expiry operation. Tests observe the failure before expiring the original callback, then retain their error, recovery and persisted-data assertions. The duplicate-request case keeps its real delayed save and quit timeout. This helper controls one timeout; it does not advance the main-process clock or shorten production delays.

An assertion that an action leaves persisted state unchanged must also let an idle save become due. Install the page clock before the action, call `fireIdleSave(window)`, and await a renderer `treeApi.load()` read before comparing persisted snapshots. The read queues behind disk writes in the main process, so the comparison cannot pass just because an unintended save has not finished. Polling for equality alone can pass immediately against the old snapshot. Prove these assertions detect unintended edits with a temporary test-owned mutation, then restore it.

Date-completion scenarios use the same clock in Tree and Agenda. `e2e/electron/agenda-completion.spec.ts` checks both editing modes, popup geometry, explicit keyboard and mouse acceptance, suffix preservation, history, uncertain fragments and paste suppression. Composition is verified with renderer-level event contract sequences. When completion shortcuts change, also check `Ctrl+N`, `Ctrl+P`, Tab and Escape through a native macOS keyboard in a visible isolated synthetic profile; Playwright key events alone do not establish native routing.

Drag tests start a gesture through `startRowDrag` in `e2e/electron/fixtures.ts`. A visible run happens on a live desktop, so that helper verifies the active drag survives a short settling window and retries the gesture a bounded number of times, since a window that loses focus releases pointer capture and the application cancels the drag by design. The hidden default removes desktop focus changes from the gesture, and the bounded retries remain for visible runs.

Breadcrumb drag coverage in `e2e/electron/drag-and-drop-hierarchy.spec.ts` checks toolbar destinations, focus/mode transitions, and both visible and hidden restored move sites after undo. Native pointer capture can also fail without a lost-capture event; renderer tests exercise outside-list move, release, invalid-target, and cancellation events through the same gesture handlers, so toolbar coverage does not assume capture succeeded.

Window addressing in `e2e/electron/fixtures.ts` is focus-independent for the same reason: closing, resizing, or reading the main window through `closeMainWindow`, `setMainWindowBounds`, and `readMainWindowBounds` addresses the application's window directly instead of relying on the application being frontmost, so the window-close flush and quit path stays testable while the application is inactive.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**` and the `test-results/**` scratch directory where finished diagnostic specs are parked. Each Playwright target reads only its own directory under `e2e/`.

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

Build the affected-path inventory before editing code. Start from the state being changed (selected node, text cursor, saved image-entry position, image-caret indicator, selection, or mode) and trace every relevant writer and caller, not only the command that exposed the defect. Include keyboard commands, counted and repeated commands, pointer/focus changes, node entry and exit, edits, undo/redo, and mode changes when they can affect that state. For each buffered or transient editing session (including Replace mode), explicitly inventory what happens when each relevant command arrives before the session's ordinary finish event: whether the edit is committed or discarded, whether the command acts before or after that resolution, and the resulting selection, cursor, active caret, and mode. Do not assume shortcut handlers follow the same path as ordinary mode-specific key handling. Include transitions where the selected node ID stays the same or a motion clamps at a boundary. For each affected path, record the starting state, action, expected selected node, text cursor, active caret, restored position when applicable, and mode. Map it to focused coverage and the representative Electron coverage of its distinct integration or rendering path; several rule variants may share that Electron case. Explain any inapplicable path. Update the inventory when a newly discovered path changes the affected state; avoid expanding it to unrelated commands.

The current Vim requirement-to-test inventory is in [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md), which also defines the divergence marker and what a row without it claims. The implementation review must check each affected row against both the behavior and its marker.

The invariant for an attached image is explicit: the image is a separate character; entering it records the originating text caret; leaving it either restores that recorded caret or, when crossing to another node, applies the documented destination position. Every entry path and every exit path must have focused unit coverage and end-to-end coverage for the representative process boundary. Tests must include at least one non-final text position, a same-node round trip, a cross-node transition, and a repeated motion at the boundary.

A screenshot or a single happy-path test is not sufficient evidence for navigation or caret work. The implementation review must trace each affected state-changing path in the code, compare its resulting state and tests against the inventory and matrix, and explicitly report any intentionally unsupported combination. When several defects involve the same state, review whether multiple owners or scattered resynchronization calls are causing omissions; record the conclusion and address a confirmed design cause within the authorized scope.

### Input-path consistency

`docs/PRODUCT.md` §20.7 requires the same result from every input path to a state. Before changing a command, control, overlay, or focus target, list every path that reaches it (pointer, each keyboard shortcut, Vim key, menu item, restored session). Use focused tests for rule variants and command mappings. Give each distinct dispatch, native/DOM interaction or rendering path representative E2E assertions on the relevant resulting appearance, focus, caret and selection. Paths may share a representative E2E when they use the same handler and have the same relevant native/DOM behavior; verify that equivalence from the implementation and focused tests. A different handler or native behavior needs its own boundary evidence. Compare paths in one test where the state allows it; do not repeat the entire data/state matrix through each path. Two causes recur and deserve a direct check:

* Browser heuristics tied to the last input device. `:focus-visible` on an element focused by script shows its ring after a keyboard action and hides it after a mouse action. Style a programmatically focused control with `:focus`, and keep `:focus-visible` for controls the user focuses directly.
* A handler wired to one event type. A pointer handler that sets focus or state before it calls the shared command, and a keyboard handler that does not, produce different results from one command.

Playwright's default light color-scheme emulation and its synthetic pointer events can hide or fake such differences, so the assertion reads computed style or state after each real input path, as `e2e/electron/preview.spec.ts` does for the image preview close button.

### Vim end-to-end coverage

Keep Vim coverage layered. Caret arithmetic and clamps, counts, image return positions, session commit ordering, mode transitions, and dot-repeat bookkeeping belong in the focused suites (`src/renderer/vim-*.test.ts`, `vim-*.property.test.ts`, `editor-input-handlers.test.ts`, `use-node-input-bindings.test.tsx`). Handler-level fixtures paint the resolved caret themselves, so they cannot detect a competing or omitted projection in the production hook; `use-node-input-bindings.property.test.tsx` runs generated sequences through `useNodeInputBindings` with a real `EditorStore`, flushes deferred focus work at arbitrary points, and checks the DOM caret, image indicator, and an `Enter` preview probe against the independent model in `src/renderer/test/vim-sequence-model.ts`. Its fixture supplies only the rendered text and the image class, so it does not replace the Electron specs for native focus, pointer timing, real rendering, or contenteditable. Keep a case in the Vim end-to-end specs (`e2e/electron/vim-image-caret.spec.ts`, `e2e/electron/vim-text-editing.spec.ts`, or `e2e/electron/vim-navigation-and-visual.spec.ts`) when it proves something those suites cannot: application shortcut dispatch, real keyboard, pointer, blur, or focus sequences, the real store or attachment rendering, or a committed light/dark screenshot baseline. Before removing a case, confirm that a focused test covers the same rule, that a retained case still exercises the boundary or the rendered state, and that it is not the last real-Electron coverage of a shortcut's dispatch path, a pointer, blur, or focus trigger, a pending-session commit, or an image-caret rendered state. Update [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md) in the same change: merge duplicate rows instead of leaving a row without real-Electron evidence. `npm run check:docs` verifies that every test name it cites still names an existing test. Snapshot baselines that only a removed case referenced become orphans; remove them when the session's file-operation permissions allow it, and otherwise list the exact paths for the handoff. A suite-composition change is a test and documentation change for §9 purposes; re-measure the focused E2E suite with the same command and environment as its recorded baseline.

Vim command sequences that need a shifted continuation key must be tested in physical key order. A real keyboard fires the modifier's own keydown before the key it modifies — `Shift` before `O` in `zO`, `$` in `d$`, `A` in `rA`, or `{` in `ys{` — and that keydown must not consume the pending command. A test that dispatches only the capital or shifted key event (for example Playwright's `press('O')` or a focused test that sends `key: 'O'` directly) does not exercise that order and can hide a defect that breaks physical typing. Use `pressShifted` from `e2e/electron/fixtures.ts` for real-boundary cases, and in focused tests send the bare modifier keydown explicitly between the prefix and its continuation.

The same event-sequence fidelity applies wherever handler behavior depends on platform-generated surrounding events, such as lock or dead keys, native composition, or key repeat. A helper or double that collapses a physical keypress into one synthetic event can stay green while real typing is broken, so model the event sequence the platform actually delivers whenever the handler observes more than the logical key. Native IME composition cannot be driven through Playwright, so composition handling is verified with unit-level contract sequences; do not claim real-IME end-to-end coverage.

### Editing-mode end-to-end coverage

[ADR 0021](decisions/0021-worker-owned-e2e-application-reuse.md) records the bounded shared-application isolation model. Adoption is complete for navigation and eligible Tab structure, Vim text-editing and Vim navigation/selection cases. The global fixture default remains fresh. Each additional opted-in owner must prove its reset contract, while fresh-process boundary coverage and both editing modes remain.

Standard editing is the first-run default and Vim editing is a permanent mode (`docs/PRODUCT.md` §20.2.1), so an E2E assertion whose behavior can differ between them must run in both. Choose mode coverage from the asserted behavior and its dispatch/rendering path. Typing or another mode-sensitive action used only to prepare a scenario does not by itself require repeating that scenario in both modes; its setup outcome must still be checked. Standard editing is Vim Insert without the Vim key handler, so the modes differ only at a few points: the startup mode and restored caret, `Escape` and undo grouping, pointer handling in an editor, rendering of the caret and selection, the status-bar layout, the image preview, and the application commands that Vim pre-resolves (`Cmd+A/C/X/V`, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, `Cmd+Z`, `Cmd+E`, `Cmd+Enter`, and the context-menu Cut and Paste).

`launchTree` writes the Vim preference from the Playwright option fixture `editingMode` (`'vim'` by default) unless the test passes `vimPreference` itself. `describeForEachEditingMode(title, body)` in `e2e/electron/fixtures.ts` runs a describe body once per mode, names each block `<title> [vim editing]` or `<title> [standard editing]`, and hands the body a `screenshotName` function that gives each mode its own baseline (`name-vim.png`, `name-standard.png`). Tests whose behavior exists only in Vim sit in a separate `Vim editing only` describe block of the same file, outside the helper.

Every `e2e/electron/*.spec.ts` file declares one category on its first line, as `// @editing-modes: <category>`, and `npm run check:e2e-modes` enforces it:

* `both` — tests with mode-dependent assertions run through `describeForEachEditingMode`. Independent cases may stay outside that describe helper in the same file and run once. The check fails a `both` file that never calls the helper, and any other file that does.
* `vim` — the behavior under test exists only in Vim editing.
* `independent` — the asserted behavior and the path being verified do not depend on an editing-mode difference. These tests run once, with Vim editing; checked setup may use ordinary editor input.
* `explicit` — every launch sets its own preference because the file tests the preference itself; only `e2e/electron/vim-toggle.spec.ts` uses it.

A new spec file picks its category when it is created. Choose `both` when it contains assertions affected by the mode differences above. Put only the relevant cases through the helper. For example, a test of persistence after restart can run once when typing only prepares checked data and the assertion concerns disk contents; a test of Vim-specific undo grouping or restored caret behavior still needs the applicable mode coverage. The category checker validates declarations and helper presence; it does not prove that a case is semantically independent, so review the selected scope against the implementation.

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
9. performance timing guards (`npm run test:performance`), in their own serial run so the parallel unit pool cannot inflate their measurements;
10. production build.

The documentation governance step validates ADR metadata and indexing, checks that relative links and ADR references in live documents (including active initiative plans) resolve, and rejects restated product quantities outside `docs/PRODUCT.md`.

It also scans Git-tracked and new nonignored Markdown for explicit scratch-file dependencies, including inline paths, Markdown links and reference definitions. Source copies without Git metadata are scanned recursively, excluding generated and scratch directories. Unfinished plans linked from `plans/README.md` and `WORKING_PLAN.md` may retain continuation evidence; a `Status: Completed`, `Closed`, `Done`, or `Retired` in the plan or its index row removes that exception. Directory paths ending in `/`, placeholders, fenced examples, and inline commands starting with a supported command name are allowed. This syntactic check complements the documentation and plan-closure review in `docs/AGENT_WORKFLOW.md` §11; it cannot determine whether prose states every lasting conclusion.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This runs `npm run check`, the end-to-end suite, the full Electron performance suite, and finally the dependency audit (`npm audit`), so an advisory without an available fix reports after the suites rather than hiding their results. It is an all-suites convenience command, not the default for every High Risk change. Use it when the full performance stage is required or explicitly requested; otherwise run the stages selected below. The normative validation policy is in `AGENTS.md` §10 and [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#10-validation).

### Chromium container tests

Use `npm run test:web:chromium` for the full built-browser suite in Linux arm64 Chromium. It copies current source into a disposable container and runs `test:web:built` there. It accepts no arguments, disables external networking, drops all capabilities, prohibits privilege escalation, and limits processes, memory, and CPUs. It mounts no host directories or Docker socket and publishes no ports. Build output, browser profiles, and failure artifacts remain inside the container and disappear after exit; test results stream to the terminal. This does not replace macOS Electron validation or Chrome-specific checks.

Browser tests run files across four workers locally and in CI, with tests inside each file remaining sequential. Each worker owns its browser and virtual clipboard; persistent profiles use test-specific output paths. The local container is limited to four CPUs, 4 GiB of memory, and 2048 processes/threads; the former 512-task limit exhausted Chromium's thread budget with four workers. OrbStack's global resource limits must allow those resources.

Docker must be running. The Product Owner prepares dependencies manually from the repository root:

```bash
make setup
```

This builds the dependency image using Docker's cache and needs network access. Agents must not execute this target, build or pull images, or install dependencies for this workflow. If the image is missing or stale, the test command stops and asks the owner to run `make setup`. The Makefile defaults to help, not a build. The former `chromium-image` and `chromium-image-rebuild` targets are replaced by `setup`.

Preparation uses `scripts/web/chromium.Dockerfile` and installs locked dependencies with lifecycle scripts disabled. The Dockerfile-specific ignore file limits the build context to the package manifests. The runner never builds or pulls an image. Its image tag depends on dependency-related package fields, the lockfile, the Dockerfile, its ignore file, and the separate build recipe in `scripts/web/chromium-image.mk`. The root Makefile includes that recipe; edits to its other commands or help do not change the image tag. Code, documentation, and npm-script edits alone reuse the image; dependency, lockfile, or recipe changes require owner preparation. The runner resolves the tag to a local immutable image ID before execution. Moving the build recipe out of the root Makefile changes the tag once, so an image prepared before this move requires `make setup`.

In Codex, use host execution (`sandbox_permissions: "require_escalated"`) from the first invocation. `.codex/rules/chromium.rules` approves only this named npm workflow, not general Docker access. As with the existing npm permissions, the rule trusts mutable repository scripts and matches command arguments, not the working directory. Review runner, package script, Dockerfile, and rule changes together. It is not a security boundary against an agent that changes those files. Trust the project configuration and restart Codex after rule changes; native rule matching alone does not prove the current session loaded the rule.

Linux arm64 Playwright Chromium 1243 stops the whole browser process with `SIGTRAP` when a new document reads a stored OPFS directory handle from IndexedDB; storing or using the handle within one document does not. The folder-backup picker stub returns OPFS handles, so `e2e/web/backup.spec.mts` marks its three reload cases `test.fixme` on Linux, where both this container and the CI `Run web E2E tests` job run, and keeps them on macOS Chrome. A Linux-only canary in the same spec expects the crash; when a Playwright update brings a fixed Chromium, the canary fails, and the marks and canary are removed together. Playwright reports such a browser exit only as `Target page, context or browser has been closed` with no exit status. To see the signal and stderr, launch the browser binary from a temporary spec with `--remote-debugging-port=0`, attach with `chromium.connectOverCDP`, and observe the child process.

The container's network restriction applies to test execution. It does not disable the coding agent's other network tools or revoke existing Docker permissions. Owner-only preparation is a workflow rule; enforcing it against an agent that can change the runner requires a separately protected launcher and host access controls.

### GitHub Actions

GitHub Actions runs `npm run check`, the dependency audit and built-browser Chromium tests on Linux for every pull request and push to `main`. The full macOS Electron test workflows run only weekly or manually: Electron E2E in six shards on Sunday at 02:00 UTC, performance at 03:00 UTC, and memory at 04:00 UTC. Each Electron shard is limited to 12 minutes. These full test workflows do not run on pull requests or pushes and do not gate browser publication. Demo capture runs on every push to `main` or manually. All test workflows and demo capture first require a successful Ubuntu `npm audit --audit-level=high` job. A failed audit skips dependent tests before macOS runners are allocated. The main release also gates its reusable Linux check workflows on the release audit; each reusable workflow retains its own audit for standalone entry points. Audit cancellation groups include the caller, pull request or branch, so concurrent checks cannot cancel each other's audits. After audit succeeds, tests run independently, and superseded standalone runs for the same pull request or branch are canceled. Failed E2E and performance runs upload their available reports and result artifacts. Mutation testing runs on a weekly or manual Ubuntu workflow, separate from pull-request validation because of its run time (§12).

#### Cross-platform smoke checks

`Run smoke tests` runs on every pull request and push to `main`, and supports manual execution. After its dependency audit, two jobs share setup within each operating system: Linux checks Electron under Xvfb and Chromium; macOS checks Electron and real Safari through SafariDriver. Each platform has its own smoke invocation. A failed Electron smoke does not skip the browser smoke when the browser build succeeded. New commits cancel superseded runs. These checks supplement the existing suites and do not replace release validation.

The shared happy path opens the production build with isolated synthetic data, types a parent, creates a sibling with Enter, indents it with Tab, types its text, and verifies the persisted parent/child relationship through the real platform adapter. Browser checks reload the page; Electron quits normally and starts a new process with the same isolated profile, requiring a clean exit rather than forced termination. Each target checks the restored text and hierarchy, enables Vim through its menu, enters Insert with `i`, types a prefix, and returns to Normal with Escape, asserting both the text and mode transitions. Vim `/` search must then move from the child to its parent in Tree. The check opens Agenda through its menu, verifies the child dated with today's local canonical date and its contextual parent, searches from the day header to the child, and returns to Tree with its original selection. Both searches assert a unique match count, confirmed current highlight and destination focus. The child text crosses the normal word-volume save threshold after indentation; the checks do not wait for the idle timer or mock persistence. Electron uses the existing test entry for hidden windows and a stubbed global shortcut; its production main, preload, renderer and file storage still run. Browser checks use fresh contexts/origins. Safari uses an isolated automation session and native WebDriver input, not Playwright WebKit.

Build first with `npm run build` (Electron) or `npm run build:web` (browser), then run `npm run test:smoke:electron`, `npm run test:smoke:chromium`, or `npm run test:smoke:safari`. The Chromium command uses Chrome on macOS for local diagnosis and Playwright Chromium on Linux. The Safari command takes no arguments. On a local Mac, Safari Remote Automation must already be enabled by the owner; CI enables it only on its disposable runner. Linux Electron requires a display (CI supplies Xvfb), and disables Chromium's sandbox only in Linux CI.

Each smoke invocation has a 20-second budget including application/browser startup and successful cleanup. Playwright has a 15-second test timeout and a 20-second global timeout; Safari aborts operations at 20 seconds and also checks total elapsed time after cleanup. Failure cleanup is bounded and may extend beyond the successful-run budget. Dependency installation, builds, runner allocation and the prerequisite audit are outside this budget; the entire CI job therefore takes longer. There are no retries, screenshot comparisons/captures, traces, videos or performance checks in the smoke commands.

The `Enforce agent attribution policy` workflow runs `scripts/check-attribution.mts` on every pull request. It fails the check when the pull request description or any of its commits carries an agent co-authorship or "generated with/by" line, per `AGENTS.md` §12. This is the server-side backstop described in §3; it holds regardless of whether the author's machine had the `commit-msg` hook installed.

Release checks are isolated from standalone manual and scheduled check cancellation;
the concurrency rules are described in [Browser publication](../deployment/github-pages/README.md#failures-and-ordering).

#### Workflow and job naming policy

Name GitHub Actions workflows by the work they perform, using an imperative verb
and its object in English sentence case. Use the same principle for job display
names. A reader should understand the purpose without opening the YAML.

* Use direct actions such as `Release web app`, `Audit dependencies`, and
  `Publish demo`. Use `Run` with established test names, including
  `Run mutation testing` and `Run property tests`; preserve those terms rather
  than inventing synonyms for grammatical uniformity.
* Distinguish a release pipeline from its individual suites. `Release web app`
  calls code validation and web E2E testing before signing and transferring the
  tested package. It does not represent another web test suite. PR validation
  and release validation reuse the same suites for their respective commits.
  Deployment in the hosting repository is a separate workflow.
* Keep names concise. Do not add category prefixes, local jargon such as
  `property soak`, or execution settings merely to describe implementation.
  Increased property-test counts and memory-report thresholds belong in suite
  documentation. Use `memory tests` for the memory suite; that name does not
  promise an automated memory-growth threshold.
* Add a platform, browser, tool, or build-mode qualifier when it distinguishes
  the work. Use the actual implementation: the Linux web job uses Chromium,
  not Google Chrome. Put execution-specific detail in job names and descriptions
  when the workflow's broader purpose is already clear.
* Derive YAML filenames from the workflow display name: lowercase, remove
  punctuation, replace spaces with hyphens, and append `.yml`. Keep the same
  words and order; do not introduce a second vocabulary of abbreviations.

Source filenames below are relative to `.github/workflows/`. The hosting
workflow is maintained as `deployment/github-pages/deploy-web-app.yml` and
installed separately in the hosting repository.

| Workflow name | Filename |
| --- | --- |
| Release web app | `release-web-app.yml` |
| Check code, test and build | `check-code-test-and-build.yml` |
| Run web E2E tests | `run-web-e2e-tests.yml` |
| Run Electron E2E tests | `run-electron-e2e-tests.yml` |
| Run Electron memory tests | `run-electron-memory-tests.yml` |
| Run Electron performance tests | `run-electron-performance-tests.yml` |
| Run mutation testing | `run-mutation-testing.yml` |
| Run property tests | `run-property-tests.yml` |
| Audit dependencies | `audit-dependencies.yml` |
| Scan code with CodeQL | `scan-code-with-codeql.yml` |
| Enforce agent attribution policy | `enforce-agent-attribution-policy.yml` |
| Publish demo | `publish-demo.yml` |
| Deploy web app (hosting repository) | `deploy-web-app.yml` |

Give every job an explicit display name. Name reusable-workflow calling jobs by
the work they invoke, and execution jobs by the stage they perform. For example,
`Run web E2E tests / Test production build (Chromium)` explains both the suite
and the execution stage. Avoid generic names such as `Check`, `generate`, or
`chrome`, and avoid repeating the entire workflow name at every nesting level.
Matrix jobs include the distinguishing shard or layer, such as
`Run Electron E2E tests (shard 1/6)` or `Run mutation testing (domain)`; aggregate
jobs state their role, such as `Require all Electron E2E shards to pass`.

Review the complete set of names together, including PR checks and nested
release jobs. Keep check names unambiguous across workflows; repeated audit
calls need caller context in their composed names. Technical job IDs may remain
stable when display names change. Playwright project names are test-report
identifiers, not workflow or job names.

When applying a rename, update reusable-workflow paths, scripts, tests, and
documentation that consume the old names or paths. Check required status-check
settings before changing their names. In particular, release verification
currently matches the job name `Approve web release` and references `release-web-app.yml`;
those are functional contracts, not cosmetic labels. A naming change must
preserve the release verification contract and existing triggers and dependencies.

### Risk-Based Validation

Use the highest applicable functional-validation tier. Select Electron performance scope separately under [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#selecting-performance-checks). Focused checks may be run during implementation, but they do not substitute for a broader required functional tier.

| Tier | Change risk | Required validation |
| --- | --- | --- |
| Minimal Risk | Documentation or content only, with no executable configuration change | Run `npm run format:check:changed` and `npm run check:docs`. Also run `npm run check:opencode` when agent workflow documentation changes. |
| Low Risk | Executable tooling or configuration, tests, or an isolated non-runtime refactor | Run affected type, lint, formatting, governance, and focused test checks. Run `npm run check` when executable source, dependency metadata, build configuration, or validation tooling changes. Agent-prompt documentation remains Minimal Risk unless executable configuration such as `opencode.json` changes. |
| Moderate Risk | Product, domain, or renderer behavior contained within one process, without a persistence or platform boundary | Run `npm run check`, affected unit or property tests, and focused E2E coverage for every affected user-visible requirement. Broaden E2E coverage when shared interaction or lifecycle infrastructure changes. Perform product verification of the changed flows. Select performance checks separately under procedure §10, preserving `docs/PRODUCT.md` §22. |
| High Risk | Process, IPC, filesystem, persistence, clipboard, attachment, native shortcut, startup, shutdown, security, dependency, toolchain, shared fixture, or scale-sensitive state changes | Run `npm run check`, the full local E2E suite (`npm run test:e2e`), and `npm run audit`; retain the unit, contract, real-boundary, and failure-path coverage required by `AGENTS.md` §9, applicable security checks, and visible verification for native behavior automation cannot inspect. Select performance checks separately under procedure §10. Use `npm run check:full` when the full Electron performance suite is also required. |

When categories overlap or the tier is uncertain, use the higher tier. A suite that cannot execute its real boundary is blocked, not passed.

For selected Electron performance scenarios, use `npm run test:perf -- <specs>` and optionally `--grep <pattern>`. Use `npm run test:perf -- --project=electron` for the full Electron performance suite; `npm run test:perf` also runs the browser scenarios of §12. The serial runner and measurement mechanics are described in §12. Record the selected scope and performance rationale with the functional-validation evidence; no Electron performance run is needed when there is no concrete performance trigger under procedure §10. `npm run check` continues to include the fast `test:performance` guards in every tier that requires that command.

### Local affected-spec E2E validation

For contained changes below High Risk, run affected E2E specs locally and leave the complete suite to the weekly/manual macOS CI shards. `npm run test:e2e:changed` builds the application and runs Playwright with `--only-changed=HEAD`; it includes staged, unstaged and untracked nonignored changes before commit, then follows test imports. Preview its selection with `npm run test:e2e:changed -- --list`. After committing, compare with the task's starting commit using `npm run test:e2e:changed -- --only-changed=<starting-commit>`; the referenced commit must exist locally. Additional spec arguments restrict the selected set rather than adding missing specs.

The selector does not infer test coverage through the Electron production build, preload/IPC or product-requirement mapping. For each affected behavior, explicitly select its owning specs with `npm run test:e2e -- <specs>` when they are absent from the changed selection. Record the actual specs/cases exercised. Playwright can exit successfully with no selected cases; this is a selection result, not a passing boundary test. Documentation-only tasks do not acquire an E2E requirement merely because this command exists.

Shared fixture or interaction infrastructure, startup/shutdown, process/IPC, filesystem/persistence, clipboard/attachments, native shortcuts, security, dependencies/toolchain and scale-sensitive changes still require full local functional validation under the High Risk row. Unbounded functional impact also requires broader coverage. Electron performance scope is selected separately. Weekly/manual CI continues to run every E2E spec in its existing shards; this command does not filter CI or the serial visible performance suite. Regressions outside the locally exercised scope may first appear in the next weekly or manual run.

For a contained change, use a concise conversation plan, a focused development loop, the tier's required validation, and a primary-agent diff review. Add a working plan, independent reviewer, or separate product verifier only under the triggers in `AGENTS.md` §§8 and 13. A user-visible change still needs product verification by the primary agent when no separate verifier is required. Keep defect-first regressions, boundary tests, and visual evidence whenever their specific triggers in `AGENTS.md` §9 apply.

Classify the complete change, not only its purpose. For example, a workflow-documentation change that also modifies a validation script or its tests is Low Risk because executable validation tooling changed.

`npm run format:check:changed` is the canonical scoped formatting check. It checks supported staged, unstaged, and non-ignored untracked files relative to `HEAD`, excludes deleted files, safely passes filenames without shell interpolation, and succeeds with an explicit message when there are no eligible files. The full-repository `npm run format:check` remains part of broader validation.

### README Screenshot Maintenance

The README gallery uses [the synthetic demo document](images/demo-document.json). It is a documentation resource, not a copy of a user's application data. Preserve its contents across captures; changes to the example itself should be deliberate and reviewed. The capture script launches the built Electron application with a newly created temporary profile and never opens the normal profile. It captures the overview and then enters the meetup branch in the same running application without editing the document or changing that branch's expanded state. In the dark appearance with Vim enabled, it captures the focused branch, a search for `book` with two highlighted matches, and the unfiltered command panel. It finally fixes only `Date` to Thursday 2026-10-08, opens the Agenda with `Cmd+P` in the light appearance, and captures it; the document's dated nodes (2026-10-08 through 2026-10-15) surround that fixed Today, so the Agenda shows the same node text as the Tree images.

The `Publish demo` workflow described below captures the images after recording the video and publishes them to GitHub Pages with it. The README shows the latest successful capture, automatically refreshed on every push to `main`; publication can lag while the workflow runs or if it fails. The images are not stored in Git. The script refuses to write any image when the focused branch's nodes differ from the overview or when the capture changed the document. Like the E2E fixture, it passes `-AppleShowScrollBars WhenScrolling` so CI runners without a trackpad draw overlay scrollbars.

Run `npm run screenshots:readme` on macOS to build and capture the images locally, for example after changing the capture script. It writes `tree-overview.png`, `tree-focus-dark.png`, `agenda-light.png`, `tree-search.png`, and `tree-commands.png` to ignored `reports/readme/`, replacing that directory only after every capture succeeds. Capture uses a verified device scale factor of 2 and lossless PNG output; README images keep their logical width of 860 pixels so high-density displays receive sharp text. Inspect all images, including matching node text and order, before relying on a script change. The command never stages or commits files.

The README maintenance rules are owned by `AGENTS.md` §11. This documentation gallery is separate from visual regression baselines: it is not a pixel acceptance test.

### Demo Video Generation

Run `npm run demo:video` on macOS to build the app, install Playwright's recording encoder, and record the predefined sequence in `scripts/record-demo.mts`. The script uses the committed synthetic screenshot document in a fresh temporary profile and opens a visible window so native keyboard input reaches the editor. The entire demo must use dark appearance, including window creation and closing, regardless of the machine's system appearance. Vim editing must remain enabled throughout the demo. The sequence opens Agenda from Root with `Cmd+P`, shows dated nodes from both the Work and neighborhood reading club branches, and returns to Tree. It then uses the keyboard for the Tree walkthrough: `zo` opens the root fold, `3j` selects the meetup branch, `zO` opens its nested folds, `gd` enters the branch, and `3j` selects the note. `A` appends in Insert mode and Escape returns to Normal mode. `0vw` demonstrates character Visual selection; `Vj` selects two sibling nodes; `>` and `<` move the selected nodes into and out of a parent; `u` and `Ctrl+r` demonstrate undo and redo of a move. No mouse clicks are used. Pauses are brief so the demo shows these actions within its duration budget. The original fixture and normal application profile are never edited.

`npm install` or `npm ci` installs Playwright. The command downloads Playwright's recording encoder when needed; no Homebrew installation or additional conversion encoder is required. Dependency installation and the first recording-encoder download require network access.

After inline editing, the demo opens search with `/`, types `book`, and shows two highlighted matches and their count. Escape cancels search. It then opens the command panel with `:`, shows the command list, types `show` to filter it to the Tree and Agenda commands, and cancels with Escape before continuing the editing walkthrough. Representative frames include `search.png`, `commands.png`, and `commands-filtered.png`.

After the move and undo/redo sequence, `gv` restores the two-node Visual selection and `d` cuts the selected discussion topics from the meetup's conversation outline. `Ctrl+o` returns to the overview, `zc` folds the meetup, `2j` selects “Ideas for later”, and `gd` enters that different branch. The destination is shown before `P` pastes the topics above its existing ideas. The capture verifies that the topics disappear from the source and appear together in the destination, with its existing children preserved.

Recording begins after the renderer and fonts are ready. Playwright's screencast captures at maximum frame quality, with a rendering scale of 1.5 and a 1500-by-1080 recording of the 1000-by-720 window. This improves source text clarity without enlarging the logical interface. The output remains a WebM video with standard playback controls.

The WebM video, representative PNG frames, and source metadata are written to ignored `reports/demo/`. Each run replaces that directory. Open `reports/demo/tree-demo.webm` in a compatible browser or video player to review playback and inspect the PNGs for text readability. This documentation demo does not replace visual regression tests. The video must be smaller than 3 MB (3,000,000 bytes) and shorter than 30 seconds. The script rejects empty recordings, missing or invalid WebM duration metadata, and recordings reaching either limit. The measured duration and file size are recorded in the output metadata.

The separate `Publish demo` workflow runs on every push to `main` and on manual dispatch. It also runs the README screenshot capture and assembles both outputs into ignored `reports/site/`. Successful runs upload that directory as a downloadable artifact with one-day retention. Runs on `main` also deploy it to GitHub Pages, keeping the README's video and image URLs stable without storing generated files in Git. A Pages deployment replaces the whole site, so any other published file must be added to this workflow's site directory rather than deployed by a separate workflow. Other branches produce downloadable artifacts only. A failed run deploys nothing, and Pages keeps the previous video and images.

### Screenshot Rendering Scale

The E2E fixture passes `--force-device-scale-factor=1` in Electron's launch arguments, before the test entry, and asserts `window.devicePixelRatio === 1` after launch. This makes screenshot rasterization independent of the attached display's backing scale. Keep GPU rendering and the existing Playwright comparison settings: CSS-sized output does not by itself fix the scale at which Chromium draws glyphs. The performance fixture retains the native display scale for presented-window measurements.

The fixture also passes `-AppleShowScrollBars WhenScrolling` after the test entry and asserts after launch that a scrolling element reserves no scrollbar width. macOS shows classic scrollbars when no trackpad is attached, as on GitHub Actions runners; a classic scrollbar narrows the scrolling area by 15 pixels and shifts the centered outline, so every screenshot of overflowing content differs from baselines captured with overlay scrollbars. The value is a user-defaults argument rather than a Chromium switch, and it must follow the entry, or Electron treats it as the application path.

The investigation on 2026-10-05 at `b47725a` reproduced a scale mismatch without changing application code or baselines: the three light strikethrough screenshots failed at startup scale 1 and passed at startup scale 2. Existing punctuation screenshots passed serial, parallel, and visible runs at scale 1. A screenshot stability regression failed when consecutive launches used startup scales 2 and 1, then passed after the canonical launch override. Setting the scale through `app.commandLine.appendSwitch` in the test entry or through a later CDP metrics override did not reproduce the launch-time scale change. Hidden versus visible windows produced identical diagnostic frames; GPU versus CPU rasterization changed edge pixels but did not resolve the failing strikethrough comparisons. These experiments establish display scale as a reproducible cause; they do not establish the trigger of the failures reported from the earlier session.

`e2e/electron/screenshot-stability.spec.ts` checks both editing modes and appearances, repeated exact PNG captures across conflicting startup scale arguments, the received Chromium switch, and the effective renderer scale. It also verifies that a one-pixel text translation changes the image. Run its serial and parallel repeat guards after changing rendering or launch infrastructure:

```bash
npx playwright test e2e/electron/screenshot-stability.spec.ts --repeat-each=5 --workers=1
npx playwright test e2e/electron/screenshot-stability.spec.ts --repeat-each=12 --workers=6
```

Also repeat an existing `toHaveScreenshot` test, such as `e2e/electron/typed-input.spec.ts --grep 'operator-like punctuation'`, under both worker counts. Do not regenerate baselines merely because a comparison failed: first verify the canonical scale and inspect actual, expected, and diff images. Regenerate only baselines that disagree with confirmed stable rendering, and inspect every changed baseline under the visual workflow below. The scale decision is recorded in [ADR 0019](decisions/0019-canonical-e2e-rendering-scale.md). These checks cover canonical screenshot rendering. Verify native Retina presentation through the regular application (`npm run dev`) on a Retina display during product verification.

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

The smallest representative state set is preferred. For focus, caret, selection, or mode styling, that set must include an equivalent focused and unfocused element, plus the transition between them when the state can persist across components. This includes neighboring or repeated components when styling could leak from the active one. When a product requirement specifies relative placement or alignment, add a real-renderer geometry assertion for that relationship where practical; a screenshot baseline alone can preserve an already-misaligned result. Do not create or inspect screenshot artifacts for non-rendering changes, and do not repeat an inspection while the rendered inputs and states remain unchanged. Automated DOM, CSS-class, computed-style, geometry, and screenshot tests complement one another: a passing non-image assertion does not establish visual correctness, and a screenshot baseline must be deliberately inspected when it is created or updated. Inspecting means answering one question for every text run in the image: does each character appear exactly as stored, in the stored order, without a joined, shifted, missing, or substituted glyph? Read the stored text from the test's own seed or typed input and compare it with the picture character by character; a baseline that merely looks plausible is not inspected. A baseline of text drawn by the bundled typeface is the case this question exists for: before the fix in `c085f1e`, committed baselines showed `https: //example` because the typeface joined `://` into a ligature, and the tests had accepted it. `e2e/electron/text-fidelity.spec.ts` compares risky character sequences with a character-by-character reference, and `e2e/electron/typed-input.spec.ts` types realistic lines key by key; add a string to the first when a new sequence draws oddly, and a line to the second when typing a new kind of text matters.

When the Product Owner reports a defect that the suites did not catch, name in the handoff the test level that should have caught it (domain, hook or component, real-renderer end to end, screenshot, performance, or manual native-keyboard check) and the reason it did not, and add the missing coverage at that level together with the fix. Keystroke dispatch through Playwright is not native macOS text input: input-method composition, system autocorrection, and key repeat are not exercised, so a change to input handling is also checked by hand in `npm run dev` with the real keyboard.

When inline rich text can wrap or fragment across lines, include deterministic synthetic content that wraps and inspect the affected line fragments and caret or selection boundary in the real renderer.

For changes to appearance, window creation, renderer loading or reloading, or closing, verify `docs/PRODUCT.md` §20.5 in both light and dark appearances. Run `TREE_E2E_VISIBLE=1 npx playwright test e2e/electron/window-appearance.spec.ts --workers=1` for the native background regression and inspect the affected lifecycle transitions with a visible Electron window. Include startup and closing when window lifecycle or appearance changes; include reload and system appearance switching when those paths are affected. Observe the transition itself, using a screen recording when needed to inspect brief flashes. A screenshot of the loaded editor, a computed CSS color, or a native background value at a checkpoint cannot establish that a transition is free of flashes. Record the observed transitions, appearance, command, and outcome as visual evidence, and identify any transition that could not be observed as unverified. Reuse still-valid evidence under the rules below; documentation-only changes do not require a new visual run.

Apply the evidence reuse and invalidation rules in [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#10-validation). For the commands here, `npm run check:full` subsumes the `npm run check`, E2E, and performance stages it contains; `npm run check` subsumes its listed stages. Documentation-only edits require documentation and formatting checks, plus OpenCode governance when agent workflow files change, as specified by the risk matrix.

If an aggregate command fails or is blocked after some stages pass, record the aggregate command's actual result; never relabel it as passed. Its completed successful stages remain reusable when their inputs are still valid. Run every failed, blocked, or not-run required stage separately on the same snapshot. The required tier is then satisfied by composed stage evidence, recorded as the aggregate attempt plus the supplemental commands. A later edit invalidates only the affected evidence under the rules above.

Pass the validation record to review roles. They consume still-valid results and run an automated check again only for an uncovered scenario, stale or incomplete evidence, or a finding that requires it. Read-only review does not invalidate evidence. After a fix, rerun affected checks and their dependencies; repeat complete validation only for a tier that requires it or after a substantial, architectural, high-risk, or materially scope-changing fix.

An E2E suite that cannot launch Electron or execute the relevant boundary is not a passing validation result. Report the exact environment failure and rerun the suite on supported macOS hardware with an available display before claiming full validation.

Security-sensitive changes must also verify the Electron boundary tests, including IPC validation, renderer navigation restrictions, attachment validation, and the production content security policy. Run `npm audit` when the network is available; a registry connectivity failure must be reported rather than treated as a clean audit result.

Shutdown and attachment changes should also verify that queued renderer saves are flushed before quit and that non-PNG or malformed image bytes are rejected at the main-process boundary.

The E2E and performance fixtures continuously observe the renderer's persistence and operation error messages. Any visible `.save-error` occurrence fails the test, including transient `Changes could not be saved:` and `Operation failed:` messages that disappear before the test completes. New persistence or autosave work must retain this guard and include a regression scenario for rapid edits or overlapping saves.

The fixtures register each launched Electron child process before waiting for readiness. Teardown requests the application shutdown handshake, waits on the child process exit event, then uses bounded SIGTERM/SIGKILL escalation and fails if the owned process remains alive. Per-test teardown runs in the isolated-data fixture rather than a module-level hook, because Playwright caches imported helper modules for a worker's lifetime and a module-level hook would apply only to the first test file; the save-error guard and the clipboard-lock release share that teardown. Save-status observation uses both a DOM mutation observer and a final collection, so transient document-save and attachment-cleanup errors are retained even if the status disappears before test teardown. Observations are released with their owning app, so restart tests never query stale Playwright pages during worker teardown.

The E2E and performance `launchTree` helpers write the Vim editing preference as enabled before launch, because most suites exercise Vim editing; an E2E test passes `vimPreference: false` for standard editing, or `'saved'` to keep what an earlier launch persisted or to observe the first-run default. With Vim enabled, the helpers start an Insert session for ordinary editing suites; Vim tests pass `initialMode: 'normal'` to verify the application's Normal-mode startup. The E2E `typeInto` helper also enters Insert mode when needed and restores a textarea's insertion position before typing. Tests that assert Normal-mode key handling press the keys directly instead of using that helper.

If Electron shows a macOS crash dialog or a full suite fails during application launch, first treat it as a process-lifecycle failure. The E2E fixtures clean up stale applications per worker through their own `tree-e2e-p<pid>-` marker, and `e2e/electron/global-setup.ts` removes leftovers from earlier runs before any worker starts. The performance fixtures clean up only stale Electron processes carrying their own temporary `tree-perf-*` user-data marker. Cleanup retries after launch failure and the launch error is included in the test failure. Do not use an unrestricted Electron process kill because it may terminate unrelated applications. After cleanup, rerun the isolated failing test and then the complete suite.

File-service diagnostics identify `load`, `save`, `writeAttachment`, `readAttachment`, `cleanupAttachments`, `replaceNotes`, and `snapshotDocuments` operations, their phase, and the paths involved. Failures are logged with the original error message.

---

## 10. Development Workflow

### Shared agent instructions

`AGENTS.md` is the compact workflow core and policy owner. Its action table requires relevant sections of [Agent Workflow Procedures](AGENT_WORKFLOW.md) before those actions; a link does not load a section automatically. The supplement retains the matching section numbers. This guide owns validation mechanics, while `docs/AGENT_ROLES.md` owns role contracts. Keep shared behavior in these sources rather than copying it into three tool adapters. `npm run check:docs` checks the core size (at most 24 KiB), routing links, and the supplement as a live document. These checks establish document structure, not model compliance or actual client loading.

### Task capability check

At bootstrap, apply the capability policy in `AGENTS.md` to the selected task. Identify the needed file inspection and editing tools, validation commands and environment, artifact inspection or native interaction tools, external evidence access, and any required independent roles. Omit capabilities the task does not use. `npm run doctor` checks development-environment prerequisites when relevant; it does not establish the agent's runtime permissions or ability to inspect a native interface.

For each needed capability, distinguish **configured** (declared by settings or exposed tools), **verified in this session** (a successful operation with the relevant scope), and **unavailable** (a missing tool or observed denial/failure). Record the operation or limitation in the conversation plan, or in `WORKING_PLAN.md` when one is required. Update the record when ordinary task operations provide new evidence. Do not repeat a successful check unless the relevant session, permissions, environment, or scope changes.

During initiative planning, inventory mandatory verification for every task before estimating owner involvement. Record automated checks, owner-required checks and unresolved capabilities separately. For each potential owner check, name the task, requirement, why available automation is insufficient, the concrete interaction and expected result, and its pre-commit or milestone timing. Count verification rounds separately from checks; group compatible checks only when their completion gates permit it. Publish confirmed counts and possible additional rounds before implementation approval. The primary performs any authorized bounded runtime preflight that the read-only planner cannot perform. Unknown capabilities remain unknown until checked; revise the estimate promptly when evidence changes it.

Use inspection and the first necessary operation as evidence rather than launching full suites or all roles merely to probe access. Confirm required role availability before implementation and its actual access on its first authorized invocation. An exposed editing tool is configured until an authorized edit succeeds; do not write disposable files just to test permissions. A successful command establishes access to that command and scope only. Automated Electron interaction, screenshot inspection, and manual native input are distinct capabilities.

When access is missing, use an already authorized supported alternative if it satisfies the same requirement. Follow the tool's approval mechanism when additional permission is necessary; never bypass a denial, broaden permissions, or weaken role restrictions to complete the check. Report the blocked requirement and supported next action early, and continue work that does not depend on it. The Product Owner should be asked only when their action or decision is needed under `AGENTS.md` §14.

The root `CLAUDE.md` imports `AGENTS.md` so Claude Code sessions load the same repository policy as Codex and OpenCode, including versions that do not load `AGENTS.md` directly. Keep the shared policy in `AGENTS.md`; the import is only a compatibility adapter.

OpenCode uses the project configuration in `opencode.json`. Start a task with the `develop` primary agent. The normative task lifecycle, approval rules, review requirements, completion criteria, and Git discipline are owned by `AGENTS.md`. The role prompts in `.opencode/agents/` define only the inputs and actions specific to each role. Use the matrix and evidence rules in §9 when executing that lifecycle.

For product discovery, ask the `develop` coordinator to delegate one bounded question to the read-only `product-researcher`. Supply the relevant entry from `docs/OPEN_QUESTIONS.md`, the Product Owner's statements and disagreements, available usage evidence, and the desired research scope. The researcher returns labeled evidence, counter-hypotheses, tradeoffs, and a proposed experiment to the coordinator; it does not edit the record or approve a direction. Open-question policy and the promotion boundary into product requirements are owned by `AGENTS.md`.

The `develop` agent's shell permissions are consent guardrails for host execution, not an operating-system sandbox. Routine repository and read-only process inspection, the named npm development and validation workflows, append-only Git work, and fixture-owned process cleanup run without approval. Unfamiliar commands require approval, while command categories that are destructive, publish externally, rewrite history, mutate dependencies, escalate privileges, or execute unrestricted interpreters are denied. Named npm workflows keep their ordinary arguments and attached output redirections inside the same approval boundary. Documented environment prefixes on the named workflows are inside the same boundary; ad-hoc diagnostic variables remain unfamiliar commands that require approval and must not be added to the policy. The permitted destructive file operations are deleting the temporary root implementation plan (`WORKING_PLAN.md`), retiring one tracked file with `npm run retire:file -- <repository-relative path>` (the script refuses untracked files, directories, symlinks, option-like names, and paths that escape the repository, and stages the deletion with Git), removing one finished task's scratch directory with `npm run retire:scratch -- <task>` (guards in §16), and moving temporary diagnostic specs and probe files (`e2e/electron/_*.spec.ts`, `perf/electron/_*`) into the gitignored `test-results/` scratch directory; copying artifacts within `test-results/` is also permitted. Rules use OpenCode's last-matching-rule semantics, so their order is security-sensitive. OpenCode resolves each command in a pipeline or chain separately and applies the strongest effect across the segments, so a chain runs without approval only when every segment is allowed. Keep the exact patterns in `opencode.json` rather than duplicating them here, and run `npm run check:opencode` after changing either the policy or the OpenCode version. That check covers workflows named in this document and all standalone `package.json` scripts; lifecycle hooks have explicit exemptions. It also rejects lookalike names for the browser, memory and Safari allowances. OpenCode loads its configuration at startup, so restart OpenCode before verifying a policy change.

Codex's tracked `.codex/rules/` files allow the named host workflows independently of saved personal approvals. `scripts/codex-permissions.test.mts` checks package-script coverage against literal repository declarations, with explicit exemptions for sandbox tooling and lifecycle hooks. The coverage test is not a Starlark evaluator: validate effective matching with `codex execpolicy check` when changing rules. Project rules load only from a trusted project configuration layer at startup; restart Codex before checking live prompt behavior. A native policy match establishes rule matching, not whether an existing session loaded the updated files.

Mutation testing uses the named `npm run test:mutation` host allowance, including ordinary Stryker arguments such as `--mutate` and `--concurrency`. It is not exempt sandbox tooling: the test runner needs local worker communication. Saved approvals for individual scratch probes remain separate from tracked project rules; they do not establish access to other probes.

Use `npm run test:safari` for the maintained real-Safari smoke checks on macOS. It builds the static package and checks typing, synthetic URL paste and reload persistence through SafariDriver. The command uses a fresh loopback origin and an isolated WebDriver session, leaves the system clipboard untouched, and closes its session, driver and server on completion or interruption. Its only optional argument is `-- --help`; it does not accept external scripts, origins or browser profiles. The screenshot is saved to `test-results/safari/smoke.png`. Synthetic paste checks the application handler, not native clipboard integration. The owner must enable Safari Remote Automation once; the runner never changes that setting. Codex and OpenCode allow this named command; Claude also excludes it and mutation testing from its Bash sandbox. Restart the relevant client after configuration changes. Configuration checks do not establish live approval behavior in another client.

For unattended sessions, OpenCode's auto-approve mode (`opencode --auto`, or the TUI command palette) approves permission requests that are not explicitly denied; the deny rules above remain enforced.

`AGENTS.md` §4 requires repository edits to go through the agent's own file-editing tool rather than shell scripting, and every tool's configuration enforces that the way its own permission model allows. OpenCode and Claude Code both deny interpreters and in-place stream editing; Claude Code's rules live in `.claude/settings.json`, and Codex relies on `sandbox_mode = "workspace-write"` in `.codex/config.toml` instead of command patterns. Read-only stream editing and search stay available in both pattern-based tools, because the requirement concerns writes. `npm run check:opencode` asserts that this one category stays denied in both configurations, so the gap that existed until 2026-09-27, when only OpenCode denied it, cannot reappear silently. The check deliberately covers that category alone, because each tool reaches unattended operation through its own mechanism. Keep the exact patterns in each tool's configuration rather than duplicating them here.

Claude Code is configured in `.claude/settings.json` for sessions that run with few or no approval prompts:

* **Mode and boundary.** Sessions start in auto mode, and Bash commands run inside Claude Code's macOS sandbox. Sandboxed commands may write only inside the repository and `$TMPDIR`, may not read the rest of the home directory, may reach only the npm registry and GitHub, and do not see the secret environment variables listed in `sandbox.credentials`. Inside that boundary, Bash commands run without a prompt.
* **Electron workflows.** Electron cannot start under the sandbox, so the end-to-end, performance, and `check:full` workflows are listed in `sandbox.excludedCommands`. They run outside the sandbox, still without a prompt, because they are in the allow list.
* **Browser workflows.** The sandbox forbids binding local ports and reaching Docker, so `npm run test:web`, `npm run test:web:built`, `npm run test:mutation` and `npm run test:web:chromium` fail inside it. Run them outside the sandbox through the platform approval flow.
* **npm cache.** Commands that write the npm cache under the home directory, such as `npm view` or `npm install`, fail inside the sandbox with an `EPERM` error. That error is the sandbox boundary, not a broken cache.
* **Denied operations.** Replaceable operations are denied outright so the agent switches to the dedicated tool: `cat`, `tee`, `curl`, `wget`, `env`, interpreter wrappers, history rewrites, and writes under `/tmp`. `PreToolUse` hooks also deny `&&` and `||` chains, shell loops, file redirection and heredocs, and `find` with `-exec` or `-delete`. Redirection to `/dev/null` and `2>&1` stays allowed.
* **Prompts that remain.** Pushing, dependency changes, and recursive deletion keep a prompt.
* **Agent self-modification.** In auto mode, the auto-mode classifier refuses an agent's attempt to edit Claude Code's own permission settings. The sandbox also denies Bash writes to the settings files. A change to this policy therefore needs the Product Owner to leave auto mode and approve the edit.

Allowed npm scripts and Git hooks execute mutable repository code with the host user's authority. The policy assumes this repository is trusted and reduces accidental or unexpected shell use; it does not protect the host from deliberately malicious repository code. OpenCode-native file tools remain subject to the denied external-directory boundary.

Before fixing a reported defect, run `npm run fix:history` — with no arguments it inspects the fix at `HEAD` or the working-tree diff, and it takes repository-relative paths otherwise — to see the earlier `fix` commits in the same production files, and when it reports a possible shared design cause include the proposed structural initiative or the reason none is needed in the handoff.

When an authorized outcome or session ends, provide a handoff recording what was completed, validation that passed, validation that failed or was blocked, unresolved issues, and the exact next task. Save enough context for ordinary “continue” to resume identifiable authorized work; supply a short task selector only when needed to distinguish multiple unfinished outcomes. A commit followed by another authorized task in the same session needs only a brief progress update. An incomplete validation result must never be presented without a follow-up action.

---

## 11. Multi-Session Initiatives

The active initiative index is [`plans/README.md`](../plans/README.md). Use an initiative plan when an outcome needs coordination across sessions. The same plan type records a review follow-up batch whose tasks the Product Owner authorizes one at a time, so repository state — not conversation memory — shows what remains. A single-session outcome may contain several focused commits without an initiative plan; use a temporary `WORKING_PLAN.md` only when `AGENTS.md` §8 requires it. Active plans are coordination records; they do not replace `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, an ADR, or the Product Owner's authorization.

Each active plan should contain:

* the objective, scope limits, and relevant source-of-truth links;
* an explicit authorization state, including decisions still reserved for the Product Owner;
* the approval's scope (whole initiative or named tasks), selected coding tool, priorities, delegated decision areas and principles, execution/recovery budget, and a separate closure allowance when final owner acceptance applies;
* an ordered table of task IDs, outcomes, dependencies, acceptance evidence, and status (`Planned`, `Ready`, `In progress`, `Blocked`, or `Done`);
* for each task, the files it is expected to change and its §9 validation tier, as required by `AGENTS.md` §8;
* the source review or report and its task IDs when the plan tracks a review follow-up batch, plus an explicit unverified-remainder note when the full list is unavailable;
* a single exact next task, or the reason no task can proceed;
* concise decisions and findings needed by later sessions, including baseline or final measurements when they affect the initiative;
* an Owner Involvement section with expected verification rounds and checks, task/check/action rows, and unresolved capabilities that may add rounds; include the working-task count and the separate final acceptance round required by `AGENTS.md` §8;
* a copyable prompt for the next session.

At the start of a continuation session, read the index, the named plan or the one resolved under `AGENTS.md` §8, `AGENTS.md` itself, and any existing `WORKING_PLAN.md`. Compare plan status with `git status` and recent commits. Reconcile dirty work or an unfinished working plan before selecting another task; resume owned unfinished work, preserve unrelated changes, and block when ownership cannot be established. When the worktree is clean, take the next `Ready` task within initiative-wide approval or an explicit continuation request. Do not infer approval from a status label or a plan's existence. Each initiative task uses the temporary working plan required by `AGENTS.md` §8, performs its required validation/review, and commits the task with the initiative status update. Session rotation follows `AGENTS.md` §12. In the handoff, cite the plan, completed task, next task and resume prompt. Do not repeat valid validation merely because the session changed.

For small fresh contexts, pass the selected task, authorization and decision boundaries, starting Git state, relevant source-of-truth section links and required acceptance evidence. Read applicable nested instructions when reaching an owner. Keep the full diff, validation record and relevant untracked files available to independent roles; a concise task prompt must not hide their required inputs. Use compaction within a task as needed, but preserve decisions and blockers in repository records before relying on a context reset. Measure total input, cached input, output, review/retry usage, elapsed time, human interventions and rework rather than assuming fresh contexts cost less.



If blocked, record the concrete blocker and the safe next action in the active plan when that update can be committed independently; otherwise preserve the uncommitted work and `WORKING_PLAN.md` and give the same information in the handoff. A plan's status must never imply a task passed validation or was committed when it did not. At completion, follow the final owner acceptance rule in `AGENTS.md` §8 before retiring a qualifying initiative. A review follow-up batch also requires confirmation that no further tasks remain. Move lasting product, architecture, or development knowledge to its owner, then remove the plan and index entry in the closure commit. Git history provides the completed plan's record; do not keep an archive or permanent validation log.

For a qualifying initiative, completed task rows remain `Done` while the initiative and index say `Awaiting owner acceptance`. Retain the delivered commit, result summary, evidence references, open limitations and owner response in the active plan. Record explicit acceptance against the unchanged reviewed result before retirement; rejection records the issues and exact next repair task. This status is an intentional review checkpoint, not an implementation failure. Report one planned final acceptance round separately from pre-commit product-verification checks, and additional rounds after rejected results. The final report must make clear whether implementation is finished or the initiative is closed.

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

`npm run check:requirements` scans `src/**/*.test.*`, `scripts/**/*.test.*`,
`e2e/**/*.{ts,mts,mjs}` and `perf/**/*.{ts,mts,mjs}`, including both Electron and Chrome specs.
It requires a marker for every numbered leaf section of `docs/PRODUCT.md` and for
parents with their own text; unnumbered subheadings belong to the nearest numbered
section. Numbered headings at levels two through four are supported (for example,
`#### 20.2.1 Title`); heading level must match number depth plus one. A marker on
a parent with numbered children and no own text must cite a subsection instead.
It rejects unknown section numbers and malformed markers. The checker
owns explicit exemptions with reasons for overview and product governance prose,
and a boundary-section list derived from `AGENTS.md` §9. Boundary sections also
require a marker under `e2e/`; a unit or performance marker cannot replace it.
Review the boundary list when adding or changing requirements. Section-level
traceability locates executable evidence; it does not prove that every sentence
has an assertion. Add markers only to tests that exercise the cited behavior and
review their assertions against the requirements when behavior changes.

`npm run check:docs` limits PRODUCT.md blocks to 700 characters and each numbered
section's own text to 8,000 characters. Paragraphs, individual list items with
their continuation lines, and table rows are blocks; headings, fenced code,
comments, separators, and blank lines are excluded from block counting. Section
text includes unnumbered headings and fenced code, but excludes comments and
separators. Block failures report the file, line, section, size, and limit with
"Split it into one rule per list item without rewording"; section failures say
"Split it into numbered subsections". The limits apply to every section; there is
no exemption mechanism.

Before restructuring requirement text, record the starting Git ref and run
`npm run check:docs -- --verbatim <ref>` after the edit. It compares the working
PRODUCT.md with that revision through a shell-free Git child process. Use
`--file docs/VIM_CONFORMANCE.md` for that document and `--allow-added <n>` for an
explicit number of added lead-in clauses. Exit 0 requires no removed clauses and
no additions beyond that bound; differences exit 1, invalid refs or files exit 2.
The report lists clause counts, removed and added clauses, changed headings,
clauses moved between headings, and clauses with antecedent phrases to inspect.
Fenced blocks compare exactly, including their line endings. Prose comparison
ignores formatting, whitespace, leading bold labels ending in a period or colon,
and terminal periods, semicolons, colons, and commas. Clause multiplicity is
preserved, so deleting or duplicating a sentence fails. A clean report proves
only equality of normalized clause multisets: it does not verify clause or
sentence order, and changes among periods, semicolons, and colons at internal
clause boundaries are also invisible. Review the diff for order and punctuation
under the stricter restructuring rules, and inspect each reported antecedent.

Preserve every sentence's characters, inline code, links, numbers, and references
when restructuring PRODUCT.md. Add Title Case headings and `*` list markers;
allowed wording changes are added lead-ins ending in `:`, replacing a leading
bold label with a heading, and changing a list item's final `;`, `.`, or `:`.
Keep each rule together with sentences that only qualify it, including "It",
"They", "That", "This", "Such", "These", and "above" or "below" references. Keep
the original order; regroup only interleaved topics and list cross-block moves
in the handoff. Preserve antecedents by placement or keep the pair together.
Record ambiguities as Product Owner questions instead of editing the sentence;
a sentence exceeding the block limit also requires a question. Keep blank lines
around lists and run `npm run format:check:changed`.

Each table in `docs/VIM_CONFORMANCE.md` has the columns PRODUCT (the precise
`§20.2.n` or other section that states the behavior), Case (a short title of the
tested case), Vim divergence (empty, or the marker with what Vim does differently
and the reason), and evidence (cited test paths and names, verified by
`npm run check:docs`). A row cites PRODUCT instead of restating a rule. A clause
that no PRODUCT sentence states stays in the Case cell tagged `matrix-only (Mn)`
and is listed under "Open matrix-only rules" until the Product Owner decides or a
named test asserts it; moving it into PRODUCT.md follows `AGENTS.md` §5.

A refactoring that preserves behavior should not require unnecessary test changes.

Store interaction tests use `createRealStoreHarness` from `src/renderer/test/real-store-harness.ts` by default for outcome assertions. It builds a real `EditorStore` over the shared application property-test load/save fakes, with in-memory clipboard and attachments. Assert the resulting document, location, focus, and renderer mode; use current snapshot nodes rather than supplying content that differs from the store. Tests own pending save timers with fake timers or an injected clock. Typed doubles in `src/renderer/test/` (`vim-keyboard-double.ts`, `editor-store-double.ts`) are for failure injection and calls that are themselves the contract, such as error reporting or lifecycle registration. A double supplies every member of its owner, so adding, removing, or renaming a member fails `npm run typecheck` at the double, while an unchecked literal can silently diverge and exercise a path the application never takes — the failure class [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md) removed for the interaction-state owners. When a double is needed, supply its snapshot and exercised behaviors through `createEditorStoreDouble`; do not recreate an `as unknown as EditorStore` literal.

End-to-end tests complement unit tests by exercising the real Electron application through the UI. They should target integration points that unit tests cannot cover: preload/IPC wiring, autosave and restart behavior, attachment files, the system clipboard, and the application startup path. See `docs/decisions/0002-e2e-testing-with-playwright.md`.

Platform-routed shortcuts need boundary-faithful end-to-end tests. Playwright injects key events through the DevTools protocol, which triggers Chromium's native editing behavior even though macOS does not route those commands in the running application. An end-to-end test for an editing command (Undo, Redo, Cut, Copy, Paste, Select All) must therefore suppress or disable the native browser behavior, such as the `copy`, `cut`, or `paste` event, and assert that the application still performs the action. A test that relies on the native default can pass while the product is broken. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

Coverage policy is defined in `AGENTS.md` §9. The enforced global and per-file floors are configured in `vitest.config.ts`, and `npm run check` runs the coverage-enabled unit suite that fails when a floor is not met. Coverage output can vary slightly between runs with identical inputs; treat a single-run global delta of a statement or two as measurement noise rather than a regression.

Per-file floors for the renderer interaction-state owners, their projection point, and scroll restoration are configured in `vitest.config.ts` and enforced by this coverage run. They are set just below coverage measured when each guard is introduced or strengthened, so losing a guarded module's focused coverage fails `npm run check`. Treat them as regression guards, not coverage targets: add behavior in its owner module with focused or property tests and restore coverage rather than lowering a floor. The single-owner pattern they guard is recorded in [ARCHITECTURE.md](ARCHITECTURE.md) §9 and [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md).

Property-based tests using `fast-check` cover domain invariants and `EditorStore` command sequences. They run as part of `npm test` and are written as `*.property.test.ts` files. The rules for when to add one are in `AGENTS.md` §9.

Property tests explore with a random seed on every run, locally and in CI, so each run can find a counterexample that an earlier run did not. A failure prints its seed and path. Replay it exactly with `FC_SEED=<seed> FC_PATH=<path> npx vitest run <file>`; `src/test/fast-check-setup.ts` applies both variables through `fc.configureGlobal`. A fixed seed on one property is allowed only when the test asserts that a branch was reached, and needs a comment saying so. Turn every reproduced counterexample into a named deterministic test in the same commit as the fix, as `vim-mixed-interaction.property.test.ts` does.

Write every run count as `propertyRuns(base)` from `src/test/property-runs.ts`. `TREE_PROPERTY_RUNS` multiplies all of them (default 1). `npm run test:property:soak` runs the property files at a factor of 20, and `.github/workflows/run-property-tests.yml` runs it nightly. A property whose every run builds the typed doubles passes a `maxScale` (`propertyRuns(base, maxScale)`), because Vitest retains every `vi.fn` it creates and thousands of runs exhaust the worker heap; do not create `vi.fn` inside a generated event. A soak failure is a candidate defect: replay it, then fix it under the defect-first workflow.

Mutation testing measures assertion strength, which coverage does not: Stryker changes one expression at a time in `src/domain`, `src/application`, and the selected pure renderer modules listed in `stryker.config.mjs`, then reruns the tests that cover it. Renderer mutation targets have no React, DOM, or Electron imports. A mutant that no test fails on has survived, and the mutation score is the share of mutants the tests detected. `npm run test:mutation` runs the full configured scope; arguments after `--` pass through to Stryker, so a narrower run is `npm run test:mutation -- --mutate src/domain/document-operations.ts`. Pass several files as one comma-separated `--mutate` value; a repeated `--mutate` flag keeps only the last one. Runs are incremental: `reports/stryker-incremental.json` lets a later run retest only mutants whose code or covering tests changed, and `--force` retests everything. The console prints the score table; read surviving mutants in `reports/mutation/mutation.html`. A full run takes about 15 minutes with the renderer modules included (measured 15m22s on 2026-10-02), so it is not part of `npm run check` or `npm run check:full`. `thresholds.break` in `stryker.config.mjs` is 93, below the full-run score of 94.97% recorded when it was set for the domain and application scope (93.86% on 2026-10-02 with the renderer modules added; timeout classification moves a module's score by a few points between runs), so a run fails (and the weekly workflow with it) when the score drops by more than timeout and random-seed noise. Raise it only after a measured full run is higher; never lower it to pass a run. The surviving mutants that remain are documented in source comments as equivalent or defensive. `.github/workflows/run-mutation-testing.yml` runs the full scope weekly and on manual dispatch, split into three parallel shards (domain, application, renderer modules) with `--concurrency 4` to match the four-vCPU runner, and uploads one HTML report per shard. The score threshold applies to each shard separately.

When a task changes logic in `src/domain`, `src/application`, or one of the renderer modules named above, run mutation testing on the changed files and read their surviving mutants before handoff. Read the weekly report when the score drops. Treat a survivor as a question about a missing assertion, not a target to chase: kill it with an assertion on behavior, or leave an equivalent mutant (one that cannot change observable behavior) with a Stryker disable comment stating why. The Stryker Vitest runner does not yet work with Vitest 5, which is why `vitest` is pinned to 4.x; upgrade Vitest only together with a runner release that supports the new version, and confirm that a narrow run still kills mutants.

Run ordinary Vitest validation after Stryker has finished and removed its sandbox.
The pure completion lifecycle owner `completion-controller.ts` and its recognizer adapter `completion-sources.ts` are also in the renderer mutation scope. `stryker.config.mjs` owns the complete module list. The scheduled workflow sets `TREE_MUTATION_SHARD` to `domain`, `application`, or `renderer`; the configuration filters that list by layer while retaining all exclusions. With the variable unset or empty, the full scope runs. Unknown shard names fail configuration loading. `scripts/mutation-scope.test.mts` guards that the shards partition the full scope and that the workflow uses this selector rather than a separate module list.
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

Electron performance tests live in `perf/electron/` and form the `electron` project of `perf.config.ts`. Browser scenarios against the built static package live in `perf/web/` and form the `web` project. Cross-platform comparison runners live in `perf/comparisons/`; shared result recording stays in `perf/results.ts`. Select their scope using procedure §10 and the commands in §9; a High Risk classification alone does not require a run. `npm run test:perf` builds both targets and runs both projects; the full Electron suite runs as part of an explicitly selected `npm run check:full`, or on its own with:

```bash
npm run test:perf -- --project=electron
```

The scheduled Performance workflow and `make perf-electron` run the Electron project only. Run the [browser archive scenarios](../src/web/README.md#browser-archive-performance) with `npm run test:perf -- --project=web` when a change can affect browser archive work.

Optional, approval-required [local Safari comparisons](../src/web/README.md#local-safari-performance-comparisons)
are separate from the automatic validation workflows and ordinary Electron suite.

The domain date-recognition timing guard in `src/domain/natural-date.performance.test.ts` runs with the unit suite's coverage step but not in its parallel worker pool: `vitest.config.ts` excludes `*.performance.test.ts`, and `npm run test:performance` runs those files serially in their own Vitest invocation as step 9 of `npm run check`, because a scheduler pause in a neighboring worker would inflate the timed result. It checks the first relative-date lookup, mixed batches of English counts, incremental typing, and long surrounding text, and the p99 of individual calls. `perf/electron/date-completion.spec.ts` complements it with popup paint latency, the key-to-popup-insertion latency that does not depend on the display refresh rate, and acceptance through the running application in both editing modes. Mutation workers exclude `*.performance.test.ts` because instrumentation changes the work being timed; ordinary validation still runs these guards. `perf/electron/agenda-scale.spec.ts` opens the Agenda on synthetic 100,000-node documents of wide, deep, and mixed shape, with dates on every node or on every twentieth, and measures opening, scrolling, navigation, typing, date completion, an occurrence move, and Undo. Set `AGENDA_CPU_PROFILE=1` to print a renderer CPU profile summary for diagnosis; profiled timings are not comparable to the ceilings. The timing assertions are soft so every behavioral check still runs after a latency failure.

They measure startup, typing, state/persistence work, and sustained renderer-memory growth at several document scales and print one JSON line per scenario. Unlike the e2e suite, the performance fixtures keep the application window visible: the typing scenarios measure paint latency for a presented window, and the same-machine baselines are recorded that way, so hidden e2e window mode is intentionally not applied to `perf/`. Every scenario also records its metrics through `perf/results.ts` into a JSON artifact (default `test-results/perf-results.json`, overridable with `PERF_RESULTS`). Set `PERF_BASELINE` to a previously recorded artifact to compare against it: the run fails when the baseline lacks a recorded scenario or metric, or when a metric regresses beyond `PERF_REGRESSION_TOLERANCE` (default `1.5`). Pass an artifact override as a single quoted value, for example `PERF_RESULTS="test-results/perf-after.json" npm run test:perf`; `PERF_RESULTS` output must stay under `test-results/`, and an unquoted value is treated as an unfamiliar command and requires approval. Re-record the baseline when adding a scenario or metric. The comparison is meaningful on the same machine, so baselines are captured locally and never committed. Playwright clears `test-results/` at the start of every run, so keep a baseline outside that directory and point `PERF_BASELINE` at it. Two consecutive runs on one machine without a code change already exceed the default tolerance on a few single-sample and frame-quantized metrics, so a baseline comparison is a diagnostic for a targeted before-and-after check, not a pass or fail gate. The scheduled performance workflow therefore does not set `PERF_BASELINE`; it downloads the previous successful run's artifact and `scripts/perf-report.mts` lists the metrics that exceed the tolerance in the job summary without failing the run. The absolute ceilings in the specs remain the gate. The recorded budgets, measured baselines, and scenario parameters are owned by the `perf/` suite; they are not restated here.

Each typing scenario focuses a specific input, asserts the seeded text is present and focused, types, and asserts the field received the typed text while the current-parent heading was not edited. This matters inside a parent, where the first textbox is the current-parent heading rather than the selected child. The scenario measures wall-clock typing time and paint latency; the `inputTurnaround` metric is an observation only, not React commit latency. The supported document-scale target is 100,000 nodes. A 30,000-sibling wide scenario guards that windowed rendering keeps typing cost independent of the displayed sibling count.

The state/persistence scenario in `perf/electron/state.spec.ts` seeds a large attachment-bearing document and runs a structural burst, a typed-word burst, and a reference-changing delete; a second scenario exercises attachment-bearing history through structural commands, undos, and redos; a third measures attachment image validation and write latency. Each prints its measurements and enforces ceilings. The save count and the summed document bytes written confirm the automatic save policy triggers on inserted-word volume rather than per keystroke, and the cleanup scan duration guards the reference-changing path against unbounded history or document scanning. The budgets and their measured baselines are recorded by the `perf/` suite and its result artifacts.

`perf/electron/notes-archive.spec.ts` measures visible typing at idle and throughout desktop export and import preparation. It exercises the real archive worker, IPC and filesystem, stubbing only the native panels. It records key-to-frame latency, operation duration, main event-loop delay and sampled main JavaScript heap growth, with representative near-limit images. After cancelling an active preparation it checks staging cleanup and open file descriptors (`lsof` on macOS, `/proc` on Linux). JavaScript heap excludes native allocations and worker heaps; its sampled peak can miss short-lived allocations.

The Vim performance scenarios measure repeated Normal, character Visual, whole-node Visual, and Insert interactions, standalone `dd`, and sibling movement through the visible Electron renderer. The save-responsiveness scenario measures the key that triggers a ten-word automatic save and the next key while a deliberately delayed save remains in flight. Selected scenarios repeat under four-times renderer CPU throttling as a reproducible constrained-CPU proxy; this does not model macOS Low Power Mode or system-wide contention. The memory scenario records renderer JavaScript heap and Electron process working sets at a warm point and after two further edit bursts. Summed process working sets may count shared pages more than once, so they are a diagnostic footprint rather than unique physical memory.

Behavioral guards live next to the code they protect and are named after the behavior they assert. The main guard families are automatic-save accounting and quit-time flushing (`editor-store.test.ts`, `editor-store.property.test.ts`, `e2e/electron/shutdown-failures.spec.ts`), bounded save-failure retries and the locked save-failure state (`editor-store.test.ts`, `e2e/electron/persistence-lock.spec.ts`), unexpected renderer errors and reload recovery (`ErrorBoundary.test.tsx`, `e2e/electron/renderer-failures.spec.ts`), undo and redo command breadth with text-edit session boundaries (`editor-store.test.ts`, `editor-history.test.ts`, `e2e/electron/history.spec.ts`, `e2e/electron/undo-sessions.spec.ts`), attachment and PNG validation (`ipc-security.test.ts`, `ipc-handlers.test.ts`, `png-decoder.test.ts`, `e2e/electron/attachment-validation.spec.ts`), image-display failures (`AttachmentPreview.test.tsx`, `e2e/electron/attachment-validation.spec.ts`), window-geometry coalescing (`window-state.test.ts`), generation retention and recovery (`file-services.test.ts`, `e2e/electron/persistence-reliability.spec.ts`), retention of attachment references and the bounded decoded-image cache (`editor-history.test.ts`, `attachment-image-cache.test.ts`, `e2e/electron/leave-layout-stability.spec.ts`), attachment cleanup retention and unlinking (`file-services.test.ts`, `e2e/electron/attachment-cleanup.spec.ts`), save serialization, node lookup, path copying, and attachment-id collection (`document.test.ts`, `document.property.test.ts`), external hyperlink opening (`e2e/electron/hyperlink.spec.ts`), and document-save directory flushing plus attachment-write flushing under abrupt termination (`file-services.test.ts`, `e2e/electron/persistence-reliability.spec.ts`). Current requirements are owned by product and architecture documentation, while test names and fixtures identify their executable guards.

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

Real persistence across an Electron restart is additionally covered by the end-to-end suite in `e2e/electron/persistence.spec.ts`.

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

Direct dependencies are declared with exact versions and no range operators (`docs/decisions/0006-exact-dependency-pinning.md`). Upgrade a dependency by changing its exact version, reinstalling, and completing High Risk functional validation under §9; select Electron performance checks separately under procedure §10. Do not widen the version to a range.

`package.json` `overrides` pins `qs` to a patched version: `@stryker-mutator/core` pins `typed-rest-client` `~2.3.0`, which pins a `qs` release with known advisories. Remove the override when a Stryker release depends on a patched `typed-rest-client`.

`npm audit` runs as the final step of `npm run check:full`, not of `npm run check`, so known vulnerabilities are reported at the end of complete validation. It requires registry access and fails when offline.

Between validation runs, `.github/dependabot.yml` opens weekly pull requests for npm and GitHub Actions updates (minor and patch updates are grouped, major updates arrive one per pull request), and Dependabot security updates open a pull request when an advisory is published. `.github/workflows/audit-dependencies.yml` runs `npm audit --audit-level=high` on pushes to `main`, every eight hours (00:00, 08:00 and 16:00 UTC), and on manual dispatch, so a high or critical advisory fails a visible run even when no fix pull request exists. No update is merged automatically: review each pull request, keep the exact-version rule above, and apply the dependency validation scope above.

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

Agent-created temporary work belongs in `.scratch/<task>/` under the repository root, as required by `AGENTS.md` §4 for Codex, Claude Code, and OpenCode. Create task directories only when needed; no tracked placeholder is required. Use a unique task name and separate agent subdirectories for concurrent work. The folder is ignored by Git, ESLint, Prettier, and Vitest discovery and is not copied into Stryker's mutation sandbox, so saved diagnostic scripts, unfinished examples and browser profiles do not enter ordinary validation. A hidden name and `.gitignore` are not a confidentiality boundary or automatic cleanup mechanism.

Keep reports needed across test runs here, rather than in system temporary directories or Playwright's cleared `test-results/` directory. Existing tool-managed outputs such as `test-results/`, `reports/`, and `out/`, library-managed temporary directories, and application test profiles retain their current locations. A diagnostic spec that needs the E2E or performance runner's discovery stays in its designated suite while in use; the existing permitted retirement workflow remains valid. Working and initiative plans retain the locations defined in `AGENTS.md` §8.

Read and write scratch files through the agent's normal repository file tools, including when a tool needs an explicit path to discover Git-ignored files. Do not widen external-directory access to accommodate an agent-chosen temporary destination. For a user-specified path or a tool that requires an external location, establish the required write and read access before depending on its artifacts. Keep referenced evidence available through handoff. After a task's final commit, remove its directory with `npm run retire:scratch -- <task>`. The script accepts one directory name directly under `.scratch/`, refuses option-like names, nested paths, symlinks, regular files and locations that resolve outside `.scratch/`, and never follows nested symlinks. The retained-name list in `scripts/retire-scratch.mts` is currently empty: the owner authorized retirement of the four former infrastructure namespaces on 2026-10-14 after their durable conclusions were checked. The command does not authorize deleting another task’s evidence or resetting execution allowances. There is no automatic purge, and this workflow grants no other shell or recursive deletion permission.

Before deleting anything, retirement checks every embedded checkout for tracked, staged, or untracked changes; ignored build output may be discarded. It refuses locked worktrees, malformed or symlinked Git metadata, worktrees owned by another repository, and embedded clones (including bare repositories) that have linked worktrees. Clean worktrees owned by this repository are removed through Git, including their registrations, before the remaining task files are removed. Missing checkout registrations inside the task can be retired after an interrupted cleanup; unrelated registrations and branches are preserved. A preflight refusal preserves the entire task. An execution failure stops cleanup and reports failure; already completed removals are not rolled back. Stop task-owned processes before retirement, and do not edit a checkout concurrently with cleanup.

Codex uses `.codex/rules/scratch.rules` for this command outside the sandbox, because `.git/worktrees` remains protected inside it. The allowance trusts the named repository script, not arbitrary `git worktree remove` or recursive shell deletion. Restart Codex with the project configuration trusted after adding or changing the rule. Verify matching without deletion using `codex execpolicy check --rules .codex/rules/scratch.rules npm run retire:scratch -- completed-task`. A matching rule is configuration evidence only; verify the absence of a prompt on the next authorized cleanup in a restarted session. The existing OpenCode allowance for `retire:scratch` continues to use the same script guards.

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
