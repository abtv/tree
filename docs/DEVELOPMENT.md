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

Tests should primarily cover domain and application behavior.

Domain tests must not require Electron or a browser environment.

Vitest uses the Node.js environment by default. Renderer tests opt into jsdom when behavior requires a DOM.

End-to-end tests live in `e2e/` and run with:

```bash
npm run test:e2e
```

This command builds the application and runs Playwright against the production build in `out/`. Each test launches the real Electron application with an isolated `--user-data-dir`, so persistence and attachments are exercised without touching developer data. The suite runs serially with a single worker because of the single-instance application and the global `Cmd+0` shortcut. The suite is macOS-only and requires a display.

Playwright and Vitest must not run each other's tests: Vitest excludes `e2e/**`, and Playwright only reads `e2e/`.

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
3. tests;
4. production build.

The repository must also provide the complete validation command:

```bash
npm run check:full
```

This runs `npm run check` and then the end-to-end suite. Changes that touch the Electron shell, preload/IPC, persistence, attachments, or clipboard behavior must be validated with `npm run check:full`.

A task is not considered complete until the appropriate validation command passes successfully.

---

## 10. Development Workflow

For a small, well-defined task:

1. Read `AGENTS.md`.
2. Read the relevant sections of `docs/PRODUCT.md`.
3. Read the relevant sections of `docs/ARCHITECTURE.md`.
4. Inspect the existing implementation.
5. Implement the change.
6. Add or update tests.
7. Update documentation if necessary.
8. Run the appropriate validation (`npm run check`, or `npm run check:full` for integration-sensitive changes).
9. Review the git diff.
10. Commit the completed logical change.

For a larger or potentially architectural task:

1. Understand the requested product change.
2. Inspect the current implementation.
3. Create an implementation plan in `docs/plans/active/`.
4. Identify affected product, architecture, and tests.
5. Get Product Owner approval when the plan requires a product or architectural decision.
6. Implement the plan.
7. Update tests and documentation.
8. Run the appropriate validation (`npm run check`, or `npm run check:full` for integration-sensitive changes).
9. Move the completed plan to `docs/plans/completed/`.
10. Commit the completed change.

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

Every user-visible behavior described in `docs/PRODUCT.md` must have at least one automated test. Behaviors that cross a process, persistence, or platform boundary — the Electron shell, preload/IPC, persistence, attachments, clipboard, drag-and-drop, and global shortcuts — must also have an end-to-end test, in addition to any unit test for the underlying rule.

Coverage reporting (`npm run test:coverage`) is a gap-finder, not a target. Do not add tests solely to raise the number. When behavior changes, review the affected product requirements and confirm each one still has coverage at the appropriate level.

Property-based tests using `fast-check` cover domain invariants and `EditorStore` command sequences. They run as part of `npm test` and are written as `*.property.test.ts` files.

When a change affects domain invariants — tree structure, ordering, node identity, serialization, cursor or paste transforms, or undo/redo consistency — add or update a property test for the affected invariants. They are not a coverage target. Boundary wiring and presentation changes do not require property tests.

Performance tests live in `perf/` and run with:

```bash
npm run test:perf
```

They measure startup and typing latency at several document scales and print one JSON line per scenario. They are separate from `check` and `check:full`; thresholds are intentionally loose and exist to catch catastrophic regressions, with baselines recorded in the associated plan.

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

The project should preserve the architectural boundaries described in:

```text
docs/ARCHITECTURE.md
```

In particular:

* React components should contain presentation and UI interaction logic;
* product and business rules belong outside React components;
* Electron-specific behavior belongs in the appropriate Electron/infrastructure layer;
* persistence belongs in infrastructure;
* clipboard access belongs in infrastructure;
* attachment filesystem access belongs in infrastructure;
* domain logic must remain independently testable.

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

Keep commits focused on one logical change.

Prefer:

```text
one task → one logical commit
```

Do not mix unrelated refactoring with a feature unless the refactoring is required for that feature.

Before committing:

```bash
git status
git diff
```

Review the changes and verify that only intentional files are modified.

Do not rewrite or remove unrelated user changes.

Do not use destructive git commands unless explicitly requested.

---

## 18. Handling Existing Changes

Before modifying files, inspect the current git state.

If the working tree contains changes that were not created by the current task:

* do not overwrite them;
* do not reset them;
* do not discard them.

Work around existing changes when possible.

If existing changes make the task ambiguous or unsafe, ask the Product Owner.

---

## 19. Documentation Updates

Update documentation when implementation changes affect:

* product behavior → `docs/PRODUCT.md`;
* architecture → `docs/ARCHITECTURE.md`;
* development workflow → `docs/DEVELOPMENT.md`;
* a significant architectural decision → `docs/decisions/`;
* an active implementation plan → the relevant plan in `docs/plans/active/`.

Avoid duplicating the same information across documents.

Each fact should have one primary source of truth.

---

## 20. Definition of Done

A development task is complete when:

* the requested implementation is complete;
* relevant tests are present or updated;
* existing tests pass;
* type checking passes;
* linting passes;
* the production build passes;
* `npm run check` passes;
* relevant documentation is updated;
* no temporary or debugging code remains;
* the git diff contains only intentional changes.

The task should then be committed as a focused logical change.
