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

The install runs the project's `postinstall` script to download the Electron runtime for the current platform. Do not disable lifecycle scripts when preparing a development environment.

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

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. Hidden runs execute spec files in parallel across five workers, and selected long-running suites distribute their independent tests across those same workers; visible runs stay serial. Parallel execution is safe because each worker cleans only its own `tree-e2e-p<pid>-` applications, the machine-global `Cmd+0` shortcut is stubbed for every launch except the serial `e2e/shortcut.spec.ts`, and the shared system clipboard is serialized through a cross-process lock. The execution model and its rationale are recorded in `docs/decisions/0012-parallel-e2e-execution.md`. Use Playwright's `--workers` option when a local or CI environment needs a different concurrency limit. The suite is macOS-only, requires a display, and must not run as two concurrent Playwright invocations.

Application windows are created hidden by default so the suite does not steal desktop focus. The test-owned entry `e2e/electron-entry.cjs` applies hidden mode through `e2e/hidden-windows.cjs` before the application bundle loads, and every launch asserts the selected window mode, so an Electron or Node upgrade that invalidates the override fails on the first launch instead of silently showing windows. Run with visible windows when observing the real UI, for example during product verification:

```bash
TREE_E2E_VISIBLE=1 npm run test:e2e
```

To observe a single spec, run `TREE_E2E_VISIBLE=1 npm run test:e2e -- <spec>` (this rebuilds the application first) or `TREE_E2E_VISIBLE=1 npx playwright test <spec>` (this uses the current `out/` build).

Hidden mode still requires a macOS GUI session; it does not make the suite headless.

Drag tests start a gesture through `startRowDrag` in `e2e/fixtures.ts`. A visible run happens on a live desktop, so that helper verifies the active drag survives a short settling window and retries the gesture a bounded number of times, since a window that loses focus releases pointer capture and the application cancels the drag by design. The hidden default removes desktop focus changes from the gesture, and the bounded retries remain for visible runs.

Window addressing in `e2e/fixtures.ts` is focus-independent for the same reason: closing, resizing, or reading the main window through `closeMainWindow`, `setMainWindowBounds`, and `readMainWindowBounds` addresses the application's window directly instead of relying on the application being frontmost, so the window-close flush and quit path stays testable while the application is inactive.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**` and the `test-results/**` scratch directory where finished diagnostic specs are parked, and Playwright only reads `e2e/`.

Native editor context-menu behavior is covered by renderer and IPC contract tests. The macOS popup itself must be product-verified on supported macOS hardware with a display because the Playwright Electron driver cannot reliably inspect or select native menu items; use a visible suite run (`TREE_E2E_VISIBLE=1 npm run test:e2e`) when the popup must be observed. The popup only captures a small selection snapshot and does not add persistence work, tree traversal, or retained state; disk writes, interactive CPU, and memory growth remain unchanged outside the selected editing command.

### Defect regression workflow

The defect-first and boundary-testing rules are defined in `AGENTS.md` §9. Boundary contract tests live next to the implementation; end-to-end tests live in `e2e/`. Use unit tests for deterministic state-machine branches and E2E tests for the real Electron wiring.

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
5. OpenCode permission checks (`npm run check:opencode`);
6. tests with coverage enforcement;
7. production build;
8. dependency audit (`npm audit`).

The documentation governance step validates ADR metadata and indexing, checks that relative links and ADR references in live documents resolve, and rejects restated product quantities outside `docs/PRODUCT.md`.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This runs `npm run check`, the end-to-end suite, and the performance suite. The matrix below defines when complete validation is required; the normative validation policy is in `AGENTS.md` §10.

### Risk-Based Validation

Use the highest applicable tier. Focused checks may be run during implementation, but they do not substitute for a broader required tier.

