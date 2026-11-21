# Development Guide

<!-- validation-mechanics-owner -->
<!-- workflow-policy-reference: AGENTS.md -->

## 1. Project Overview

Tree provides a macOS desktop application and a published browser version, built with:

* Electron
* React
* TypeScript
* Vite

The project is developed primarily through an AI coding agent.

The repository is the source of truth for the current implementation, documentation, tests, and architectural decisions.

---

## 2. Prerequisites

The development environment requires:

* Node.js 24.22.1;
* npm 11.8.0;
* Git

The Node.js version is pinned in `.nvmrc`. The supported Node.js and npm ranges are also declared in `package.json`.

Apple Silicon Electron development also requires Xcode Command Line Tools (`xcrun
swiftc --version`). `make dev` and `npm run build` compile the Apple Vision helper
when its source or build script changes. Swift's module cache stays inside the project
under `.scratch/image-to-text/swift-cache/` so compilation can run in the workspace
sandbox. No model download is required. Browser and
Linux builds skip this native compilation. The Apple Silicon macOS Electron smoke includes real
image recognition; the release verifier repeats it from the signed DMG and ZIP.

Both platform entry points use the shared inline About dialog in
`src/renderer/about-dialog.ts`, as specified in PRODUCT §9.4.
Its icon and links are bundled with the renderer; no native About-panel resource
needs to be installed in the Electron bundle.

Do not assume a different Node.js version without checking the project configuration first.

Run `npm run doctor` to check the toolchain, installed Electron and Playwright packages, display availability for the Electron suites, registry reachability for `npm audit`, and build output. It reports `PASS`, `WARN`, `FAIL`, or `INFO` per check and exits nonzero on a blocking problem.

---

## 3. Installing Dependencies

After cloning the repository or when dependencies need to be installed:

```bash
npm install
```

The install runs the project's `postinstall` script to download the Electron runtime for the current platform, and its `prepare` script to point Git at the repository's tracked hooks (`.githooks/`). Do not disable lifecycle scripts when preparing a development environment.

The tracked `commit-msg` hook rejects a commit message that adds an agent co-authorship or attribution line, per `AGENTS.md` §12. It applies to every coding agent through Git itself, not through any one tool's configuration, so it holds regardless of which tool is committing or what a session-level instruction suggests. It only runs on the machine that makes the commit, so the Attribution GitHub Actions workflow (`§9`) is the backstop for the commits of a pull request made without the hook installed and for a pull request description, which no Git hook can see. The workflow runs only on pull requests; a direct push to `main` is checked only by the local hook.

