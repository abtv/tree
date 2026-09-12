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
* Do not chain shell commands with `&&`, `||`, or `;`. Run commands in separate tool calls so approvals remain predictable and the Product Owner is not prompted repeatedly for a chained command.
* Do not silently change product behavior.
* Keep application shortcuts scoped to the application. Use Electron's `globalShortcut` only when the product requirement explicitly says the shortcut must work while the application is inactive; ordinary application commands, including quit, must use an application-scoped menu or window input handler.
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
NNNN-short-description.md
```

The number is a zero-padded sequential number assigned in order of plan creation, using the next available number across active and completed plans. The short description must use lowercase words separated by hyphens, for example:

```text
0001-bootstrap-application.md
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

Every user-visible behavior described in `docs/PRODUCT.md` must be covered by at least one automated test. Behaviors that cross a process, persistence, or platform boundary — the Electron shell, preload/IPC, persistence, attachments, clipboard, drag-and-drop, and global shortcuts — must also have an end-to-end test, in addition to any unit test for the underlying rule.

Domain behavior should be covered by unit tests wherever practical.

Tests must verify important edge cases, not only the happy path.

Coverage percentages are a gap-finding tool, not a target. Do not add tests solely to raise coverage. When product behavior changes, review the affected `docs/PRODUCT.md` requirements and confirm each one still has coverage at the appropriate level.

Property-based tests using `fast-check` guard domain invariants. When a change affects tree structure, ordering, node identity, serialization, cursor or paste transforms, or undo/redo consistency, add or update a property test for the affected invariants. Property tests are named `*.property.test.ts`, run with the unit suite, and are not a coverage target. Boundary wiring and presentation changes do not require property tests.

Do not remove or weaken tests merely to make an implementation pass.

### Defect-first workflow

When fixing a reported defect:

1. Reproduce the defect before changing the implementation.
2. Add a regression test that fails because of the defect.
3. Implement the fix.
4. Confirm that the regression test passes.
5. When practical, verify that the test fails again when the fix is reverted or bypassed.
6. Run the relevant broader test suites.

Do not consider a defect fixed based only on code inspection, type checking, or a newly added test that does not reproduce the reported failure.

### Boundary testing

Any change crossing a process, IPC, filesystem, persistence, clipboard, attachment, native shortcut, or platform boundary must include:

* a focused unit test for the underlying rule;
* a contract test for channel names, arguments, return values, and error propagation;
* an end-to-end test exercising the real boundary.

TypeScript types do not prove that runtime values are forwarded correctly across a boundary. Do not substitute broad UI coverage for a focused contract test when a boundary is changed.

Shutdown, startup, persistence, or quit changes must cover the success path and relevant failure paths, including pending-save flushing, save failure, timeout, retry, duplicate requests, application-menu quit, window close, and renderer unavailability.

---

## 10. Validation

`npm run check` is the fast local pipeline: type checking, linting, unit and component tests, and the production build.

`npm run check:full` is the complete validation pipeline. It runs `npm run check`, the end-to-end test suite, and the performance suite. Run it before every commit.

If validation fails, fix the problem before considering the task complete.

If a failure is unrelated to the current task, report it explicitly rather than hiding or ignoring it.

A test suite that cannot launch the application or execute the relevant boundary is not considered passed. If validation is blocked by the environment, report the exact blocked suite, identify the supported environment required to run it, and do not claim full validation.

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

### Immediate follow-up fixes

When the Product Owner requests a fix directly related to the most recently committed change, do not create a new plan or a new commit. Update the existing plan and amend the last commit with `git commit --amend` instead. If the fix changes the plan's scope, update the plan content and rename the plan file to match. This applies only to direct follow-ups to the most recent commit; unrelated changes get their own plan and commit.

### Session boundaries

A session should cover a single logical task.

After a commit completes a logical task, stop working and tell the Product Owner to start a new session before beginning the next task. Do not continue with a new, unrelated task in the same session.

Before stopping after a commit, provide an explicit handoff that states:

* what was completed;
* which validation passed;
* which validation failed or was blocked;
* whether unresolved failures remain;
* the exact next task to start;
* a suggested prompt the Product Owner can use to resume the work.

Never leave unresolved validation failures without identifying the next action needed to investigate them.

The only exception is a direct follow-up fix to the most recently committed change, which stays in the current session as described above.

Context grows with every message and tool call, increasing cost and latency. A new session per task keeps the context small and focused.

---

## 13. Completion Criteria

A task is complete only when:

* the requested behavior is implemented;
* every affected `docs/PRODUCT.md` behavior has coverage at the appropriate level (a unit test for the rule, and an end-to-end test for boundary wiring);
* relevant tests are added or updated;
* documentation is updated when necessary;
* `npm run check:full` passes;
* no required end-to-end test is skipped because of the environment;
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