| Tier | Change risk | Required validation |
| --- | --- | --- |
| R0 | Documentation or content only, with no executable configuration change | Run `npm run format:check:changed` and `npm run check:docs`. Also run `npm run check:opencode` when agent workflow documentation changes. |
| R1 | Executable tooling or configuration, tests, or an isolated non-runtime refactor | Run affected type, lint, formatting, governance, and focused test checks. Run `npm run check` when executable source, dependency metadata, build configuration, or validation tooling changes. Agent-prompt documentation remains R0 unless executable configuration such as `opencode.json` changes. |
| R2 | Product, domain, or renderer behavior contained within one process, without a persistence or platform boundary | Run `npm run check`, affected unit or property tests, and focused E2E coverage for every affected user-visible requirement. Broaden E2E coverage when shared interaction or lifecycle infrastructure changes. Perform product verification of the changed flows. Run performance checks when `docs/PRODUCT.md` §22 applies. |
| R3 | Process, IPC, filesystem, persistence, clipboard, attachment, native shortcut, startup, shutdown, security, dependency, toolchain, shared fixture, or scale-sensitive state changes | Run `npm run check:full`, the unit, contract, real-boundary, and failure-path coverage required by `AGENTS.md` §9, applicable security checks and audit, same-machine performance comparison when performance may change, and visible verification for native behavior automation cannot inspect. |

When categories overlap or the tier is uncertain, use the higher tier. A suite that cannot execute its real boundary is blocked, not passed.

Classify the complete change, not only its purpose. For example, a workflow-documentation change that also modifies a validation script or its tests is R1 because executable validation tooling changed.

`npm run format:check:changed` is the canonical scoped formatting check. It checks supported staged, unstaged, and non-ignored untracked files relative to `HEAD`, excludes deleted files, safely passes filenames without shell interpolation, and succeeds with an explicit message when there are no eligible files. The full-repository `npm run format:check` remains part of broader validation.

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

A result remains reusable only while those inputs remain valid. `npm run check:full` subsumes the `npm run check`, E2E, and performance stages it contains; `npm run check` subsumes its listed stages. A focused result does not establish broader coverage. Documentation-only edits invalidate documentation and formatting checks, plus OpenCode governance when agent workflow files change, but do not invalidate runtime suites. Source changes invalidate affected static checks, tests, and artifact-dependent suites. Test or fixture changes invalidate that suite. Dependency, build, test-runner, and OpenCode-policy changes invalidate every affected stage.

If an aggregate command fails or is blocked after some stages pass, record the aggregate command's actual result; never relabel it as passed. Its completed successful stages remain reusable when their inputs are still valid. Run every failed, blocked, or not-run required stage separately on the same snapshot. The required tier is then satisfied by composed stage evidence, recorded as the aggregate attempt plus the supplemental commands. A later edit invalidates only the affected evidence under the rules above.

Pass the validation record to review roles. They consume still-valid results and run an automated check again only for an uncovered scenario, stale or incomplete evidence, or a finding that requires it. Read-only review does not invalidate evidence. After a fix, rerun affected checks and their dependencies; repeat complete validation only for a tier that requires it or after a substantial, architectural, high-risk, or materially scope-changing fix.

An E2E suite that cannot launch Electron or execute the relevant boundary is not a passing validation result. Report the exact environment failure and rerun the suite on supported macOS hardware with an available display before claiming full validation.

Security-sensitive changes must also verify the Electron boundary tests, including IPC validation, renderer navigation restrictions, attachment validation, and the production content security policy. Run `npm audit` when the network is available; a registry connectivity failure must be reported rather than treated as a clean audit result.

Shutdown and attachment changes should also verify that queued renderer saves are flushed before quit and that non-PNG or malformed image bytes are rejected at the main-process boundary.

The E2E and performance fixtures continuously observe the renderer's persistence and operation error messages. Any visible `.save-error` occurrence fails the test, including transient `Changes could not be saved:` and `Operation failed:` messages that disappear before the test completes. New persistence or autosave work must retain this guard and include a regression scenario for rapid edits or overlapping saves.