The same hook runs `scripts/check-release-notes.mts` to require release-note fields
on new feature, fix and performance commits. `Test and build app` runs the same
validation over new non-merge commits on pull requests and pushes to main, before
dependency installation. Its full-history checkout permits the legacy exemption
described in [macOS releases](releasing.md#release-notes). Failed validation blocks
the dependent release jobs. The agent owns note writing and review under
[Agent Workflow Procedures §12](AGENT_WORKFLOW.md#commit-messages); checks enforce
presence and format, not meaning.

The Electron end-to-end suite does not need Playwright browser binaries. Browser
E2E and Chromium smoke checks do need Chromium; the prepared Linux container and
CI install it separately. For an Electron-only development setup, browser downloads
can be skipped:

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
| `make setup` | Prepare the Docker test image; owner only, requires network | [Chromium dependency preparation](DEVELOPMENT_REFERENCE.md#chromium-container-tests) |
| `make dev` | Electron development mode | `npm run dev` |
| `make dev-web` | Web development server | `npm run dev:web` |
| `make build` | Build the Electron application | `npm run build` |
| `make test-unit` | Unit and property tests with coverage | `npm run test:coverage` |
| `make test-smoke` | All macOS smoke checks and Linux smoke checks in Docker | `npm run build`, `npm run test:safari`, `npm run test:smoke:electron`, `npm run test:smoke:chromium`, `npm run test:smoke:safari`, `npm run test:smoke:linux` |
| `make test-e2e` | Local Electron E2E and web E2E in offline Docker Chromium | `npm run test:e2e`, `npm run test:web:chromium` |
| `make test-memory` | Linux Electron memory tests in Docker | `npm run test:e2e:memory` |
| `make test-perf` | Domain, Electron, web, and Safari comparison benchmarks | `npm run test:performance`, `npm run test:perf`, `npm run test:perf:safari` |
| `make test-property` | Property tests with increased repetitions | `npm run test:property` |
| `make test-mutation` | Check whether tests detect deliberately introduced bugs | `npm run test:mutation` |
| `make release [patch\|minor\|major]` | Bump the version and commit locally; patch by default | `npm run release -- <bump>` |

Combined targets run their listed workflows sequentially and stop at the first
failure. They include the required builds: `test:safari` builds the web package
before the remaining local smoke checks. The combined smoke and performance
targets require macOS, Chrome, and Safari with Remote Automation enabled by the
owner. Smoke and E2E also require Docker and the prepared image. No target changes
Safari settings or prepares the image automatically. Run resource-intensive test
targets separately to avoid concurrent workloads affecting measurements.

The ordinary unit suite already includes property tests; `test-property` selects
those tests with increased run counts. The memory suite enforces sampled growth
and footprint budgets and reports measurements. Static code and repository
checks remain available through `npm run check`, which includes unit coverage and
the Electron build but excludes E2E, smoke, and timing suites.

Test and development targets never run `setup` automatically. Agents continue
using the named npm workflows and their existing permissions, including
`npm run test:web:chromium` and `npm run test:smoke:linux` for container tests. No general Make/Docker permission
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

Maintained Node scripts and their tests use `.mts` to declare TypeScript ES modules explicitly. Node 24 runs them directly by stripping erasable types; no build step or extra runner is required. Use explicit extensions in relative imports and type-only imports for types. `config/typescript/tsconfig.scripts.json` enables `erasableSyntaxOnly` and checks the scripts through `npm run typecheck:scripts`, included in `npm run typecheck` and `npm run check`. It uses the repository's ESNext/Bundler resolution to include shared `.ts` helpers; Node execution still requires real import paths and does not read tsconfig settings. The imported JavaScript tool configuration and compatibility launchers are checked as well.

Browser specs and helpers in `e2e/web/` and `perf/web/` use `.mts` and are checked by `config/typescript/tsconfig.e2e.json` alongside the Electron suites and the native Node comparison runner `perf/comparisons/safari-electron.mts`. ESLint and Stryker configurations retain `.mjs` for their existing loaders and configuration discovery. The three `.mjs` launchers in `scripts/web-release/` preserve installed workflow entry points and delegate to `.mts` implementations.

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
`config/testing/playwright.web.config.ts`. Electron specs, launch helpers and screenshot baselines
live in `e2e/electron/`, selected by `config/testing/playwright.config.ts`. Each target discovers
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

Prepare unrelated editor state with `seedDocument` when creation or typing is not the behavior under test. Check the source value and focus before the native action. Preserve real preparation when pending input, undo grouping, prior navigation or remount timing is part of the regression. A seeded empty history can strengthen an Undo assertion by preventing an unrelated setup edit from satisfying it; assert document content and identities, not just row count.

`App.history-identity.test.tsx` checks complete split documents and the restored new-node identity through real App/store Undo/Redo in both modes. `history.spec.ts` retains native text/creation/split dispatch, subtree identity, pointer reorder, clipboard and attachment history. Recovery generation ordering belongs to `file-services.test.ts`: real temporary files cover both supported document versions, both enumeration orders and promotion of the complete selected state. `persistence-reliability.spec.ts` retains real startup recovery, failure UI, interrupted-save promotion, attachments and quit/retry behavior.

When comparing test cost, record launches, summed durations, wall time, retries and the unchanged controls. Keep host, concurrency and selection matched, and avoid overlapping other test runners. A small wall-time difference within host variation is not an established speedup. Prefer fewer unrelated setup actions and stronger assertions even when launch cost masks their timing effect; do not trade a native failure path for a target case count.

Breadcrumb moves use `App.test.tsx`'s `App breadcrumb move matrix` with the real store for all eight ancestor/root × expanded/collapsed × Standard/Vim combinations, including the complete tree, location, focus/caret and Undo/Redo. Its synthetic geometry and pointer events cannot prove native capture, hit testing or browser focus timing. `e2e/electron/drag-and-drop-hierarchy.spec.ts` retains four real-pointer history cases: Standard ancestor/collapsed and root/expanded, plus Vim ancestor/expanded and root/collapsed. Each destination and expansion state remains exercised in each editing mode across those cases. The same spec retains image-only sources, invalid targets and cancellation, toolbar highlight geometry/screenshots, editing-state transitions, and Undo/Redo after unrelated navigation. This split is specific to that matrix; it does not establish a four-case rule for other groups.

The real `App drag editing-state matrix` owns every editing state across row and breadcrumb destinations. Electron uses complementary representatives: Standard Insert on both routes, Vim Replace/character Visual through breadcrumb remount, and Vim Normal/Insert/whole-node Visual on rows. Keep rich remount, image source, gap targeting, depth errors and restart separately. Agenda's no-drag case checks mouse/touch input and the saved document; Tree retains its cancellation/drop caret checks. Inline disclosure's native appearance flow asserts opening, closing, visible rows, location and focus, while App tests own the expansion rules. Native quick-click/hold/text-selection, shifted fold keys, wrapped/bidirectional navigation and frame-by-frame scrolling remain distinct risks despite similar final text.

`App.vim-repeat.test.tsx` owns structural o/O/c/s pointer interruption through real App/store and proves that dot retains the earlier change, with exact IDs/text, caret and Undo. Electron retains native opening and Visual replacement, plus other-node clicks and actual clipboard interruptions. Visual exit direction/attachment tables use independent literal endpoints in `editor-input-handlers.test.ts`; never derive the expected caret from the same command state being tested. Native forward Escape and swapped v exits retain rendering evidence. Real-store tests own gJ count/clamp/no-op rules; native uncounted/counted dispatch, children, caret and Undo remain covered.

Enter-at-start subtree preservation uses real App/store coverage in `App.test.tsx` for Standard and Vim Insert, including exact IDs, children, attachments, links, focus/caret and Undo/Redo. `e2e/electron/editing.spec.ts` retains native beginning/middle/end and repeated Enter, plus linked contenteditable-to-textarea focus transfer. `e2e/electron/navigation.spec.ts` retains entering a node, creating its first child, leaving it and entering through the circular indicator. The integration tests own subtree variants; the retained Electron tests own native input and navigation behavior.

Completion coverage is layered: `src/domain/natural-date.test.ts` and `emoji-completion.test.ts` own expression and shortcode tables; `src/renderer/completion-sources.test.ts` owns the adaptation of recognizer matches to shared suggestions; `completion-controller.test.ts` owns popup selection and dismissal rules; `use-node-input-bindings.test.tsx` exercises the input hook with a real store, including selection retention, reset and acceptance. `App.completion.test.tsx` owns the grammar/refinement matrix through real App, NodeInput, popup and store, including ordered suggestions, chosen-date retention, exact replacement spans, focus/caret and one-step Undo. Its DOM events and synthetic layout cannot prove browser default actions or popup placement. The Electron completion specs retain representative real-keyboard and pointer flows, textarea and rich editors, Tree and Agenda, both editing modes, focus/caret/Undo, paste, hyperlink exclusion and popup geometry. Add recognition variants to the focused tables rather than repeating each expression across every Electron editor and mode. Keep a real-renderer case when it exercises a distinct input path or rendered state. Emoji's small-window scrolling, plain-editor suffix/restored-text and rich-editor Unicode interactions remain separate boundary checks.

Visual baselines belong to distinct rendered states, not every command that reaches them. The shared breadcrumb drop highlight and Insert date/typography appearance use Standard-mode baselines; both modes retain their behavior and geometry assertions. Vim Normal/Visual, image carets, textarea/contenteditable, focus changes and selected neighbours retain separate evidence where their rendering differs. Completion popup appearance uses two local theme baselines, while Tree/Agenda and both modes retain placement, edge, focus and acceptance checks. Keep meaningful context for clipping and overlap, and prefer a local component capture over unrelated full-window chrome. A diagnostic `screenshot()` without an image assertion is evidence capture, not extra regression coverage; avoid immediately repeating a successful baseline capture unless the additional artifact serves a specific inspection need.

Agenda command restrictions use `App.agenda-policy.test.tsx` for real App/store dispatch across day and direct-match rows in Standard and Vim. It checks the live document, selection, focus, caret, mode and absence of extra saves after flushing; the lower-level command matrix still owns shortcut-profile rules. `e2e/electron/agenda-editing.spec.ts` retains native Tab focus/caret suppression, prohibited edits, multiline single-node paste and second-image rejection. `agenda-flat.spec.ts` owns full-day opening geometry, oversized Today, manual-scroll cancellation, passive path alignment, wrapped-label windowing, day folds, no creation/whole-node selection and last-date pin departure. `AgendaView.test.tsx` reproduces development StrictMode effect replay without adding a development URL option to the production Electron fixture. A negative persistence assertion must let pending saves finish before reading disk: install the renderer clock before the action, advance the idle-save deadline, then await the queued `treeApi.load()` boundary. An immediate unchanged-file assertion can miss an invalid edit that has not been saved yet.

Standard also owns shared Insert hyperlink/punctuation, zoomed preview, Agenda timeline/path/windowed headings, inactive links/restored images, and Insert editing/mirror appearance. Both modes retain their native behavior, geometry and lifecycle checks. Keep separate baselines when the state includes Normal/Visual/Replace, image caret, selection or a changed focus projection; matching theme and text alone does not establish redundancy. The Vim status label is owned by the mode-toggle suite, so it does not justify duplicating every otherwise identical full-window image.

Electron end-to-end tests live in `e2e/electron/` and run with:

```bash
npm run test:e2e
```

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. Hidden runs execute spec files in parallel across six workers locally or four in CI, and selected long-running suites distribute their independent tests across those same workers; visible runs stay serial. Parallel execution is safe because each worker cleans only its own `tree-e2e-p<pid>-` applications, the machine-global `Cmd+0` shortcut is stubbed for every launch except the serial `e2e/electron/shortcut.spec.ts`, and the shared system clipboard is serialized through a cross-process lock. The execution model and its rationale are recorded in `docs/decisions/0012-parallel-e2e-execution.md`. Use Playwright's `--workers` option when a local or CI environment needs a different concurrency limit. The complete local regression and screenshot run requires macOS with a display; the Linux functional subset runs under Xvfb as described in [Development Reference §1](DEVELOPMENT_REFERENCE.md#chromium-container-tests). Never run two Playwright invocations concurrently.

Application windows are created hidden by default so the suite does not steal desktop focus. The test-owned entry `e2e/electron/electron-entry.cjs` applies hidden mode through `e2e/electron/hidden-windows.cjs` before the application bundle loads, and every launch asserts the selected window mode, so an Electron or Node upgrade that invalidates the override fails on the first launch instead of silently showing windows. Run with visible windows when observing the real UI, for example during product verification:

```bash
TREE_E2E_VISIBLE=1 npm run test:e2e
```

To observe a single spec, run `TREE_E2E_VISIBLE=1 npm run test:e2e -- <spec>` (this rebuilds the application first) or `TREE_E2E_VISIBLE=1 npx playwright test -c config/testing/playwright.config.ts <spec>` (this uses the current `out/` build).

Hidden runs of `navigation.spec.ts` and eligible `tab-structure.spec.ts` cases adopt one shared application per worker through same-window reload. Navigation retains its transient native/renderer state poison regression before the next navigation case. Tab cases with nested seeds retain fresh applications; root-level collapsed seeds, native status-bar traversal and the root image-caret case are eligible. Both editing modes and all existing cases remain covered. Use `npm run test:e2e:diagnose -- --shared-reset=fresh <specs>` for matched fresh-process controls, or `--shared-reset=reload` for adopted execution. The diagnostic wrapper sets `TREE_E2E_SHARED_RESET` internally so Codex can reuse the named workflow's approval. The reset disposes the renderer, drains existing IPC work and removes document/preference data between tests, then reloads the same window. Every shared launch checks its seed, focus, editing mode and empty history before proceeding. Lifecycle, persistence, appearance, shortcut and custom launch-option tests retain fresh processes. Chromium session state and main-process caches remain shared, so this is bounded reuse rather than fresh-process isolation. The bounded rollout measurements below cover navigation, Tab structure and the eligible Vim text and navigation/selection cases.

ADR 0021 defines the adoption contract. The fixture exposes `sharedApplicationAdopted()` for reviewed eligible owners: hidden execution selects same-window reload, while visible runs and `TREE_E2E_SHARED_RESET=off` select fresh processes. The global fixture default remains fresh; adoption does not make neighboring specs eligible. All process-owned metadata is invalidated on disposal or process loss, including transitions to fresh cases. Reset failures and load errors dispose the process before data removal; inability to prove exit leaves data intact. Blank-renderer navigation and original-handler IPC draining have deadlines, native move/resize observation drains a surviving bounds debounce even after a move back to the initial bounds, and worker shutdown is bounded.

Eligible hidden `vim-text-editing.spec.ts` groups also adopt reload. The two bodies seeded inside a nested location and the two light/dark screenshot bodies that install Playwright media emulation retain fresh processes. Media emulation survives renderer navigation and is outside the reset contract; renderer-owned paste/cut listeners are discarded. Unnamed groups preserve existing test titles and conformance references. Ordered Visual/Replace poison and successor cases verify clean focus, caret, history and registers with locked clipboard rewriting. The same diagnostic fresh/reload controls and visible fallback apply.

Eligible hidden `vim-navigation-and-visual.spec.ts` groups adopt reload for 54 existing cases. Sixteen nested/expanded-seed cases, eight media-emulation cases and the initial Normal-mode startup assertion retain fresh processes. The deliberate Normal-selection case also installs a page clock through the pointer-drag helper. Unnamed groups preserve existing titles, order and conformance references. Ordered character and whole-node Visual poison/successor cases exercise saved selections, text/node registers, repeat and undo history, clipboard rewriting and focused Normal caret restoration. The same fresh/reload diagnostics and visible fallback apply; this adoption does not extend the reset contract.

Run `npm run test:e2e -- e2e/electron/shared-application.spec.ts --workers=1` for reset/recovery regressions. The infrastructure cases deliberately exercise hidden reuse and test-owned faults; they do not opt an editing spec into adoption. The separate memory tests sample twelve bursts of eight edits/resets or matched fresh launches, treating the first burst as warm-up. They attach raw/GC-retained renderer heap, native process working sets, main-process heap, window/renderer counts, listener counts and pending/error IPC counts. For a longer investigation, use `npm run test:e2e:diagnose -- --memory-burst-size=32 --config=config/testing/playwright.memory.config.ts --workers=1`. This changes measurement scope, not a memory budget. Measurements are finite-run evidence; Chromium session caches, native allocation and main-process state survive reload, so heap stability alone does not prove native memory is bounded indefinitely.

The shared fault probes are declared only for hidden runs. Visible runs of this infrastructure spec exercise the selector and its two real fresh launches, preserving the complete visible suite's fresh-process contract. Use `npm run test:e2e:visible -- e2e/electron/shared-application.spec.ts --workers=1` to verify that fallback, and `npm run test:e2e:diagnose -- --shared-reset=fresh e2e/electron/shared-application.spec.ts --grep 'adopted selector' --workers=1` for its hidden fresh control. These exclusions concern the hidden-only infrastructure probes; no product editing case or mode is removed.

For Codex and Claude Code, prefer `npm run test:e2e:visible -- <spec> --workers=1` for visible runs and `npm run test:perf:profile -- perf/electron/agenda-scale.spec.ts --grep deep-100000-dense` for Agenda CPU profiling. Both rebuild first and forward the supplied Playwright arguments. The environment assignments live inside the npm scripts so the outer commands match reusable approval prefixes. Use `npm run test:e2e -- <spec>` and `npm run test:perf -- <spec>` for ordinary runs. Avoid prepending environment assignments or wrapping these commands in an explicit shell invocation when reusing approvals.

Codex rules, process inspection and live tool checks for these workflows are in [Development Reference §3, Agent Tool Configuration](DEVELOPMENT_REFERENCE.md#3-agent-tool-configuration); historical macOS memory and test-cost measurements are in [§4](DEVELOPMENT_REFERENCE.md#4-historical-measurements).

Use `npm run test:e2e:timing` to rebuild and measure the complete hidden E2E suite. It writes the Playwright JSON report to `test-results/e2e-timing.json` and prints wall time, summed test time, duration buckets, per-file and editing-mode totals, the slowest tests, launch counts, launch phases, and fixture teardown time. Wall time covers Playwright execution, excluding the build and report summary; test totals include retry attempts. Each `launchTree` call records cleanup, Electron launch, first-window retrieval, and post-launch assertion durations as test annotations. The summary checks that these phases account for total launch time within 10%. Preserve the JSON report outside `test-results/` before another run when comparing measurements, and run timing and other Playwright invocations sequentially.

The ordinary E2E configuration excludes only `e2e/electron/shared-application-memory.spec.ts`. All reset/recovery tests remain in `e2e/electron/shared-application.spec.ts`. Run the Linux memory suite with `npm run test:e2e:memory` (or `make test-memory`), without arguments, using the prepared local Docker image described under [Chromium container tests](DEVELOPMENT_REFERENCE.md#chromium-container-tests). CI builds Electron and invokes the memory configuration directly under Xvfb. It uses one worker and no retries. The `memory` project retains the hidden shared/fresh controls. The `memory-regressions` project selects only `@memory` cases from the existing perf specs and the detector self-checks: fresh footprint, sustained structural edits without reload, expansion/collapse, and canceled search with Tree/Agenda switches. Those cases keep the perf fixture's visible window under Xvfb; they contain no timing budgets. `scripts/memory-selection.test.mts` checks the exact discovered cases and rejects skipped coverage. Direct diagnostics through `test:e2e:diagnose` remain available on the host; `TREE_E2E_MEMORY_BURST_SIZE` changes shared/fresh measurement length, not the fixed container command or its budgets.

The `Run Electron memory tests` workflow owns these measurements on Ubuntu: weekly on Sunday at 04:00 UTC, on manual dispatch, and as a reusable prerequisite for a new release version in `Test and build app`. Release runs reuse the caller's dependency audit. The publication gate requires memory success alongside browser and Electron E2E success; missing, failed, cancelled or skipped memory results block a release. Non-release pushes and pull requests skip the release suites. The workflow uploads the JSON report, both sample attachments and failure traces. `npm run check:full` retains the ordinary regression configuration and does not run these long controls. For related infrastructure changes, run the memory command locally as well as the required validation tier. These measurements remain required before broader reuse adoption under ADR 0021.

For a matched full-suite timing pair, run `npm run test:e2e:diagnose -- --shared-reset=reload --json-output=.scratch/<task>/adopted.json --workers=6 --reporter=dot,json`, then `npm run test:e2e:diagnose -- --shared-reset=fresh --json-output=.scratch/<task>/fresh.json --workers=6 --reporter=dot,json`. Use distinct report names for subsequent pairs, keeping runtime inputs, host and worker count unchanged. `node scripts/e2e-timing.mts <report>` summarizes either report. It reports launches but does not summarize `tree-reset-timing` or `tree-memory-evidence`; inspect those JSON annotations separately. Reset timing counts attempted reused launches, including intentionally rejected attempts, rather than successful resets. Fresh regression controls still contain deliberate shared reset/recovery probes. Run the shared/fresh memory controls separately with `npm run test:e2e -- --config=config/testing/playwright.memory.config.ts`.

The bounded rollout closed on 2026-10-11 with two sequential matched full-suite pairs on the local macOS GUI host, hidden windows and six workers, using runtime inputs from commit `3dff3bf`. Every run passed the same 773 cases without skips, flakes, runner errors or unexpected reset/lifecycle failures. No cases, editing categories or boundary exclusions changed.

| Execution | Launches | Reuse attempts | Summed test time | Wall time |
| --- | --- | --- | --- | --- |
| Adopted 1 | 788 | 236 | 1253.35 s | 254.01 s |
| Fresh 1 | 913 | 111 | 1427.70 s | 280.51 s |
| Adopted 2 | 788 | 236 | 1313.00 s | 257.30 s |
| Fresh 2 | 913 | 111 | 1432.38 s | 280.37 s |

Observed wall reductions were 9.4% and 8.2%; adopted wall spread was 3.29 s and fresh spread 0.15 s. These are two local pairs, not a portable saving or a duration budget. Adopted editing cases contributed 124 reuse attempts per run; infrastructure contributed 112 adopted or 111 fresh. Each run deliberately rejected three reused launch attempts and three direct reset calls, and recovered from an owned-process exit. Direct reset calls are not timing annotations. Whole-suite counts include 96 launches in the fresh memory probe, so they do not measure editing cases alone.

Each full run also sampled twelve eight-cycle shared and matched fresh memory bursts, excluding the first burst from the following ranges. Across all four runs, GC-retained renderer heap was 4.556–4.615 MiB shared versus 4.485–4.592 MiB fresh. Shared main heap rose and reclaimed within 4.523–7.937 MiB; Browser working sets were 155.594–173.781 MiB shared versus 159.500–162.453 MiB fresh. Shared renderer working sets remained higher at 146.625–164.531 MiB versus 121.688–123.547 MiB fresh. GPU working sets varied at 73.844–93.641 MiB shared versus 89.594–94.438 MiB fresh. Window/renderer counts stayed at one, pending/error IPC counts at zero, and recorded listener counts stayed constant within each mode. The earlier 384-cycle investigation also observed main-heap/Browser reclamation and higher shared renderer/GPU working sets. These observations support the current bounded adoption; they do not establish indefinite native-memory bounds or authorize wider eligibility.

#### What the memory suite can detect

Pre-release Linux memory checks must reject fast retained-memory growth and excessive sampled footprint in the maintained scenarios. The checks must demonstrate detection with deliberately retained allocations and preserve measurements on failure.

The suite rejects a sampled absolute footprint above its ceiling or growth above its allowance relative to the first sample. Every sample is checked, so a later decrease does not erase an earlier violation. Missing, non-finite, zero or negative required measurements fail closed. The common budgets in `perf/electron/memory-probe.ts` cover GC-retained renderer heap, main-process heap, main/renderer working sets and summed process working sets. Existing tighter scenario-specific heap and native-memory assertions remain. Shared/fresh controls also retain their window, renderer and IPC invariants; listener counts remain diagnostic. Shared and fresh are independently checked against fixed budgets, not just against each other. No current run can automatically raise its own budget.

Native samples require a GPU process with a positive working set. If that entry is missing, the sampler requests a small compositor capture from the measured page without showing or focusing its native window, then polls within a bounded deadline. Passive polling alone can leave hidden-window GPU work uninitialized. A capture rejected with `UnknownVizError` is retried after a short delay within the same deadline because a hidden page can lack a compositor surface after reload. Other collection, capture and polling failures fail the sample; a successful capture must be nonempty. Chromium can omit the GPU process from early `getAppMetrics()` results; using those incomplete totals as the baseline counts its later appearance as memory growth. Both shared/fresh controls and selected perf scenarios use this readiness check for every native sample. Complete samples return immediately regardless of footprint, and fixed budgets remain unchanged. A real Electron regression injects an initial compositor failure and the missing GPU entry until the capture completes, then verifies that the window stays hidden.

These selected perf scenarios now collect retained renderer heap through CDP, using the same method as shared/fresh checks. Re-record their old `performance.memory` comparison baselines before using `PERF_BASELINE`; the numerical measurements are not interchangeable. The original fresh native-footprint assertion still measures before forced collection. Common budget calibration is recorded beside the owning constants and comes from local Linux arm64 runs, not a hosted Ubuntu x64 measurement.

The shared control edits two short rows and reloads after each cycle; fresh restarts the application. Their first sample follows the first edit burst. The sustained-editing and search cases warm the running application before measuring further bursts without reload; expansion checks before/expanded/collapsed states. These scenarios exercise fast accumulation and large sampled footprints. They do not establish bounds for every workflow, image use, native macOS behavior, or peaks between measurements. Forced renderer collection measures retained JS objects, not all transient allocations. Slow leaks below the finite-run budgets are an explicitly accepted testing risk, not a relaxation of the application's bounded-memory requirement (`docs/PRODUCT.md` §22.1); no multi-hour soak is required for this gate.

Linux results do not establish macOS native-memory behavior. Local arm64 Docker and GitHub's Ubuntu runner are different measurement environments; historical macOS measurements above and in [Development Reference §4](DEVELOPMENT_REFERENCE.md#historical-macos-memory-evidence) are not Linux budgets. Electron reports native working sets in kilobytes, whereas the renderer protocol and Node heap values use bytes. Working sets include memory shared with other processes, so summing them does not measure unique physical memory. See the [Electron memory structure](https://www.electronjs.org/docs/latest/api/structures/memory-info).

`perf/electron/memory-detector.spec.ts` uses the same sampler and budget checks as real scenarios. Small allocations must pass; deliberately retained renderer arrays, main-process arrays and a page-filled native buffer must trigger the corresponding budget error. Pure tests cover noisy bounded samples, intermediate spikes, a high starting footprint and invalid measurements. A failure of either a real scenario or the detector self-check blocks the existing release gate.

Each `MemoryProbe` writes a `memory-samples.jsonl` attachment and a `MEMORY` JSON line before asserting its budget. Samples remain available when a subsequent interaction or budget assertion fails. Shared/fresh journal entries also include the raw diagnostic counters. CI uploads these partial attachments and traces through its existing always-run artifact step. Local Docker retains its offline, mount-free isolation and removes the container, but the host saves captured stdout/stderr to a unique log under `reports/electron-memory/`, including partial output on failure, before returning the original failure. These logs contain the per-sample JSON; local trace files remain inside the disposable container. The bounded output buffer fails the run if exhausted rather than reporting success.

#### E2E diagnostics and fixtures

The diagnostic workflow runs the existing build and E2E command with three optional settings: `--shared-reset=fresh|reload|window`, `--memory-burst-size=<positive integer>`, and `--json-output=<path>`. Use the `=VALUE` form. Other arguments are forwarded unchanged to Playwright without shell interpretation. Omitted settings retain the inherited environment; `fresh` explicitly sets `TREE_E2E_SHARED_RESET=off`, overriding inherited reuse for both prototype and adopted owners. For a JSON report, also select a JSON reporter, for example `npm run test:e2e:diagnose -- --shared-reset=fresh --json-output=.scratch/e2e-comparison/tree-fresh.json e2e/electron/navigation.spec.ts --repeat-each=5 --workers=6 --reporter=dot,json`. A report in `.scratch/` survives the next Playwright run's `test-results/` cleanup and remains inside the repository's file-access boundary. This workflow supports the named diagnostic variables only, not arbitrary environment assignments or commands.

Hidden mode still requires a display: a macOS GUI session on macOS, or the documented Xvfb display on Linux. It does not make Electron headless.

Clipboard helpers acquire the machine-global clipboard lock automatically. Native Copy/Cut/Paste and context-menu interactions must acquire it explicitly through `lockSystemClipboard()` when no preceding helper already holds it. Acquire immediately before clipboard work, and release through `unlockSystemClipboard()` once assertions establish that all asynchronous clipboard reads/writes are finished and no subsequent interaction needs the contents. A completed paste or a pending attachment write that has already received the image bytes no longer needs the clipboard lock during persistence, quit-failure waits, screenshots, or restart checks. Reacquire and rewrite before a later independent paste; keep Copy/Cut-to-Paste sequences and clipboard assertions under one uninterrupted lock. Fixture teardown remains the release fallback. Full-suite diagnostics on 2026-10-11 found two quit-failure tests holding the lock for over five seconds each and other tests waiting up to seven seconds.

Agenda scenarios call `setAgendaToday(window)` after launch and before opening Agenda. The helper fixes the renderer's `Date` to the synthetic calendar date used by the Agenda specification. It also installs the Playwright page clock, whose timers and animation frames keep running in real time until a test fast-forwards them.

A test that asserts a change persisted by the idle save of `docs/PRODUCT.md` §16.1 does not wait for the real idle interval. It calls `fireIdleSave(window)` and then polls the persisted file with `idleSavePoll`. `fireIdleSave` fast-forwards the Playwright page clock by `SAVE_IDLE_MILLISECONDS`; the first `window.clock` call in the test, such as `setAgendaToday`, replaces the page timers and must precede the edit that arms the idle timer. `idleSavePoll` times out at half the interval, so a test whose timer was armed before the clock was installed fails instead of silently waiting. Tests that measure save timing itself, such as save-failure retries and quit flushing, keep real time. Before this rule, idle-save waits took about half of the E2E suite's summed test time (measured 2026-10-11).

Undo inactivity tests install the renderer clock before typing and advance it across the session boundary, retaining real keyboard edits and undo assertions. The queued-save `Cmd+Q` test uses a short edit that triggers a volume save and gates the registered save handler through `__treeIpc`. It observes the quit request while the save is pending, then releases the original handler and checks the persisted text after exit. This avoids long typing races while preserving the real shortcut, IPC and filesystem path.

Notes export and import tests (`e2e/electron/notes-archive-boundary.spec.ts`) stub the native save and open panels and `shell.showItemInFolder` through `app.evaluate`, because Playwright cannot drive `NSSavePanel` or `NSOpenPanel`. To cancel or quit at a known point, the test-owned entry wraps `worker_threads.Worker`: message types listed in `globalThis.__treeArchiveWorkers.hold` are queued instead of delivered, so the worker's finished file or staging directory exists while the main process has not used it yet. The production worker, controller and file system stay unchanged.

The duplicate-request timeout case uses `captureQuitTimer` from `e2e/electron/quit-timer.ts`. It gates the production save handler, expires the five-second main-process timer, releases the disk write and verifies that the expired renderer attempt does not acknowledge a retry. A reported save failure instead cancels its own request immediately. Failure and locked-state cases retry directly. `src/electron/main/quit-handshake.test.ts` covers timer identity and duplicate requests. The helper never advances unrelated main-process timers.

An assertion that an action leaves persisted state unchanged must also let an idle save become due. Install the page clock before the action, call `fireIdleSave(window)`, and await a renderer `treeApi.load()` read before comparing persisted snapshots. The read queues behind disk writes in the main process, so the comparison cannot pass just because an unintended save has not finished. Polling for equality alone can pass immediately against the old snapshot. Prove these assertions detect unintended edits with a temporary test-owned mutation, then restore it.

Date-completion scenarios use the same clock in Tree and Agenda. `e2e/electron/agenda-completion.spec.ts` checks both editing modes, popup geometry, explicit keyboard and mouse acceptance, suffix preservation, history, uncertain fragments and paste suppression. Composition is verified with renderer-level event contract sequences. When completion shortcuts change, also check `Ctrl+N`, `Ctrl+P`, Tab and Escape through a native macOS keyboard in a visible isolated synthetic profile; Playwright key events alone do not establish native routing.

Drag tests start a gesture through `startRowDrag` in `e2e/electron/fixtures.ts`. A visible run happens on a live desktop, so that helper verifies the active drag survives a short settling window and retries the gesture a bounded number of times, since a window that loses focus releases pointer capture and the application cancels the drag by design. The hidden default removes desktop focus changes from the gesture, and the bounded retries remain for visible runs.

Use synthetic document seeds for repeated drag setup when typing is only preparation. Establish the required selected row, editing mode, focus and caret before the real pointer action. Depth-limit drag cases seed expanded branches; `inline-expansion.spec.ts` retains real disclosure interactions. Keep actual typing in cases whose failure depends on pending edits or history; `editing.spec.ts` and `history.spec.ts` retain real text entry, Enter and undo coverage. `node-drag.test.ts` owns gesture rules and geometry bands, while Electron cases retain native selection, pointer capture, focus restoration and rendered feedback.

Breadcrumb drag coverage in `e2e/electron/drag-and-drop-hierarchy.spec.ts` checks toolbar destinations, focus/mode transitions, and both visible and hidden restored move sites after undo. Native pointer capture can also fail without a lost-capture event; renderer tests exercise outside-list move, release, invalid-target, and cancellation events through the same gesture handlers, so toolbar coverage does not assume capture succeeded.

Window addressing in `e2e/electron/fixtures.ts` is focus-independent for the same reason: closing, resizing, or reading the main window through `closeMainWindow`, `setMainWindowBounds`, and `readMainWindowBounds` addresses the application's window directly instead of relying on the application being frontmost, so the window-close flush and quit path stays testable while the application is inactive.

Playwright enables Chromium focus emulation, so a native window blur can leave `document.hasFocus()` true in an ordinary test. A test of actual application focus loss must use an isolated visible window, disable `Emulation.setFocusEmulationEnabled` through its page's CDP session, and assert both focus loss and return before testing the next edit or motion. Keep this exception local to the boundary test; do not disable focus emulation across the suite. `e2e/electron/selection-interruptions.spec.ts` covers the Visual continuation boundary on macOS; its modal cases also run on Linux.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**` and the `test-results/**` scratch directory where finished diagnostic specs are parked. Each Playwright target reads only its own directory under `e2e/`.

Native editor context-menu behavior is covered by renderer and IPC contract tests. The macOS popup itself must be product-verified on supported macOS hardware with a display because the Playwright Electron driver cannot reliably inspect or select native menu items; use a visible suite run (`TREE_E2E_VISIBLE=1 npm run test:e2e`) when the popup must be observed. The popup only captures a small selection snapshot and does not add persistence work, tree traversal, or retained state; disk writes, interactive CPU, and memory growth remain unchanged outside the selected editing command.

### Defect regression workflow

The defect-first and boundary-testing rules are defined in `AGENTS.md` §9 and procedure §9 (`docs/AGENT_WORKFLOW.md`). Boundary contract tests live next to the implementation; end-to-end tests live in `e2e/`. Use unit tests for deterministic state-machine branches and E2E tests for the real Electron wiring.

### Navigation and caret changes

Navigation and caret behavior must be designed and reviewed as a state-transition matrix, not as isolated key fixes. The matrix must cover:

* entry motions (`h`, `j`, `k`, `l`, boundary motions, counted motions, and pointer/focus restoration when applicable);
* exit motions and repeated-key behavior;
* text-caret positions (beginning, middle, final character, and empty text);
* node context (root, current parent, sibling, child, attached image, and image-only node); and
* expected destination caret state, including whether an image caret is active and which text position must be restored.

Build the affected-path inventory before editing code. Start from the state being changed (selected node, text cursor, saved image-entry position, image-caret indicator, selection, or mode) and trace every relevant writer and caller, not only the command that exposed the defect. Include keyboard commands, counted and repeated commands, pointer/focus changes, node entry and exit, edits, undo/redo, and mode changes when they can affect that state. For each buffered or transient editing session (including Replace mode), explicitly inventory what happens when each relevant command arrives before the session's ordinary finish event: whether the edit is committed or discarded, whether the command acts before or after that resolution, and the resulting selection, cursor, active caret, and mode. Do not assume shortcut handlers follow the same path as ordinary mode-specific key handling. Include transitions where the selected node ID stays the same or a motion clamps at a boundary. For each affected path, record the starting state, action, expected selected node, text cursor, active caret, restored position when applicable, and mode. Map it to focused coverage and the representative Electron coverage of its distinct integration or rendering path; several rule variants may share that Electron case. Explain any inapplicable path. Update the inventory when a newly discovered path changes the affected state; avoid expanding it to unrelated commands.

For a temporary interaction such as Find, verify the first edit or motion after cancellation as well as the restored mode and selection. For example, select text, enter a matching query, cancel Find, then type or extend a Visual selection and delete it; verify Undo when relevant. Choose data that triggers the affected rendering transition: matching highlights can replace a textarea with rich text or update rich-text nodes, while a no-match query misses that transition. Keep state/data combinations in focused App or hook tests, with representative Electron coverage for real focus and input dispatch.

The current Vim requirement-to-test inventory is in [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md), which also defines the divergence marker and what a row without it claims. The implementation review must check each affected row against both the behavior and its marker.

The invariant for an attached image is explicit: the image is a separate character; entering it records the originating text caret; leaving it either restores that recorded caret or, when crossing to another node, applies the documented destination position. Every entry path and every exit path must have focused unit coverage and end-to-end coverage for the representative process boundary. Tests must include at least one non-final text position, a same-node round trip, a cross-node transition, and a repeated motion at the boundary.

A screenshot or a single happy-path test is not sufficient evidence for navigation or caret work. The implementation review must trace each affected state-changing path in the code, compare its resulting state and tests against the inventory and matrix, and explicitly report any intentionally unsupported combination. When several defects involve the same state, review whether multiple owners or scattered resynchronization calls are causing omissions; record the conclusion and address a confirmed design cause within the authorized scope.

### Input-path consistency

`docs/PRODUCT.md` §20.7 requires the same result from every input path to a state. Before changing a command, control, overlay, or focus target, list every path that reaches it (pointer, each keyboard shortcut, Vim key, menu item, restored session). Use focused tests for rule variants and command mappings. Give each distinct dispatch, native/DOM interaction or rendering path representative E2E assertions on the relevant resulting appearance, focus, caret and selection. Paths may share a representative E2E when they use the same handler and have the same relevant native/DOM behavior; verify that equivalence from the implementation and focused tests. A different handler or native behavior needs its own boundary evidence. Compare paths in one test where the state allows it; do not repeat the entire data/state matrix through each path. Two causes recur and deserve a direct check:

* Browser heuristics tied to the last input device. `:focus-visible` on an element focused by script shows its ring after a keyboard action and hides it after a mouse action. Style a programmatically focused control with `:focus`, and keep `:focus-visible` for controls the user focuses directly.
* A handler wired to one event type. A pointer handler that sets focus or state before it calls the shared command, and a keyboard handler that does not, produce different results from one command.

Playwright's default light color-scheme emulation and its synthetic pointer events can hide or fake such differences, so the assertion reads computed style or state after each real input path, as `e2e/electron/preview.spec.ts` does for the image preview close button.

### Vim end-to-end coverage

Keep Vim coverage layered. Caret arithmetic and clamps, counts, image return positions, session commit ordering, mode transitions, and dot-repeat bookkeeping belong in the focused suites (`src/renderer/vim-*.test.ts`, `vim-*.property.test.ts`, `editor-input-handlers.test.ts`, `use-node-input-bindings.test.tsx`). Handler-level fixtures paint the resolved caret themselves, so they cannot detect a competing or omitted projection in the production hook; `use-node-input-bindings.property.test.tsx` runs generated sequences through `useNodeInputBindings` with a real `EditorStore`, flushes deferred focus work at arbitrary points, and checks the DOM caret, image indicator, and an `Enter` preview probe against the independent model in `src/renderer/test/vim-sequence-model.ts`. Its fixture supplies only the rendered text and the image class, so it does not replace the Electron specs for native focus, pointer timing, real rendering, or contenteditable. Keep a case in the Vim end-to-end specs (`e2e/electron/vim-image-caret.spec.ts`, `e2e/electron/vim-text-editing.spec.ts`, or `e2e/electron/vim-navigation-and-visual.spec.ts`) when it proves something those suites cannot: application shortcut dispatch, real keyboard, pointer, blur, or focus sequences, attachment rendering, or a committed light/dark screenshot baseline. Before removing a case, confirm that a focused test covers the same rule, that a retained case still exercises the boundary or the rendered state, and that it is not the last real-Electron coverage of a shortcut's dispatch path, a pointer, blur, or focus trigger, a pending-session commit, or an image-caret rendered state. Update [VIM_CONFORMANCE.md](VIM_CONFORMANCE.md) in the same change: name focused rule coverage and the retained representative for each distinct native boundary or rendered state; several rule rows may share that representative. A real EditorStore by itself does not require Electron because the App and hook harnesses already use it. `npm run check:docs` verifies that every test name it cites still names an existing test. Snapshot baselines that only a removed case referenced become orphans; remove them when the session's file-operation permissions allow it, and otherwise list the exact paths for the handoff. A suite-composition change is a test and documentation change for §9 purposes; re-measure the focused E2E suite with the same command and environment as its recorded baseline.

Vim command sequences that need a shifted continuation key must be tested in physical key order. A real keyboard fires the modifier's own keydown before the key it modifies — `Shift` before `O` in `zO`, `$` in `d$`, `A` in `rA`, or `{` in `ys{` — and that keydown must not consume the pending command. A test that dispatches only the capital or shifted key event (for example Playwright's `press('O')` or a focused test that sends `key: 'O'` directly) does not exercise that order and can hide a defect that breaks physical typing. Use `pressShifted` from `e2e/electron/fixtures.ts` for real-boundary cases, and in focused tests send the bare modifier keydown explicitly between the prefix and its continuation.

The same event-sequence fidelity applies wherever handler behavior depends on platform-generated surrounding events, such as lock or dead keys, native composition, or key repeat. A helper or double that collapses a physical keypress into one synthetic event can stay green while real typing is broken, so model the event sequence the platform actually delivers whenever the handler observes more than the logical key. Native IME composition cannot be driven through Playwright, so composition handling is verified with unit-level contract sequences; do not claim real-IME end-to-end coverage.

### Editing-mode end-to-end coverage

[ADR 0021](decisions/0021-worker-owned-e2e-application-reuse.md) records the bounded shared-application isolation model. Adoption is complete for navigation and eligible Tab structure, Vim text-editing and Vim navigation/selection cases. The global fixture default remains fresh. Each additional opted-in owner must prove its reset contract, while fresh-process boundary coverage and both editing modes remain.

Standard editing is the first-run default and Vim editing is a permanent mode (`docs/PRODUCT.md` §20.2.1), so an E2E assertion whose behavior can differ between them must run in both. Choose mode coverage from the asserted behavior and its dispatch/rendering path. Typing or another mode-sensitive action used only to prepare a scenario does not by itself require repeating that scenario in both modes; its setup outcome must still be checked. Standard editing is Vim Insert without the Vim key handler, so the modes differ only at a few points: the startup mode and restored caret, `Escape` and undo grouping, pointer handling in an editor, rendering of the caret and selection, the status-bar layout, the image preview, and the application commands that Vim pre-resolves (`Cmd+A/C/X/V`, `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, `Cmd+Z`, `Cmd+E`, `Cmd+Enter`, and the context-menu Cut and Paste).

`launchTree` writes the Vim preference from the Playwright option fixture `editingMode` (`'vim'` by default) unless the test passes `vimPreference` itself. `describeForEachEditingMode(title, body)` in `e2e/electron/fixtures.ts` runs a describe body once per mode, names each block `<title> [vim editing]` or `<title> [standard editing]`, and hands the body a `screenshotName` function that gives each mode its own baseline (`name-vim.png`, `name-standard.png`). Tests whose behavior exists only in Vim sit in a separate `Vim editing only` describe block of the same file, outside the helper.

Every spec file under `e2e/` (Electron, browser and smoke) declares one category on its first line, as `// @editing-modes: <category>`, and `npm run check:e2e-modes` enforces it:

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
7. agent permission checks (`npm run check:permissions`);
8. tests with coverage enforcement;
9. production build.

Timing suites run locally when the affected performance paths require them under procedure §10. A release alone does not require another timing run. They are not part of `npm run check` or CI. Functional and bounded-heap regression tests remain in the unit suite.

Schedule E2E and performance commands sequentially with all other test commands,
as required by procedure §10. In particular, wait for `npm run check` (including
coverage) to finish before starting E2E; finish E2E before starting performance
tests. Preserve each suite's configured internal worker settings.

For the development-only low/moderate audit exception in procedure §10, retain the
full `npm audit` result and use `npm audit --omit=dev` to check the production
graph. Inspect the affected paths before applying the exception. A nonzero full
audit remains a reported finding, even when the exception permits committing.

The documentation governance command accepts `--group links|tests|decisions|structure` for separate CI steps. Without arguments it checks every category: ADR metadata and indexing, relative links, ADR and test references, and documentation structure including restated product quantities outside the specification (`docs/PRODUCT.md` and `docs/product/`), the size limits and file structure of the specification, and the agreement between its index and the files under `docs/product/` (section 12 of this document). Link, ADR-reference and quantity checks cover only the live documents selected by `collectLiveDocuments` in `scripts/check-docs.mts`, which includes every Markdown file directly under `docs/product/`. The link check verifies that the target file exists; it does not validate heading anchors.

It also scans Git-tracked and new nonignored Markdown for explicit scratch-file dependencies, including inline paths, Markdown links and reference definitions. Source copies without Git metadata are scanned recursively, excluding generated and scratch directories. Unfinished plans linked from `plans/README.md` and `WORKING_PLAN.md` may retain continuation evidence; a `Status: Completed`, `Closed`, `Done`, or `Retired` in the plan or its index row removes that exception. Directory paths ending in `/`, placeholders, fenced examples, and inline commands starting with a supported command name are allowed. This syntactic check complements the documentation and plan-closure review in `docs/AGENT_WORKFLOW.md` §11; it cannot determine whether prose states every lasting conclusion.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This local command runs `npm run check`, the serial timing guards, the Electron end-to-end suite, the full Electron performance suite, and finally the dependency audit (`npm audit`), so an advisory without an available fix reports after the suites rather than hiding their results. It is a local convenience command, not the default for every High Risk change. Use it when the full performance stage is required or explicitly requested; otherwise run the stages selected below. The normative validation policy is in `AGENTS.md` §10 and [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#10-validation).

Neither `check` nor `check:full` establishes parity with GitHub Actions. `check`
does not run smoke or E2E tests; `check:full` adds local Electron E2E but not the
browser E2E suite, smoke checks, or the Linux Electron container subset. For a
changed shared UI flow, select its smoke and browser scenarios as well as its
Electron coverage under procedure §9. Use `make test-smoke` for all smoke targets,
`npm run test:web:chromium` for browser E2E and `npm run test:e2e:linux` for the
Linux Electron subset when those targets are required. Record the source revision,
uncommitted changes and actual targets checked; a green aggregate command alone
does not establish that a changed scenario ran.

Chromium container tests, GitHub Actions with its scroll-rendering, smoke-check and naming subsections, and build and test configuration are in [Development Reference §1, Validation Infrastructure](DEVELOPMENT_REFERENCE.md#1-validation-infrastructure); README screenshot maintenance and demo video generation are in [Development Reference §2, README Media](DEVELOPMENT_REFERENCE.md#2-readme-media).

The `Enforce agent attribution policy` workflow runs `scripts/check-attribution.mts` on every pull request. It fails the check when the pull request description or any of its commits carries an agent co-authorship or "generated with/by" line, per `AGENTS.md` §12. This is the server-side backstop described in §3; for the commits of a pull request it holds regardless of whether the author's machine had the `commit-msg` hook installed. It does not run on direct pushes to `main`.

### Risk-Based Validation

Use the highest applicable functional-validation tier. Select Electron performance scope separately under [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#selecting-performance-checks). Focused checks may be run during implementation, but they do not substitute for a broader required functional tier.

| Tier | Change risk | Required validation |
| --- | --- | --- |
| Minimal Risk | Documentation or content only, with no executable configuration change | Run `npm run format:check:changed` and `npm run check:docs`. Also run `npm run check:permissions` when agent workflow documentation changes. |
| Low Risk | Executable tooling or configuration, tests, or an isolated non-runtime refactor | Run affected type, lint, formatting, governance, and focused test checks. Run `npm run check` when executable source, dependency metadata, build configuration, or validation tooling changes. Agent-prompt documentation remains Minimal Risk unless executable configuration such as `.claude/settings.json` or `.codex/rules/` changes. |
| Moderate Risk | Product, domain, or renderer behavior contained within one process, without a persistence or platform boundary | Run `npm run check`, affected unit or property tests, and focused E2E coverage for every affected user-visible requirement. Broaden E2E coverage when shared interaction or lifecycle infrastructure changes. Perform product verification of the changed flows. Select performance checks separately under procedure §10, preserving `docs/PRODUCT.md` §22 and the assessment and scale-guard obligations of procedure §4. |
| High Risk | Process, IPC, filesystem, persistence, clipboard, attachment, native shortcut, startup, shutdown, security, dependency, toolchain, shared fixture, or scale-sensitive state changes | Run `npm run check`, the full local E2E suite (`npm run test:e2e`), and `npm run audit`; retain the unit, contract, real-boundary, and failure-path coverage required by `AGENTS.md` §9, applicable security checks, and visible verification for native behavior automation cannot inspect. Select performance checks separately under procedure §10. Use `npm run check:full` when the full Electron performance suite is also required. |

When categories overlap or the tier is uncertain, use the higher tier. A suite that cannot execute its real boundary is blocked, not passed.

For selected Electron performance scenarios, use `npm run test:perf -- <specs>` and optionally `--grep <pattern>`. Use `npm run test:perf -- --project=electron` for the full Electron performance suite; `npm run test:perf` also runs the browser scenarios of §12. The serial runner and measurement mechanics are described in §12. Record the selected scope and performance rationale with the functional-validation evidence; no Electron performance run is needed when there is no concrete performance trigger under procedure §10. `npm run check` includes functional and bounded-memory guards; timing guards run separately through `npm run test:performance` when selected under procedure §10.

### Local affected-spec E2E validation

For contained changes below High Risk, run affected E2E specs locally and leave the complete suite to the weekly/manual Linux and macOS CI jobs. `npm run test:e2e:changed` builds the application and runs Playwright with `--only-changed=HEAD`; it includes staged, unstaged and untracked nonignored changes before commit, then follows test imports. Preview its selection with `npm run test:e2e:changed -- --list`. After committing, compare with the task's starting commit using `npm run test:e2e:changed -- --only-changed=<starting-commit>`; the referenced commit must exist locally. Additional spec arguments restrict the selected set rather than adding missing specs.

The selector does not infer test coverage through the Electron production build, preload/IPC or product-requirement mapping. For each affected behavior, explicitly select its owning specs with `npm run test:e2e -- <specs>` when they are absent from the changed selection. Record the actual specs/cases exercised. Playwright can exit successfully with no selected cases; this is a selection result, not a passing boundary test. Documentation-only tasks do not acquire an E2E requirement merely because this command exists.

Shared fixture or interaction infrastructure, startup/shutdown, process/IPC, filesystem/persistence, clipboard/attachments, native shortcuts, security, dependencies/toolchain and scale-sensitive changes still require full local functional validation under the High Risk row. Unbounded functional impact also requires broader coverage. Electron performance scope is selected separately. Weekly/manual CI covers every regression case through the Linux/macOS union; this command does not filter CI or the serial visible performance suite. Regressions outside the locally exercised scope may first appear in the next weekly or manual run.

For a contained change, use a concise conversation plan, a focused development loop, the tier's required validation, and a primary-agent diff review. Add a working plan, independent reviewer, or separate product verifier only under the triggers in `AGENTS.md` §§8 and 13. A user-visible change still needs product verification by the primary agent when no separate verifier is required. Keep defect-first regressions, boundary tests, and visual evidence whenever their specific triggers in `AGENTS.md` §9 apply.

Classify the complete change, not only its purpose. For example, a workflow-documentation change that also modifies a validation script or its tests is Low Risk because executable validation tooling changed.

`npm run format:check:changed` is the canonical scoped formatting check. It checks supported staged, unstaged, and non-ignored untracked files relative to `HEAD`, excludes deleted files and symbolic links, safely passes filenames without shell interpolation, and succeeds with an explicit message when there are no eligible files. Changed source files remain eligible even when another path links to them. The full-repository `npm run format:check` remains part of broader validation.

### Screenshot Rendering Scale

The E2E fixture also passes `--force-color-profile=srgb` before the test entry. PNG
comparisons use encoded RGB channels without applying embedded ICC profiles. A
display-profile capture can therefore differ from an sRGB baseline even when a
color-managed viewer displays both correctly. Keep screenshot colors independent
of the attached display. The color regression in `screenshot-stability.spec.ts`
checks the encoded channels of known CSS and image swatches without applying a
profile during decoding. Do not remove a PNG profile as a substitute for capturing
in sRGB: that leaves the converted channels unchanged.

The E2E fixture passes `--force-device-scale-factor=1` in Electron's launch arguments, before the test entry, and asserts `window.devicePixelRatio === 1` after launch. This makes screenshot rasterization independent of the attached display's backing scale. Keep GPU rendering and the existing Playwright comparison settings: CSS-sized output does not by itself fix the scale at which Chromium draws glyphs. The performance fixture retains the native display scale for presented-window measurements.

The fixture also passes `-AppleShowScrollBars WhenScrolling` after the test entry and asserts after launch that a scrolling element reserves no scrollbar width. macOS shows classic scrollbars when no trackpad is attached, as on GitHub Actions runners; a classic scrollbar narrows the scrolling area by 15 pixels and shifts the centered outline, so every screenshot of overflowing content differs from baselines captured with overlay scrollbars. The value is a user-defaults argument rather than a Chromium switch, and it must follow the entry, or Electron treats it as the application path.

The investigation on 2026-10-05 at `b47725a` reproduced a scale mismatch without changing application code or baselines: the three light strikethrough screenshots failed at startup scale 1 and passed at startup scale 2. Existing punctuation screenshots passed serial, parallel, and visible runs at scale 1. A screenshot stability regression failed when consecutive launches used startup scales 2 and 1, then passed after the canonical launch override. Setting the scale through `app.commandLine.appendSwitch` in the test entry or through a later CDP metrics override did not reproduce the launch-time scale change. Hidden versus visible windows produced identical diagnostic frames; GPU versus CPU rasterization changed edge pixels but did not resolve the failing strikethrough comparisons. These experiments establish display scale as a reproducible cause; they do not establish the trigger of the failures reported from the earlier session.

`e2e/electron/screenshot-stability.spec.ts` checks both editing modes and appearances, repeated exact PNG captures across conflicting startup scale arguments, the received Chromium switch, and the effective renderer scale. It also verifies that a one-pixel text translation changes the image. Run its serial and parallel repeat guards after changing rendering or launch infrastructure:

```bash
npm run test:e2e -- e2e/electron/screenshot-stability.spec.ts --repeat-each=5 --workers=1
npm run test:e2e -- e2e/electron/screenshot-stability.spec.ts --repeat-each=12 --workers=6
```

Also repeat an existing `toHaveScreenshot` test, such as `e2e/electron/typed-input.spec.ts --grep 'operator-like punctuation'`, under both worker counts. Do not regenerate baselines merely because a comparison failed: first verify the canonical scale and inspect actual, expected, and diff images. Regenerate only baselines that disagree with confirmed stable rendering, and inspect every changed baseline under the visual workflow below. The scale decision is recorded in [ADR 0019](decisions/0019-canonical-e2e-rendering-scale.md). These checks cover canonical screenshot rendering. The Product Owner verifies native Retina presentation through the regular application (`npm run dev`) on a Retina display.

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

For a rendering-sensitive change as defined by the visual-regression workflow of procedure §9 (`docs/AGENT_WORKFLOW.md`), add a separate visual-evidence record after the command results:

```text
- Visual evidence: <affected states inspected>
  Command and artifact: <exact command and screenshot path>
  Result: pass | fail | blocked
  Snapshot: <HEAD and digest from npm run validation:snapshot>
  Notes: <what was visually confirmed, including relevant interaction states>
```

The smallest representative state set is preferred. For focus, caret, selection, or mode styling, that set must include an equivalent focused and unfocused element, plus the transition between them when the state can persist across components. This includes neighboring or repeated components when styling could leak from the active one. The geometry-assertion and evidence-reuse rules are in procedure §9. Automated DOM, CSS-class, computed-style, geometry, and screenshot tests complement one another: a passing non-image assertion does not establish visual correctness, and a screenshot baseline must be deliberately inspected when it is created or updated. Inspecting means answering one question for every text run in the image: does each character appear exactly as stored, in the stored order, without a joined, shifted, missing, or substituted glyph? Read the stored text from the test's own seed or typed input and compare it with the picture character by character; a baseline that merely looks plausible is not inspected. A baseline of text drawn by the bundled typeface is the case this question exists for: before the fix in `c085f1e`, committed baselines showed `https: //example` because the typeface joined `://` into a ligature, and the tests had accepted it. `e2e/electron/text-fidelity.spec.ts` compares risky character sequences with a character-by-character reference, and `e2e/electron/typed-input.spec.ts` types realistic lines key by key; add a string to the first when a new sequence draws oddly, and a line to the second when typing a new kind of text matters.

When the Product Owner reports a defect that the suites did not catch, name in the handoff the test level that should have caught it (domain, hook or component, real-renderer end to end, screenshot, performance, or manual native-keyboard check) and the reason it did not, and add the missing coverage at that level together with the fix. Keystroke dispatch through Playwright is not native macOS text input: input-method composition, system autocorrection, and key repeat are not exercised, so the Product Owner also checks a change to input handling by hand in `npm run dev` with the real keyboard.

When inline rich text can wrap or fragment across lines, include deterministic synthetic content that wraps and inspect the affected line fragments and caret or selection boundary in the real renderer.

For changes to appearance, window creation, renderer loading or reloading, or closing, verify `docs/PRODUCT.md` §20.5 in both light and dark appearances. Run `npm run test:e2e:visible -- e2e/electron/window-appearance.spec.ts --workers=1` for the native background regression and inspect the affected lifecycle transitions with a visible Electron window. Include startup and closing when window lifecycle or appearance changes; include reload and system appearance switching when those paths are affected. Observe the transition itself, using a screen recording when needed to inspect brief flashes. A screenshot of the loaded editor, a computed CSS color, or a native background value at a checkpoint cannot establish that a transition is free of flashes. Record the observed transitions, appearance, command, and outcome as visual evidence, and identify any transition that could not be observed as unverified. Reuse still-valid evidence under the rules below; documentation-only changes do not require a new visual run.

Apply the evidence reuse and invalidation rules in [Agent Workflow Procedures §10](AGENT_WORKFLOW.md#10-validation). For the commands here, `npm run check:full` subsumes the `npm run check`, E2E, and performance stages it contains; `npm run check` subsumes its listed stages. Documentation-only edits require documentation and formatting checks, plus the agent permission check when agent workflow files change, as specified by the risk matrix.

If an aggregate command fails or is blocked after some stages pass, record the aggregate command's actual result; never relabel it as passed. Its completed successful stages remain reusable when their inputs are still valid. Run every failed, blocked, or not-run required stage separately on the same snapshot. The required tier is then satisfied by composed stage evidence, recorded as the aggregate attempt plus the supplemental commands. A later edit invalidates only the affected evidence under the rules above.

Pass the validation record to review roles. They consume still-valid results and run an automated check again only for an uncovered scenario, stale or incomplete evidence, or a finding that requires it. Reruns after a fix follow procedure §10.

An E2E suite that cannot launch Electron or execute the relevant boundary is not a passing validation result. Report the exact environment failure and rerun the suite on supported macOS hardware with an available display before claiming full validation.

Security-sensitive changes must also verify the Electron boundary tests, including IPC validation, renderer navigation restrictions, attachment validation, and the production content security policy. Run `npm audit` when the network is available; a registry connectivity failure must be reported rather than treated as a clean audit result.

Shutdown and attachment changes should also verify that queued renderer saves are flushed before quit and that non-PNG or malformed image bytes are rejected at the main-process boundary.

The E2E and performance fixtures continuously observe the renderer's persistence and operation error messages. Any visible `.save-error` occurrence fails the test, including transient `Changes could not be saved:` and `Operation failed:` messages that disappear before the test completes. New persistence or autosave work must retain this guard and include a regression scenario for rapid edits or overlapping saves.

The fixtures register each launched Electron child process before waiting for readiness. Teardown requests the application shutdown handshake, waits on the child process exit event, then uses bounded SIGTERM/SIGKILL escalation and fails if the owned process remains alive. Per-test teardown runs in the isolated-data fixture rather than a module-level hook, because Playwright caches imported helper modules for a worker's lifetime and a module-level hook would apply only to the first test file; the save-error guard and the clipboard-lock release share that teardown. Save-status observation uses both a DOM mutation observer and a final collection, so transient document-save and attachment-cleanup errors are retained even if the status disappears before test teardown. Observations are released with their owning app, so restart tests never query stale Playwright pages during worker teardown.

The E2E and performance `launchTree` helpers write the Vim editing preference as enabled before launch, because most suites exercise Vim editing; an E2E test passes `vimPreference: false` for standard editing, or `'saved'` to keep what an earlier launch persisted or to observe the first-run default. With Vim enabled, the helpers start an Insert session for ordinary editing suites; Vim tests pass `initialMode: 'normal'` to verify the application's Normal-mode startup. The E2E `typeInto` helper also enters Insert mode when needed and restores a textarea's insertion position before typing. Tests that assert Normal-mode key handling press the keys directly instead of using that helper.

If Electron shows a macOS crash dialog or a full suite fails during application launch, first treat it as a process-lifecycle failure. The E2E fixtures clean up stale applications per worker through their own `tree-e2e-p<pid>-` marker, and `e2e/electron/global-setup.ts` removes leftovers from earlier runs before any worker starts. The performance fixtures clean up only stale Electron processes carrying their own temporary `tree-perf-*` user-data marker. Cleanup retries after launch failure and the launch error is included in the test failure. Do not use an unrestricted Electron process kill because it may terminate unrelated applications. After cleanup, rerun the isolated failing test and then the complete suite.

File-service diagnostics identify `load`, `save`, `writeAttachment`, `readAttachment`, `readAttachmentDimensions`, `cleanupAttachments`, `replaceNotes`, and `snapshotDocuments` operations, their phase, and the paths involved. Failures are logged with the original error message.

---

## 10. Development Workflow

### Shared agent instructions

`AGENTS.md` is the compact workflow core and policy owner. Its action table requires relevant sections of [Agent Workflow Procedures](AGENT_WORKFLOW.md) before those actions; a link does not load a section automatically. The supplement retains the matching section numbers. This guide owns validation mechanics, while `docs/AGENT_ROLES.md` owns role contracts. Keep shared behavior in these sources rather than copying it into the tool adapters. `npm run check:docs` checks the core size (at most 24 KiB), routing links, and the supplement as a live document. These checks establish document structure, not model compliance or actual client loading.

### Task capability check

At bootstrap, apply the capability policy in `AGENTS.md` to the selected task. Identify the needed file inspection and editing tools, validation commands and environment, artifact inspection or native interaction tools, external evidence access, and any required independent roles. Omit capabilities the task does not use. `npm run doctor` checks development-environment prerequisites when relevant; it does not establish the agent's runtime permissions or ability to inspect a native interface.

For each needed capability, distinguish **configured** (declared by settings or exposed tools), **verified in this session** (a successful operation with the relevant scope), and **unavailable** (a missing tool or observed denial/failure). Record the operation or limitation in the conversation plan, or in `WORKING_PLAN.md` when one is required. Update the record when ordinary task operations provide new evidence. Do not repeat a successful check unless the relevant session, permissions, environment, or scope changes.

During initiative planning, inventory mandatory verification for every task before estimating owner involvement. Record automated checks, owner-required checks and unresolved capabilities separately. For each potential owner check, name the task, requirement, why available automation is insufficient, the concrete interaction and expected result, and its pre-commit or milestone timing. Count verification rounds separately from checks; group compatible checks only when their completion gates permit it. Publish confirmed counts and possible additional rounds before implementation approval. The primary performs any authorized bounded runtime preflight that the read-only planner cannot perform. Unknown capabilities remain unknown until checked; revise the estimate promptly when evidence changes it.

Use inspection and the first necessary operation as evidence rather than launching full suites or all roles merely to probe access. Confirm required role availability before implementation and its actual access on its first authorized invocation. An exposed editing tool is configured until an authorized edit succeeds; do not write disposable files just to test permissions. A successful command establishes access to that command and scope only. Automated Electron interaction, screenshot inspection, and manual native input are distinct capabilities.

When access is missing, use an already authorized supported alternative if it satisfies the same requirement. Follow the tool's approval mechanism when additional permission is necessary; never bypass a denial, broaden permissions, or weaken role restrictions to complete the check. Report the blocked requirement and supported next action early, and continue work that does not depend on it. The Product Owner should be asked only when their action or decision is needed under `AGENTS.md` §14.

Per-tool configuration of Claude Code and Codex, including the mutation-testing and Safari allowances, is in [Development Reference §3, Agent Tool Configuration](DEVELOPMENT_REFERENCE.md#3-agent-tool-configuration); the on-device summarization build is described in [§1](DEVELOPMENT_REFERENCE.md#on-device-summarization).

Before fixing a reported defect, run `npm run fix:history` — with no arguments it inspects the fix at `HEAD` or the working-tree diff, and it takes repository-relative paths otherwise — to see the earlier `fix` commits in the same production files, and when it reports a possible shared design cause include the proposed structural initiative or the reason none is needed in the handoff.

The delivery report and the handoff are defined in procedure §12. A commit followed by another authorized task in the same session needs only a brief progress update.

---

## 11. Multi-Session Initiatives

The active initiative index is [`plans/README.md`](../plans/README.md). Use an initiative plan when an outcome needs coordination across sessions. The same plan type records a review follow-up batch whose tasks the Product Owner authorizes one at a time, so repository state — not conversation memory — shows what remains. A single-session outcome may contain several focused commits without an initiative plan; use a temporary `WORKING_PLAN.md` only when `AGENTS.md` §8 requires it. Active plans are coordination records; they do not replace `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, an ADR, or the Product Owner's authorization.

Each active plan should contain:

* the objective, scope limits, and relevant source-of-truth links;
* an explicit authorization state, including decisions still reserved for the Product Owner;
* the approval's scope (whole initiative or named tasks), selected coding tool, priorities, delegated decision areas and principles, execution budget in tasks and recovery budget in fix cycles (procedure §8), and a separate closure allowance when final owner acceptance applies;
* an ordered table of task IDs, outcomes, dependencies, acceptance evidence, and status (`Planned`, `Ready`, `In progress`, `Blocked`, or `Done`);
* for each task, the files it is expected to change and its §9 validation tier, as required by procedure §8 (`docs/AGENT_WORKFLOW.md`);
* the source review or report and its task IDs when the plan tracks a review follow-up batch, plus an explicit unverified-remainder note when the full list is unavailable;
* a single exact next task, or the reason no task can proceed;
* concise decisions and findings needed by later sessions, including baseline or final measurements when they affect the initiative;
* an Owner Involvement section with expected verification rounds and checks, task/check/action rows, and unresolved capabilities that may add rounds; include the working-task count and the separate final acceptance round required by `AGENTS.md` §8.

At the start of a continuation session, read the index, the named plan or the one resolved under `AGENTS.md` §8, `AGENTS.md` itself, and any existing `WORKING_PLAN.md`. Compare plan status with `git status` and recent commits. Reconcile dirty work or an unfinished working plan before selecting another task; resume owned unfinished work, preserve unrelated changes, and block when ownership cannot be established. When the worktree is clean, take the next `Ready` task within initiative-wide approval or an explicit continuation request. Do not infer approval from a status label or a plan's existence. Each initiative task uses a working plan only when procedure §8 requires one, performs its required validation/review, and commits the task with the initiative status update. Session boundaries follow `AGENTS.md` §12. In the handoff, cite the plan, completed task and next task. Do not repeat valid validation merely because the session changed.

For small fresh contexts, pass the selected task, authorization and decision boundaries, starting Git state, relevant source-of-truth section links and required acceptance evidence. Read applicable nested instructions when reaching an owner. Keep the full diff, validation record and relevant untracked files available to independent roles; a concise task prompt must not hide their required inputs. Use compaction within a task as needed, but preserve decisions and blockers in repository records before relying on a context reset.

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
The specification is the index `docs/PRODUCT.md` plus every file under `docs/product/`.
The checker scans each file separately and orders the sections by number before it
applies its rules, so a section may be stored in any file. It requires a marker for
every numbered leaf section and for parents with their own text; unnumbered
subheadings belong to the nearest numbered section. A parent is a section whose next
section number is deeper. Numbered headings at levels two through four are supported (for example,
`#### 20.2.1 Title`); heading level must match number depth plus one. A marker on
a parent with numbered children and no own text must cite a subsection instead.
It rejects unknown section numbers and malformed markers. The checker
owns explicit exemptions with reasons for overview and product governance prose,
and a boundary-section list derived from procedure §9 (`docs/AGENT_WORKFLOW.md`). Boundary sections also
require a marker under `e2e/`; a unit or performance marker cannot replace it.
Review the boundary list when adding or changing requirements. Section-level
traceability locates executable evidence; it does not prove that every sentence
has an assertion. Add markers only to tests that exercise the cited behavior and
review their assertions against the requirements when behavior changes.

`npm run check:docs` limits specification blocks to 700 characters and each numbered
section's own text to 8,000 characters, in the index and in every file under
`docs/product/`. Paragraphs, individual list items with
their continuation lines, and table rows are blocks; headings, fenced code,
comments, separators, and blank lines are excluded from block counting. Section
text includes unnumbered headings and fenced code, but excludes comments and
separators. Block failures report the file, line, section, size, and limit with
"Split it into one rule per list item without rewording"; section failures say
"Split it into numbered subsections". The limits apply to every section; there is
no exemption mechanism. The files under `docs/product/` are live documents for
link, ADR-reference, and limit checks. They are exempt from the check that rejects a
restated product quantity, because they own those quantities.

The same command checks the structure of the specification files. A file under
`docs/product/` has one level-one title and then its first numbered heading; text
between them, other than blank lines, comments, and separators, fails because every
requirement belongs to a numbered section. The index lists every numbered heading
once, in the table that names its file, and lists no titles, so retitling a heading
does not touch the index. A number that leaves the specification moves to the index
table of retired numbers and is never defined again. The check fails when a number has
no entry, an entry has no heading, a number maps to a file other than the one that
holds its heading, a file is missing from the index, or two files define one number.

Before restructuring requirement text, record the starting Git ref and run
`npm run check:docs -- --verbatim <ref>` after the edit. Without `--file`, it
compares the whole specification with that revision: each side is the index plus every
file under `docs/product/` that exists on that side, so a clause that moves to another
file is reported as moved, not lost. A revision from before the split has the single
old file. It reads Git through a shell-free child process. Use `--file <path>` to narrow
both sides to one file, for example `--file docs/VIM_CONFORMANCE.md` for that document,
and `--allow-added <n>` for an
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
The first report line also counts moved clauses and added and removed headings.

`npm run check:docs -- --ordered <ref>` proves that a split moved text without
changing it. It reads the specification at that revision and in the working tree as
the default `--verbatim` form does. For every numbered section, it compares the lines
from the section heading to the next numbered heading with the same section at the
revision, in the same order and character for character. The comparison ignores the
blank lines and `---` separators that end any section, and the order of sections and
files; it reports every other difference, including every interior line. Each difference prints both locations and both lines;
the first line counts differing lines. A section that is missing, extra, or defined
twice is a structural problem. Exit 0 requires no problem and at most the number of
differing lines given by `--allow-differences <n>`, default 0. Invalid refs exit 2.

`npm run check:docs -- --details <ref>` lists the exact text that a rewrite of the
specification must keep or account for. It reads the specification at that revision and
in the working tree as the default `--verbatim` form does; `--file <path>` narrows both
sides to one file. It skips fenced blocks and comments, which `--verbatim` compares
exactly. It reports three classes separately and shows differences without judging them:

* Literals: code spans, bold spans, and numbers. A number is a token that contains a
  digit, such as `27px`, `p99`, or `Cmd+0`, or an English number word such as `three` or
  `two-line`. A number that stands alone takes the next word as its unit, such as
  `25 px` or `3 attempts`, except a function word such as "of" or "the". Section
  references in a `§` form, link targets, autolinks, bare URLs, and list markers are not
  literals. A section number without `§`, such as an entry of the Section Map in
  `docs/PRODUCT.md`, is a literal, so a new index entry such as `9.4` is reported.
* Table cells: every body row of every table, matched with its old row by section,
  header, and first cell, or else by a majority of equal cells. Each changed cell prints
  its column header and its old and new text. A row without a match prints every cell
  with its column header.
* Section references: `§N`, `§N–M`, `§§N and M`, and the same forms after a document
  name such as `AGENTS.md`, each printed with its sentence. References inside code spans
  are ignored. A reference whose sentence is otherwise unchanged but whose target changed
  is reported once as retargeted.

Every item names its file, line, and numbered section, "(no section)" before the first
numbered heading, and its table column when it is in a cell. A removed item's line is in
the revision and an added item's line is in the working tree; a changed cell and a
retargeted reference print the working-tree location and the revision line as `(base
<file>:<line>)`. An item that stays in its numbered section is unchanged, even when it
moves within the section or the section moves to another file. An item that leaves its
section and appears unchanged in another section is listed once as moved, with both
locations, and not as removed and added. "Moved" means only that an equal item
disappeared from one section and appeared in another; it does not prove that the same
statement moved. Check every moved item against a moved or merged clause of the
`--verbatim` report. The first line counts each class, for example
`Detail comparison: literals removed 0, added 0, moved 0; table cells changed 0, rows
removed 0, rows added 0, rows moved 0; references removed 2, added 3, retargeted 0, moved
0.` Item lines follow in class order: `Literal removed`, `Literal added`, `Literal
moved`, `Cell changed`, `Row removed`, `Row added`, `Row moved`, `Reference removed`,
`Reference added`, `Reference retargeted`, and `Reference moved`. Exit 0 requires no
removed, added, changed, or retargeted item; moved items alone exit 0, as in
`--verbatim`. Any other item exits 1, and invalid arguments, refs, or files exit 2.

The detail comparison does not detect:

* a literal or reference that leaves one sentence and reappears in another sentence of
  the same numbered section, or any change of order within a section;
* interface text that is plain prose, italic, or quoted rather than bold, coded, or in a
  table cell; `--verbatim` reports the clause that holds it;
* key names without digits written as plain prose, ordinal words such as "first", and
  quantity words such as "single", "both", or "once";
* references written in words, such as "the rule above"; `--verbatim` lists antecedents;
* the meaning of a changed cell or reference: a retargeted reference may narrow its scope,
  and a reworded sentence that changes its reference reports it as removed and added;
* a changed table header as one change: every row of that table is reported as removed
  and added;
* whether a moved item is the same statement: an equal item removed from one section and
  an unrelated equal item added to another section are shown as one move;
* changes inside fenced blocks, comments, link targets, autolinks such as
  `<https://…>`, or bare URLs; `--verbatim` still reports the changed clause that holds
  them.

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
and is listed under "Open matrix-only rules" until the Product Owner decides;
a named test alone does not authorize the rule. Moving it into PRODUCT.md follows `AGENTS.md` §5.

A refactoring that preserves behavior should not require unnecessary test changes.

Store interaction tests use `createRealStoreHarness` from `src/renderer/test/real-store-harness.ts` by default for outcome assertions. It builds a real `EditorStore` over the shared application property-test load/save fakes, with in-memory clipboard and attachments. Assert the resulting document, location, focus, and renderer mode; use current snapshot nodes rather than supplying content that differs from the store. Tests own pending save timers with fake timers or an injected clock. Typed doubles in `src/renderer/test/` (`vim-keyboard-double.ts`, `editor-store-double.ts`) are for failure injection and calls that are themselves the contract, such as error reporting or lifecycle registration. A double supplies every member of its owner, so adding, removing, or renaming a member fails `npm run typecheck` at the double, while an unchecked literal can silently diverge and exercise a path the application never takes — the failure class [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md) removed for the interaction-state owners. When a double is needed, supply its snapshot and exercised behaviors through `createEditorStoreDouble`; do not recreate an `as unknown as EditorStore` literal.

End-to-end tests complement unit tests by exercising the real Electron application through the UI. They should target integration points that unit tests cannot cover: preload/IPC wiring, autosave and restart behavior, attachment files, the system clipboard, and the application startup path. See `docs/decisions/0002-e2e-testing-with-playwright.md`.

Platform-routed shortcuts need boundary-faithful end-to-end tests. Playwright injects key events through the DevTools protocol, which triggers Chromium's native editing behavior even though macOS does not route those commands in the running application. An end-to-end test for an editing command (Undo, Redo, Cut, Copy, Paste, Select All) must therefore suppress or disable the native browser behavior, such as the `copy`, `cut`, or `paste` event, and assert that the application still performs the action. A test that relies on the native default can pass while the product is broken. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

Coverage policy is defined in `AGENTS.md` §9 and procedure §9 (`docs/AGENT_WORKFLOW.md`). The enforced global and per-file floors are configured in `config/testing/vitest.config.mts`, and `npm run check` runs the coverage-enabled unit suite that fails when a floor is not met. Coverage output can vary slightly between runs with identical inputs; treat a single-run global delta of a statement or two as measurement noise rather than a regression.

Per-file floors for the renderer interaction-state owners, their projection point, and scroll restoration are configured in `config/testing/vitest.config.mts` and enforced by this coverage run. They are set just below coverage measured when each guard is introduced or strengthened, so losing a guarded module's focused coverage fails `npm run check`. Treat them as regression guards, not coverage targets: add behavior in its owner module with focused or property tests and restore coverage rather than lowering a floor. The single-owner pattern they guard is recorded in [ARCHITECTURE.md](ARCHITECTURE.md) §9 and [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md).

Property-based tests using `fast-check` cover domain invariants and `EditorStore` command sequences. They run as part of `npm test` and are written as `*.property.test.ts` files. The rules for when to add one are in `AGENTS.md` §9.

Property tests explore with a random seed on every run, locally and in CI, so each run can find a counterexample that an earlier run did not. A failure prints its seed and path. Replay it exactly with `FC_SEED=<seed> FC_PATH=<path> npm test -- <file>`; `src/test/fast-check-setup.ts` applies both variables through `fc.configureGlobal`. A fixed seed on one property is allowed only when the test asserts that a branch was reached, and needs a comment saying so. Turn every reproduced counterexample into a named deterministic test in the same commit as the fix, as `vim-mixed-interaction.property.test.ts` does.

Write every run count as `propertyRuns(base)` from `src/test/property-runs.ts`. `TREE_PROPERTY_RUNS` multiplies all of them (default 1). `npm run test:property` runs the property files at a factor of 20, and `.github/workflows/run-property-tests.yml` runs it nightly. A property whose every run builds the typed doubles passes a `maxScale` (`propertyRuns(base, maxScale)`), because Vitest retains every `vi.fn` it creates and thousands of runs exhaust the worker heap; do not create `vi.fn` inside a generated event. A property-test failure is a candidate defect: replay it, then fix it under the defect-first workflow.

Mutation testing measures assertion strength, which coverage does not: Stryker changes one expression at a time in `src/domain`, `src/application`, `src/web`, `src/shared`, `src/electron`, `src/infrastructure`, and the selected pure renderer modules listed in `config/testing/stryker.config.mjs`, then reruns the tests that cover it. Renderer mutation targets have no React, DOM, or Electron imports. Tests, type declarations, and test helpers are excluded from mutation targets. A mutant that no test fails on has survived, and the mutation score is the share of mutants the tests detected.

`npm run test:mutation` runs the full configured scope when no shard is selected. For local layer runs, use `npm run test:mutation -- --shard application`, replacing `application` with `domain`, `renderer`, `web`, `shared`, `electron`, or `infrastructure` as needed. The adapter also accepts `--shard=application`; it removes that selector and passes the remaining arguments literally to Stryker. Missing, unknown, or repeated shard arguments fail before Stryker starts. The CI selector `TREE_MUTATION_SHARD` remains supported; matching CLI/environment selectors are accepted and conflicting selectors fail. The adapter preserves Stryker's exit status, including a failed score threshold, and returns a nonzero status if the child cannot launch or is interrupted.

A narrower file run is `npm run test:mutation -- --mutate src/domain/document-operations.ts`. Pass several files as one comma-separated `--mutate` value; a repeated `--mutate` flag keeps only the last one. Runs are incremental: `reports/stryker-incremental.json` lets a later run retest only mutants whose code or covering tests changed, and `--force` retests everything. The console prints the score table; read surviving mutants in `reports/mutation/mutation.html`. Runtime depends on scope and environment; mutation testing is not part of `npm run check` or `npm run check:full`.

`thresholds.break` in `config/testing/stryker.config.mjs` is 93, below the full-run score of 94.97% recorded when it was set for the domain and application scope (93.86% on 2026-10-02 with the renderer modules added; timeout classification moves a module's score by a few points between runs). Those historical scores do not establish a baseline for the expanded scope. Raise the threshold only after a measured full run is higher; never lower it to pass a run. `.github/workflows/run-mutation-testing.yml` runs weekly and on manual dispatch, split into five parallel shards (renderer modules, web, shared, electron, infrastructure) with `--concurrency 4`, and uploads one HTML report per shard. Domain and application mutation runs remain available locally but are omitted from CI because of their cost. The score threshold applies to each shard separately. New shard runtimes and scores require measurement; the workflow retains its 90-minute job limit. Existing source comments explain some equivalent or defensive survivors; do not assume an unexplained survivor is equivalent.

The 93% acceptance threshold applies to the full configured scope and each named CI layer shard. An arbitrary selection of files has a different mix of code and is a diagnostic scope, not a separately calibrated 93% gate. Keep the configured threshold when running a focused check and report its score and nonzero exit status honestly; a focused failure does not establish that the full scope or shard fails, and a focused pass does not establish that either passes.

When a task changes logic in `src/domain`, `src/application`, or one of the renderer modules named above, run mutation testing on the complete changed files and read their surviving mutants before handoff. Compare survivors with the pre-change baseline, distinguish existing gaps from changed behavior, and close observable assertion gaps introduced by the change. Changed-line checks may supplement this review but cannot replace whole-file testing. Do not lower the threshold or broaden exclusions to make a focused run pass. When a focused score is below 93%, run the affected layer shard to evaluate the acceptance gate. Report existing gaps outside the task separately rather than silently treating them as equivalent or expanding the task to force the focused score above 93%.

Use a separate `--incrementalFile` for each scope being compared. A shared incremental report can retain files outside the current `--mutate` selection and include them in its aggregate score. Confirm the report's file set and denominator before comparing scores. Use `--force` when establishing a fresh baseline or when new assertions are not reflected in cached mutant results. Compare individual survivors that become assertion failures separately from timeout classifications, which can vary between runs.

Read the weekly report when the score drops. Treat a survivor as a question about a missing assertion, not a target to chase: kill it with an assertion on behavior, or leave an equivalent mutant (one that cannot change observable behavior) with a Stryker disable comment stating why. Keep Vitest and its Stryker runner compatible; when upgrading either, confirm that a forced whole-file run still kills known observable mutants.

Run ordinary Vitest validation after Stryker has finished and removed its sandbox.
The pure completion lifecycle owner `completion-controller.ts` and its recognizer adapter `completion-sources.ts` are also in the renderer mutation scope. `config/testing/stryker.config.mjs` owns the complete module list. The scheduled workflow sets `TREE_MUTATION_SHARD` to `renderer`, `web`, `shared`, `electron`, or `infrastructure`; the configuration filters that list by layer while retaining all exclusions. With the variable unset or empty, the full scope runs, including domain and application. Unknown shard names fail configuration loading. `scripts/mutation-scope.test.mts` guards that the selectable shards partition the full scope and that the workflow uses the intended scheduled subset through this selector rather than a separate module list.
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

Electron performance tests live in `perf/electron/` and form the `electron` project of `config/testing/perf.config.ts`. Browser scenarios against the built static package live in `perf/web/` and form the `web` project. Cross-platform comparison runners live in `perf/comparisons/`; shared result recording stays in `perf/results.ts`. Select their scope using procedure §10 and the commands in §9; a High Risk classification alone does not require a run. `npm run test:perf` builds both targets and runs both projects; the full Electron suite runs as part of an explicitly selected `npm run check:full`, or on its own with:

```bash
npm run test:perf -- --project=electron
```

`make test-perf` combines domain timing guards, both performance projects, and the Safari/Electron comparison. For focused runs, use `npm run test:perf -- --project=electron` or run the [browser archive scenarios](../src/web/README.md#browser-archive-performance) with `npm run test:perf -- --project=web` when a change can affect browser archive work.

Known Electron/macOS issue (observed on macOS 26.6.2, November 2026): the idle main-process delay guard in `perf/electron/notes-archive.spec.ts` can fail on Electron 45.2.1 and 45.2.3. Native sampling traced the wait to Chromium's window-occlusion checker calling AppKit's ordered-window query. The same failure reproduces on the unchanged commit before the windowing-threshold reduction; selecting Electron 44.10.1 removed this measured main delay in controlled runs. Electron 45.2.3 produced both passing and failing runs. These observations do not establish behavior on other systems, physical keyboard latency, or a validated production downgrade.

The Product Owner classified this as a known runtime issue separate from the windowing optimization. Keep the test and its limits unchanged, report any failing run explicitly, and do not describe that run as passing. A focused recheck with another runtime uses `npm run test:perf -- --project=electron notes-archive.spec.ts`; a native workaround or dependency change requires its own decision and validation.

The owner selected Electron 44.10.2 on 2026-11-08. A same-machine series of repeated archive checks showed no idle main-delay failures on that runtime, but one run still exceeded the main-delay limit during import preparation. The earlier Electron 44.10.1 series also had an isolated paint-latency failure. These results do not establish that either older runtime is free of stalls; retain the existing guards and report each failing scenario separately.
### Preparing a macOS release

Commit the intended application changes, then create the version commit as described in [macOS releases, Create a release](releasing.md#create-a-release).

Push or merge the version commit to main normally. `Test and build app` runs the release gate
listed under [GitHub Actions](DEVELOPMENT_REFERENCE.md#github-actions). After success, publication is dispatched only
when the version is eligible for that source commit; eligibility, tag reservation, same-version
skips and recovery after main advances follow [macOS releases, Create a release](releasing.md#create-a-release).
The combined `Release new app version` verifies the completed main validation run, SHA and
attempt, reserves the common immutable tag, then runs independent Web and macOS branches. The Web job waits for deployment
and verifies hosted bytes. The macOS branch reserves an owned draft, signs its installer,
checks the application copied from that DMG on a fresh runner without signing secrets,
and uploads the original signer artifact from a separate runner after SHA-256 verification.
That runner publishes the complete release only after GitHub asset digests match the signer outputs.
It does not rerun standard validation. A failed target deployment requires manual retry through the target-run link; App
permissions remain unchanged. See [macOS releases](releasing.md) and
[Browser publication](../deployment/github-pages/README.md) for recovery and trust details.

Version precedence and the skip of obsolete versions and superseded main commits follow [macOS releases, Create a release](releasing.md#create-a-release). A new candidate creates an immutable tag at the checked SHA and a draft, then builds, signs and notarizes the DMG and verifies the packaged application. Reservation, upload and automatic publication are serialized across versions. The owner selects releases through the local version command. Full release, retry and signing details are in [macOS releases](releasing.md).

The local version command remains owner-invoked and approval-gated in coding agents. Keep the `v*` tag ruleset restricting updates and deletions. Manual tag pushes no longer trigger macOS builds. Local timing and functional suites remain governed by change risk; the CI release gate is listed under [GitHub Actions](DEVELOPMENT_REFERENCE.md#github-actions). The memory suite's detection limits are described under [What the memory suite can detect](#what-the-memory-suite-can-detect).

Optional, approval-required [local Safari comparisons](../src/web/README.md#local-safari-performance-comparisons)
are separate from the automatic validation workflows and ordinary Electron suite.

The domain date-recognition timing guard in `src/domain/natural-date.performance.test.ts` runs locally through `npm run test:performance`. `config/testing/vitest.config.mts` excludes `*.performance.test.ts`; the separate timing configuration runs them serially without coverage. It checks the first relative-date lookup, mixed batches of English counts, incremental typing, and long surrounding text, and the p99 of individual calls. `perf/electron/date-completion.spec.ts` complements it with popup paint latency, the key-to-popup-insertion latency that does not depend on the display refresh rate, and acceptance through the running application in both editing modes. Mutation workers also exclude timing guards because instrumentation changes the work being timed. Functional and bounded-heap regex regressions remain in ordinary validation through `src/test/regex-resources.test.ts`. `perf/electron/agenda-scale.spec.ts` opens the Agenda on synthetic 100,000-node documents of wide, deep, and mixed shape, with dates on every node or on every twentieth, and measures opening, scrolling, navigation, typing, date edits, adding a recognized date, and Undo. Use `npm run test:perf:profile -- perf/electron/agenda-scale.spec.ts --grep <scenario> --project=electron` to print a renderer CPU profile summary for diagnosis; profiled timings are not comparable to the ceilings. The timing assertions are soft so every behavioral check still runs after a latency failure.

They measure startup, typing, state/persistence work, and sustained renderer-memory growth at several document scales and print one JSON line per scenario. Unlike the e2e suite, the performance fixtures keep the application window visible: the typing scenarios measure paint latency for a presented window, and the same-machine baselines are recorded that way, so hidden e2e window mode is intentionally not applied to `perf/`. Every scenario also records its metrics through `perf/results.ts` into a JSON artifact (default `test-results/perf-results.json`, overridable with `PERF_RESULTS`). Set `PERF_BASELINE` to a previously recorded artifact to compare against it: the run fails when the baseline lacks a recorded scenario or metric, or when a metric regresses beyond `PERF_REGRESSION_TOLERANCE` (default `1.5`). Pass an artifact override as a single quoted value, for example `PERF_RESULTS="test-results/perf-after.json" npm run test:perf`; `PERF_RESULTS` output must stay under `test-results/`, and an unquoted value is treated as an unfamiliar command and requires approval. Re-record the baseline when adding a scenario or metric. The comparison is meaningful on the same machine, so baselines are captured locally and never committed. Playwright clears `test-results/` at the start of every run, so keep a baseline outside that directory and point `PERF_BASELINE` at it. Two consecutive runs on one machine without a code change already exceed the default tolerance on a few single-sample and frame-quantized metrics, so a baseline comparison is a diagnostic for a targeted before-and-after check, not a pass or fail gate. For a report without a failing comparison, use `scripts/perf-report.mts` with the current and baseline result artifacts. The absolute ceilings in the specs remain the local gate. The recorded budgets, measured baselines, and scenario parameters are owned by the `perf/` suite; they are not restated here.

Each typing scenario focuses a specific input, asserts the seeded text is present and focused, types, and asserts the field received the typed text while the current-parent heading was not edited. This matters inside a parent, where the first textbox is the current-parent heading rather than the selected child. The scenario measures wall-clock typing time and paint latency; the `inputTurnaround` metric is an observation only, not React commit latency. The supported document-scale target is 100,000 nodes. A 30,000-sibling wide scenario guards that windowed rendering keeps typing cost independent of the displayed sibling count.

The state/persistence scenario in `perf/electron/state.spec.ts` seeds a large attachment-bearing document and runs a structural burst, a typed-word burst, and a reference-changing delete; a second scenario exercises attachment-bearing history through structural commands, undos, and redos; a third measures attachment image validation and write latency. Each prints its measurements and enforces ceilings. The save count and the summed document bytes written confirm the automatic save policy triggers on inserted-word volume rather than per keystroke, and the cleanup scan duration guards the reference-changing path against unbounded history or document scanning. The budgets and their measured baselines are recorded by the `perf/` suite and its result artifacts.

Memory probes request two renderer garbage-collection passes before reading heap and process memory. The first pass can release JavaScript wrappers while detached DOM objects await another pass. A single pass produced intermittent structural-edit working-set failures on macOS despite bounded retained heap and DOM counts. These samples measure retained footprint after collection, not peak editing memory; the existing budgets and deliberate-leak detector checks remain in force.

`perf/electron/notes-archive.spec.ts` measures visible typing at idle and throughout desktop export and import preparation. It exercises the real archive worker, IPC and filesystem, stubbing only the native panels. It records key-to-frame latency, operation duration, main event-loop delay and sampled main JavaScript heap growth, with representative near-limit images. After cancelling an active preparation it checks staging cleanup and open file descriptors (`lsof` on macOS, `/proc` on Linux). JavaScript heap excludes native allocations and worker heaps; its sampled peak can miss short-lived allocations.

The Vim performance scenarios measure repeated Normal, character Visual, whole-node Visual, and Insert interactions, standalone `dd`, and sibling movement through the visible Electron renderer. The save-responsiveness scenario measures the key that triggers a word-volume automatic save (`docs/PRODUCT.md` §16.1) and the next key while a deliberately delayed save remains in flight. Selected scenarios repeat under four-times renderer CPU throttling as a reproducible constrained-CPU proxy; this does not model macOS Low Power Mode or system-wide contention. The memory scenario records renderer JavaScript heap and Electron process working sets at a warm point and after two further edit bursts. Summed process working sets may count shared pages more than once, so they are a diagnostic footprint rather than unique physical memory.

Performance guards for the perceived Vim editing responsiveness of `docs/PRODUCT.md` §22.2 must exercise representative sequences in the running application, including key-to-visible-frame latency for Vim interactions and typing, as well as document-scale cases that could expose renderer or React work on the interactive path. Measure both typical and slow interactions; investigate regressions before adding further editing features.

The representative scale workload for the tag-suggestion budget of `docs/PRODUCT.md` §20.13 is the automated guard `src/domain/tag-catalog.performance.test.ts`, which measures the p99 of suggestion retrieval from the prepared index in a 10,000-tag document and also runs through `npm run test:performance`. Index updates and real typing responsiveness have separate scale guards (`docs/PRODUCT.md` §22.1).

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

The project `.npmrc` sets `save-exact=true` so npm saves exact versions when adding dependencies. `scripts/dependency-pinning.test.mts`, included in `npm run check`, rejects version ranges and mismatches between direct dependency declarations and resolved lockfile versions.

`package.json` `overrides` pins `qs` to a patched version: `@stryker-mutator/core` pins `typed-rest-client` `~2.3.0`, which pins a `qs` release with known advisories. Remove the override when a Stryker release depends on a patched `typed-rest-client`.

`npm audit` runs as the final step of `npm run check:full`, not of `npm run check`, so known vulnerabilities are reported at the end of complete validation. It requires registry access and fails when offline.

Between validation runs, `.github/dependabot.yml` opens weekly pull requests for npm and GitHub Actions updates (minor and patch updates are grouped, major updates arrive one per pull request), and Dependabot security updates open a pull request when an advisory is published. `.github/workflows/audit-dependencies.yml` runs `npm audit --audit-level=high` on pushes to `main`, pull requests, every eight hours (00:00, 08:00 and 16:00 UTC), and on manual dispatch, so a high or critical advisory fails a visible run even when no fix pull request exists. Automatic consumers share its result as described under [GitHub Actions](DEVELOPMENT_REFERENCE.md#github-actions); scheduled and manual test runs call it for a fresh audit. No update is merged automatically: review each pull request, keep the exact-version rule above, and apply the dependency validation scope above.

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

Agent-created temporary work belongs in `.scratch/<task>/` under the repository root; the rules for its use are in `AGENTS.md` §4 and procedure §4. No tracked placeholder is required. The folder is ignored by Git, ESLint, Prettier, and Vitest discovery and is not copied into Stryker's mutation sandbox, so saved diagnostic scripts, unfinished examples and browser profiles do not enter ordinary validation. A hidden name and `.gitignore` are not a confidentiality boundary or automatic cleanup mechanism.

Keep reports needed across test runs here, rather than in system temporary directories or Playwright's cleared `test-results/` directory. Existing tool-managed outputs such as `test-results/`, `reports/`, and `out/`, library-managed temporary directories, and application test profiles retain their current locations. A diagnostic spec that needs the E2E or performance runner's discovery stays in its designated suite while in use; the existing permitted retirement workflow remains valid. Working and initiative plans retain the locations defined in procedure §8 (`docs/AGENT_WORKFLOW.md`).

Read and write scratch files through the agent's normal repository file tools, including when a tool needs an explicit path to discover Git-ignored files. `npm run retire:scratch -- <task>` accepts one directory name directly under `.scratch/`, refuses option-like names, nested paths, symlinks, regular files and locations that resolve outside `.scratch/`, and never follows nested symlinks. The retained-name list in `scripts/retire-scratch.mts` is empty. The command does not authorize deleting another task’s evidence or resetting execution allowances. There is no automatic purge, and this workflow grants no other shell or recursive deletion permission.

Before deleting anything, retirement checks every embedded checkout for tracked, staged, or untracked changes; ignored build output may be discarded. It refuses locked worktrees, malformed or symlinked Git metadata, worktrees owned by another repository, and embedded clones (including bare repositories) that have linked worktrees. Clean worktrees owned by this repository are removed through Git, including their registrations, before the remaining task files are removed. Missing checkout registrations inside the task can be retired after an interrupted cleanup; unrelated registrations and branches are preserved. A preflight refusal preserves the entire task. An execution failure stops cleanup and reports failure; already completed removals are not rolled back. Stop task-owned processes before retirement, and do not edit a checkout concurrently with cleanup.

Codex uses `.codex/rules/scratch.rules` for this command outside the sandbox, because `.git/worktrees` remains protected inside it. The allowance trusts the named repository script, not arbitrary `git worktree remove` or recursive shell deletion. Restart Codex with the project configuration trusted after adding or changing the rule. Verify matching without deletion using `codex execpolicy check --rules .codex/rules/scratch.rules npm run retire:scratch -- completed-task`. A matching rule is configuration evidence only; verify the absence of a prompt on the next authorized cleanup in a restarted session.

Electron Vite writes production build output to `out/`. This directory is generated and must not be committed.

---

## 17. Reviewing the Git Change

Git policy is owned by `AGENTS.md` §12. Release notes are generated into macOS GitHub Release drafts; see [macOS releases](releasing.md).

Before committing, review the change with:

```bash
git status
git diff
```

Confirm that only intentional files are modified. History rewriting is never allowed, and discarding other changes needs explicit authorization (`AGENTS.md` §§4 and 12).
