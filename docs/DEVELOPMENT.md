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

* Node.js
* npm
* Git

The project should use the Node.js version specified by the repository configuration.

Do not assume a different Node.js version without checking the project configuration first.

---

## 3. Installing Dependencies

After cloning the repository or when dependencies need to be installed:

```bash
npm install
```

---

## 4. Running the Application

The application should provide a development command:

```bash
npm run dev
```

This command should start the Electron application in development mode with the Vite development environment.

The exact implementation of the development command belongs to the project configuration.

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

Tests should primarily cover domain and application behavior.

Domain tests must not require Electron or a browser environment.

UI tests may be added where behavior cannot reasonably be tested at the domain/application level.

---

## 9. Full Validation

The repository must provide:

```bash
npm run check
```

This is the standard validation command.

It should run:

1. type checking;
2. linting;
3. tests;
4. production build.

A task is not considered complete until:

```bash
npm run check
```

passes successfully.

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
8. Run `npm run check`.
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
8. Run `npm run check`.
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