The fixtures register each launched Electron child process before waiting for readiness. Teardown requests the application shutdown handshake, waits on the child process exit event, then uses bounded SIGTERM/SIGKILL escalation and fails if the owned process remains alive. Per-test teardown runs in the isolated-data fixture rather than a module-level hook, because Playwright caches imported helper modules for a worker's lifetime and a module-level hook would apply only to the first test file; the save-error guard and the clipboard-lock release share that teardown. Save-status observation uses both a DOM mutation observer and a final collection, so transient document-save and attachment-cleanup errors are retained even if the status disappears before test teardown. Observations are released with their owning app, so restart tests never query stale Playwright pages during worker teardown.

If Electron shows a macOS crash dialog or a full suite fails during application launch, first treat it as a process-lifecycle failure. The E2E fixtures clean up stale applications per worker through their own `tree-e2e-p<pid>-` marker, and `e2e/global-setup.ts` removes leftovers from earlier runs before any worker starts. The performance fixtures clean up only stale Electron processes carrying their own temporary `tree-perf-*` user-data marker. Cleanup retries after launch failure and the launch error is included in the test failure. Do not use an unrestricted Electron process kill because it may terminate unrelated applications. After cleanup, rerun the isolated failing test and then the complete suite.

File-service diagnostics identify `load`, `save`, `writeAttachment`, `readAttachment`, and `cleanupAttachments` operations, their phase, and the paths involved. Failures are logged with the original error message.

---

## 10. Development Workflow

OpenCode uses the project configuration in `opencode.json`. Start a task with the `develop` primary agent. The normative task lifecycle, approval rules, review requirements, completion criteria, and Git discipline are owned by `AGENTS.md`. The role prompts in `.opencode/agents/` define only the inputs and actions specific to each role. Use the matrix and evidence rules in §9 when executing that lifecycle.

The `develop` agent's shell permissions are consent guardrails for host execution, not an operating-system sandbox. Routine repository and read-only process inspection, the named npm development and validation workflows, append-only Git work, and fixture-owned process cleanup run without approval. Unfamiliar commands require approval, while command categories that are destructive, publish externally, rewrite history, mutate dependencies, escalate privileges, or execute unrestricted interpreters are denied. Named npm workflows keep their ordinary arguments and attached output redirections inside the same approval boundary. Documented environment prefixes on the named workflows are inside the same boundary; ad-hoc diagnostic variables remain unfamiliar commands that require approval and must not be added to the policy. The permitted destructive file operations are deleting the temporary root implementation plan (`WORKING_PLAN.md`) and moving temporary diagnostic specs and probe files (`e2e/_*.spec.ts`, `perf/_*`) into the gitignored `test-results/` scratch directory; copying artifacts within `test-results/` is also permitted. Rules use OpenCode's last-matching-rule semantics, so their order is security-sensitive. OpenCode resolves each command in a pipeline or chain separately and applies the strongest effect across the segments, so a chain runs without approval only when every segment is allowed. Keep the exact patterns in `opencode.json` rather than duplicating them here, and run `npm run check:opencode` after changing either the policy or the OpenCode version. That check also fails when an npm workflow named in this document falls outside the `develop` approval boundary, so a documented workflow cannot silently start prompting. OpenCode loads its configuration at startup, so restart OpenCode before verifying a policy change.

For unattended sessions, OpenCode's auto-approve mode (`opencode --auto`, or the TUI command palette) approves permission requests that are not explicitly denied; the deny rules above remain enforced.

Allowed npm scripts and Git hooks execute mutable repository code with the host user's authority. The policy assumes this repository is trusted and reduces accidental or unexpected shell use; it does not protect the host from deliberately malicious repository code. OpenCode-native file tools remain subject to the denied external-directory boundary.

