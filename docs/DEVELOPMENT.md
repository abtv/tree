# Development Guide

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

The production build must complete successfully before a task is considered complete.

---

## 6. Type Checking

Run TypeScript type checking with:

```bash
npm run typecheck
```

Type errors must be fixed before a task is considered complete.

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

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. The suite runs serially with a single worker because of the single-instance application and the global `Cmd+0` shortcut. The suite is macOS-only and requires a display.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**`, and Playwright only reads `e2e/`.

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
5. tests with coverage enforcement;
6. production build;
7. dependency audit (`npm audit`).

The documentation governance step validates plan filenames and metadata, rejects unchecked or stale-`Completed` plans, checks that relative links and plan/ADR references in live documents resolve, and rejects restated product quantities outside `docs/PRODUCT.md`.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This runs `npm run check`, the end-to-end suite, and the performance suite. The requirement to run validation before every commit is defined in `AGENTS.md` §10.

An E2E suite that cannot launch Electron or execute the relevant boundary is not a passing validation result. Report the exact environment failure and rerun the suite on supported macOS hardware with an available display before claiming full validation.

Security-sensitive changes must also verify the Electron boundary tests, including IPC validation, renderer navigation restrictions, attachment validation, and the production content security policy. Run `npm audit` when the network is available; a registry connectivity failure must be reported rather than treated as a clean audit result.

Shutdown and attachment changes should also verify that queued renderer saves are flushed before quit and that non-PNG or malformed image bytes are rejected at the main-process boundary.

The E2E and performance fixtures continuously observe the renderer's persistence and operation error messages. Any visible `.save-error` occurrence fails the test, including transient `Changes could not be saved:` and `Operation failed:` messages that disappear before the test completes. New persistence or autosave work must retain this guard and include a regression scenario for rapid edits or overlapping saves.

The fixtures register each launched Electron child process before waiting for readiness. Teardown requests the application shutdown handshake, waits on the child process exit event, then uses bounded SIGTERM/SIGKILL escalation and fails if the owned process remains alive. Save-status observation uses both a DOM mutation observer and a final collection, so transient document-save and attachment-cleanup errors are retained even if the status disappears before test teardown. Observations are released with their owning app, so restart tests never query stale Playwright pages during worker teardown.

If Electron shows a macOS crash dialog or a full suite fails during application launch, first treat it as a process-lifecycle failure. The E2E and performance fixtures clean up only stale Electron processes carrying their own temporary `tree-e2e-*` or `tree-perf-*` user-data marker, retry cleanup after launch failure, and include the launch error in the test failure. Do not use an unrestricted Electron process kill because it may terminate unrelated applications. After cleanup, rerun the isolated failing test and then the complete suite.

File-service diagnostics identify `load`, `save`, `writeAttachment`, `readAttachment`, `hasAttachment`, and `cleanupAttachments` operations, their phase, and the paths involved. Failures are logged with the original error message.

---

## 10. Development Workflow

For a small, well-defined task:

1. Read `AGENTS.md`.
2. Read the relevant sections of `docs/PRODUCT.md`.
3. Read the relevant sections of `docs/ARCHITECTURE.md`.
4. Reproduce the existing behavior or reported defect.
5. Inspect the existing implementation.
6. Implement the change.
7. Add or update tests, including boundary tests where applicable.
8. Update documentation if necessary.
9. Run `npm run check:full`.
10. Review the git diff and confirm no required test was blocked or skipped.
11. Commit the completed logical change.

For a larger or potentially architectural task:

1. Understand the requested product change.
2. Inspect the current implementation.
3. Create an implementation plan in `docs/plans/active/`.
4. Identify affected product, architecture, and tests.
5. Get Product Owner approval when the plan requires a product or architectural decision.
6. Implement the plan.
7. Update tests and documentation.
8. Run `npm run check:full`.
9. Move the completed plan to `docs/plans/completed/`.
10. Commit the completed change.

When a task ends at a commit or session boundary, provide a handoff recording what was completed, validation that passed, validation that failed or was blocked, unresolved issues, and the exact next task. Include a suggested prompt for resuming the work. An incomplete validation result must never be presented without a follow-up action.

---

## 11. Implementation Plans

Implementation plans are used for work that is too large or complex to safely implement as a single small task.

Plans should describe:

* the goal;
* current relevant behavior;
* proposed changes;
* affected modules;
* data model or persistence changes;
* testing strategy;
* documentation changes;
* important risks or open questions.

Plans should not duplicate the entire product specification.

Active plans:

```text
docs/plans/active/
```

Completed plans:

```text
docs/plans/completed/
```

Plan filenames are numbered sequentially, for example `0001-bootstrap-application.md`. See `AGENTS.md` §8 for the naming rules and required metadata.

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

They measure startup, typing, and state/persistence work at several document scales and print one JSON line per scenario. The recorded budgets, measured baselines, and scenario parameters are owned by the `perf/` suite; they are not restated here.

Each typing scenario focuses a specific input, asserts the seeded text is present and focused, types, and asserts the field received the typed text while the current-parent heading was not edited. This matters inside a parent, where the first textbox is the current-parent heading rather than the selected child. The scenario measures wall-clock typing time and paint latency; the `inputTurnaround` metric is an observation only, not React commit latency. The supported document-scale target is 100,000 nodes.

The state/persistence scenario in `perf/state.spec.ts` seeds a large attachment-bearing document and runs a structural burst, a typed-word burst, and a reference-changing delete; a second scenario exercises attachment-bearing history through structural commands, undos, and redos; a third measures attachment image validation and write latency. Each prints its measurements and enforces ceilings. The save count confirms the automatic save policy triggers on inserted-word volume rather than per keystroke, and the cleanup scan duration guards the reference-changing path against unbounded history or document scanning. The budgets and their measured baselines are recorded by the `perf/` suite and the completed implementation plan that introduced each scenario.

Behavioral guards live next to the code they protect and are named after the behavior they assert. The main guard families are automatic-save accounting (`editor-store.test.ts`, `editor-store.property.test.ts`), attachment and PNG validation (`ipc-security.test.ts`, `ipc-handlers.test.ts`, `png-decoder.test.ts`, `e2e/attachment-validation.spec.ts`), image-display failures (`AttachmentPreview.test.tsx`, `e2e/attachment-validation.spec.ts`), window-geometry coalescing and attachment-existence I/O (`window-state.test.ts`, `file-services.test.ts`), retention and byte reuse of attachment references (`editor-history.test.ts`, `attachment-bytes-cache.test.ts`), save serialization, node lookup, path copying, and attachment-id collection (`document.test.ts`, `document.property.test.ts`), and external hyperlink opening (`e2e/hyperlink.spec.ts`). The completed implementation plan that introduced each guard records its requirement mapping and original rationale.

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

## 17. Git Workflow

Git discipline — one logical commit per task, commit messages, preserving user changes, immediate follow-up fixes, and session boundaries — is defined in `AGENTS.md` §12.

Commit messages follow the Conventional Commits format defined in `AGENTS.md` §12. Run `npm run changelog` to regenerate `CHANGELOG.md` from that history, and `npm run plan:index` to regenerate `docs/plans/README.md`.

Before committing, review the change with:

```bash
git status
git diff
```

Confirm that only intentional files are modified. Do not use destructive git commands unless explicitly requested.

---

## 18. Handling Existing Changes

The rule for handling existing uncommitted changes is in `AGENTS.md` §12: inspect and preserve them, and do not overwrite, reset, or discard them. If existing changes make the task ambiguous or unsafe, ask the Product Owner.

---

## 19. Documentation Updates

Documentation responsibilities and the mapping from a change to the document that owns it are defined in `AGENTS.md` §11. Each fact must have one primary source of truth.

---

## 20. Definition of Done

The completion criteria for a task are defined in `AGENTS.md` §13. When the task is complete, commit it as a focused logical change.
