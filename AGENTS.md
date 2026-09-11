# AGENTS.md

## 1. Project Role

The user is the Product Owner.

The coding agent is responsible for implementing the product, maintaining the codebase, writing tests, and keeping the technical documentation consistent with the implementation.

The agent is not the Product Owner and must not silently change product requirements.

---

## 2. Source of Truth

Before making changes, read the documentation relevant to the task:

* `docs/PRODUCT.md` — product behavior and user-visible requirements.
* `docs/ARCHITECTURE.md` — technical architecture and architectural boundaries.
* `docs/DEVELOPMENT.md` — development workflow, tooling, testing, and validation.
* `AGENTS.md` — rules for working on the repository.

If documentation conflicts with existing code, do not silently choose one. Determine whether the discrepancy is an implementation bug or a documentation change, and ask the Product Owner when the intended behavior is unclear.

---

## 3. Language

All repository documentation must be written in English.

This includes:

* Markdown documentation.
* Product specifications.
* Architecture documentation.
* Development documentation.
* Implementation plans.
* Architecture Decision Records.
* Code comments.
* Agent-facing instructions.

The Product Owner may communicate with the agent in any language.

---

## 4. General Working Rules

* Keep changes focused on the requested task.
* Do not introduce unnecessary abstractions or complexity.
* Prefer simple, maintainable solutions.
* Preserve existing behavior unless the task explicitly changes it.
* Do not silently change product behavior.
* Do not silently change the data model, persistence model, technology stack, or major architectural boundaries.
* Make small implementation decisions autonomously when they do not affect product behavior or architecture.
* Ask the Product Owner when an ambiguity can materially affect UX, product behavior, data, persistence, or architecture.

---

## 5. Product Changes

`docs/PRODUCT.md` is the source of truth for user-visible behavior.

When a requested change modifies product behavior:

1. Identify the affected product requirements.
2. If the requirement is ambiguous, ask the Product Owner.
3. Update `docs/PRODUCT.md` when the new behavior is approved.
4. Create an implementation plan when the change is large enough to require one.
5. Implement the change.
6. Add or update tests.
7. Run the required validation.
8. Commit the completed logical change.

Do not make product decisions on behalf of the Product Owner.

---

## 6. Architecture Changes

`docs/ARCHITECTURE.md` is the source of truth for technical architecture.

Architecture changes require explicit Product Owner approval when they change:

* the technology stack;
* major architectural boundaries;
* the domain model;
* the persistence model;
* dependency direction;
* process boundaries;
* other fundamental architectural decisions.

Small implementation details inside the existing architecture may be decided autonomously.

---

## 7. Domain and UI Separation

Business logic must not be implemented inside React components, React hooks, JSX, or UI-specific code.

The domain layer must remain independent of:

* React;
* the DOM;
* Electron;
* browser APIs;
* filesystem APIs;
* other infrastructure implementations.

UI code should dispatch application commands/use cases rather than directly manipulating the domain model.

Domain logic must be unit-testable without launching Electron or a browser environment.

---

## 8. Plans and Architecture Decisions

Use implementation plans for tasks that are large enough to benefit from explicit planning.

Plans belong in:

```text
docs/plans/active/
docs/plans/completed/
```

Plan filenames must use:

```text
YYYY-MM-DD-short-description.md
```

The date is the plan's creation date. The short description must use lowercase words separated by hyphens, for example:

```text
2026-09-11-bootstrap-application.md
```

Every plan must include the following metadata near the beginning of the document:

```text
Status: Active
Created: YYYY-MM-DD
```

When a plan is completed:

1. Change its status to `Completed`.
2. Add `Completed: YYYY-MM-DD` to its metadata.
3. Move the same file from `docs/plans/active/` to `docs/plans/completed/` without changing its filename.

Do not create a second copy of a plan when completing it.

Use Architecture Decision Records (ADRs) for important technical or architectural decisions that are worth preserving for future development.

ADRs belong in:

```text
docs/decisions/
```

Create these directories only when they are first needed. Do not create empty directories in advance.

Plans and ADRs must not be used to silently introduce or change product requirements.

If a plan or architectural decision would affect product behavior, the Product Owner must approve the relevant product change first.

---

## 9. Tests

Tests are part of the implementation contract.

When behavior changes, add or update appropriate tests.

Domain behavior should be covered by unit tests wherever practical.

Tests must verify important edge cases, not only the happy path.

Do not remove or weaken tests merely to make an implementation pass.

---

## 10. Validation

Before considering a task complete, run:

```text
npm run check
```

`npm run check` must provide the project's complete validation pipeline, including the relevant type checking, linting, tests, and build validation.

If validation fails, fix the problem before considering the task complete.

If a failure is unrelated to the current task, report it explicitly rather than hiding or ignoring it.

---

## 11. Documentation

Keep documentation consistent with the implementation.

Update documentation when a change affects:

* product behavior;
* architecture;
* development workflow;
* important technical decisions.

Do not duplicate the same information across multiple documents unless there is a clear reason.

Keep each document focused on its responsibility:

* `PRODUCT.md` — what the product does.
* `ARCHITECTURE.md` — how the software is structured.
* `DEVELOPMENT.md` — how the software is developed and validated.
* `AGENTS.md` — how the coding agent should work.

---

## 12. Git

Use Git throughout development.

Prefer one logical task per commit.

Commit messages should clearly describe the implemented change.

Do not rewrite or discard existing user changes unless explicitly instructed.

Before modifying files with existing uncommitted changes, inspect those changes and preserve them.

---

## 13. Completion Criteria

A task is complete only when:

* the requested behavior is implemented;
* relevant tests are added or updated;
* documentation is updated when necessary;
* `npm run check` passes;
* no unrelated behavior was changed;
* the repository remains in a coherent state.

If the task is large enough to require a plan, the plan must also be updated to reflect the completed work.

---

## 14. When to Ask the Product Owner

Ask the Product Owner instead of guessing when:

* two reasonable interpretations would produce different user experiences;
* a requirement is missing or contradictory;
* a change would alter the product's behavior;
* a change would alter the data or persistence model;
* a change would require a major architectural decision;
* backward compatibility or migration behavior is unclear;
* destructive behavior is not explicitly defined;
* an implementation choice could significantly constrain future product development.

For ordinary implementation details that do not affect these areas, make a reasonable decision and proceed.