When a task ends at a commit or session boundary, provide a handoff recording what was completed, validation that passed, validation that failed or was blocked, unresolved issues, and the exact next task. Include a suggested prompt for resuming the work. An incomplete validation result must never be presented without a follow-up action.

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

A refactoring that preserves behavior should not require unnecessary test changes.

End-to-end tests complement unit tests by exercising the real Electron application through the UI. They should target integration points that unit tests cannot cover: preload/IPC wiring, autosave and restart behavior, attachment files, the system clipboard, and the application startup path. See `docs/decisions/0002-e2e-testing-with-playwright.md`.

Platform-routed shortcuts need boundary-faithful end-to-end tests. Playwright injects key events through the DevTools protocol, which triggers Chromium's native editing behavior even though macOS does not route those commands in the running application. An end-to-end test for an editing command (Undo, Redo, Cut, Copy, Paste, Select All) must therefore suppress or disable the native browser behavior, such as the `copy`, `cut`, or `paste` event, and assert that the application still performs the action. A test that relies on the native default can pass while the product is broken. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

Coverage policy is defined in `AGENTS.md` §9. The enforced global and per-file floors are configured in `vitest.config.ts`, and `npm run check` runs the coverage-enabled unit suite that fails when a floor is not met.

Property-based tests using `fast-check` cover domain invariants and `EditorStore` command sequences. They run as part of `npm test` and are written as `*.property.test.ts` files. The rules for when to add one are in `AGENTS.md` §9.

Performance tests live in `perf/`. They run as part of `npm run check:full`, and can also be run on their own with:

```bash
npm run test:perf
```

They measure startup, typing, state/persistence work, and sustained renderer-memory growth at several document scales and print one JSON line per scenario. Unlike the e2e suite, the performance fixtures keep the application window visible: the typing scenarios measure paint latency for a presented window, and the same-machine baselines are recorded that way, so hidden e2e window mode is intentionally not applied to `perf/`. Every scenario also records its metrics through `perf/results.ts` into a JSON artifact (default `test-results/perf-results.json`, overridable with `PERF_RESULTS`). Set `PERF_BASELINE` to a previously recorded artifact to compare against it: the run fails when the baseline lacks a recorded scenario or metric, or when a metric regresses beyond `PERF_REGRESSION_TOLERANCE` (default `1.5`). Pass an artifact override as a single quoted value, for example `PERF_RESULTS="test-results/perf-after.json" npm run test:perf`; `PERF_RESULTS` output must stay under `test-results/`, and an unquoted value is treated as an unfamiliar command and requires approval. Re-record the baseline when adding a scenario or metric. The comparison is meaningful on the same machine, so baselines are captured locally and never committed. The recorded budgets, measured baselines, and scenario parameters are owned by the `perf/` suite; they are not restated here.

Each typing scenario focuses a specific input, asserts the seeded text is present and focused, types, and asserts the field received the typed text while the current-parent heading was not edited. This matters inside a parent, where the first textbox is the current-parent heading rather than the selected child. The scenario measures wall-clock typing time and paint latency; the `inputTurnaround` metric is an observation only, not React commit latency. The supported document-scale target is 100,000 nodes. A 30,000-sibling wide scenario guards that windowed rendering keeps typing cost independent of the displayed sibling count.

The state/persistence scenario in `perf/state.spec.ts` seeds a large attachment-bearing document and runs a structural burst, a typed-word burst, and a reference-changing delete; a second scenario exercises attachment-bearing history through structural commands, undos, and redos; a third measures attachment image validation and write latency. Each prints its measurements and enforces ceilings. The save count and the summed document bytes written confirm the automatic save policy triggers on inserted-word volume rather than per keystroke, and the cleanup scan duration guards the reference-changing path against unbounded history or document scanning. The budgets and their measured baselines are recorded by the `perf/` suite and its result artifacts.

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

`npm audit` runs as the final step of `npm run check`, so known vulnerabilities are reported before a commit. It requires registry access and fails when offline.

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
