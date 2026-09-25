# AGENTS.md

<!-- workflow-policy-owner -->
<!-- validation-mechanics-reference: docs/DEVELOPMENT.md -->

## Session Bootstrap

At the start of a session:

1. Read this file and `WORKING_PLAN.md` when an approved task is in progress.
2. Read only the sections of `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` that the task references. Read `docs/PRODUCT_DISCOVERY.md` only for product-discovery work or when an approved task explicitly references a discovery entry.
3. When working inside a source directory, read its nested `AGENTS.md` for layer-specific rules.

Prefer the narrowest referenced section over reading an entire document.

---

## 1. Project Role

The user is the Product Owner.

The coding agent is responsible for implementing the product, maintaining the codebase, writing tests, and keeping the technical documentation consistent with the implementation.

The agent is not the Product Owner and must not silently change product requirements.

---

## 2. Source of Truth

Before making changes, read the documentation relevant to the task:

* `docs/PRODUCT.md` — product behavior and user-visible requirements.
* `docs/PRODUCT_DISCOVERY.md` — non-normative product hypotheses, experiments, evidence, and decisions; it is never an implementation requirement.
* `docs/ARCHITECTURE.md` — technical architecture and architectural boundaries.
* `docs/DEVELOPMENT.md` — development workflow, tooling, testing, and validation.
* `docs/AGENT_ROLES.md` — the formal, tool-agnostic definition of each agent role (planner, reviewer, product verifier, product researcher) and their security posture; every coding-agent tool's config implements it.
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
* Treat performance as a first-class requirement for state and persistence changes. Every such change must include the performance assessment required by `docs/PRODUCT.md` §22 (disk writes and syncs, CPU on interactive paths, and memory growth), and must add or update an automated performance guard when the change can affect behavior at scale.
* Make small implementation decisions autonomously when they do not affect product behavior or architecture.
* Ask the Product Owner when an ambiguity can materially affect UX, product behavior, data, persistence, or architecture.

---

## 5. Product Changes

`docs/PRODUCT.md` is the source of truth for user-visible behavior.

When a requested change modifies product behavior:

1. Identify the affected product requirements.
2. If the requirement is ambiguous, ask the Product Owner.
3. Update `docs/PRODUCT.md` when the new behavior is approved.
4. Obtain approval for the implementation plan before changing behavior.
5. Implement the approved change.
6. Add or update tests.
7. Complete the validation, independent review, product verification, documentation, and commit requirements in §§10-13.

Do not make product decisions on behalf of the Product Owner.

### Product Discovery

`docs/PRODUCT_DISCOVERY.md` is the durable research notebook for uncertain product questions. It is not a backlog, specification, or source of implementation authority.

For product-discovery tasks, agents may:

* record observations and Product Owner statements without changing their meaning;
* frame hypotheses and counter-hypotheses;
* distinguish repository facts, Product Owner statements, usage evidence, external evidence, and agent inference;
* propose the cheapest experiment capable of changing a decision;
* organize evidence and identify conflicts with established product principles.

Agents must preserve Product Owner disagreement instead of resolving it silently. They must not invent the Product Owner's position, set a discovery entry to `Accepted`, `Rejected`, or `Deferred`, or treat any discovery status as approval to change the product. Only the Product Owner makes discovery decisions.

When the Product Owner accepts a direction, propose the corresponding `docs/PRODUCT.md` change separately. The normal product-change and implementation-plan approval gates still apply before implementation.

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

For a substantive task, use the configured planner subagent in a fresh context after inspecting the relevant implementation and documentation. Present the plan to the Product Owner and do not begin implementation until it is explicitly approved.

After approval, keep the task's temporary working plan at `WORKING_PLAN.md` in the repository root. The plan is an implementation contract, not permanent project documentation. Keep it current when approved scope changes, make it available to review roles, and delete it before the final commit. Small, unambiguous tasks may use a concise plan in the conversation instead of a file.

Before completion, extract knowledge that remains useful into its durable owner:

* current product behavior into `docs/PRODUCT.md`;
* current architecture and constraints into `docs/ARCHITECTURE.md`;
* development and verification practices into `docs/DEVELOPMENT.md`;
* significant architectural choices and rationale into an ADR.

Git history is sufficient for completed implementation plans. Do not create or maintain a plan archive.

Use Architecture Decision Records (ADRs) for important technical or architectural decisions that are worth preserving for future development.

ADRs belong in:

```text
docs/decisions/
```

Create these directories only when they are first needed. Do not create empty directories in advance.

Every ADR records a `Status` of `Accepted` or `Superseded by ADR NNNN`, and `docs/decisions/README.md` indexes every ADR. `npm run check:docs` enforces both.

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

### Visual-regression workflow

For a change that can alter rendered pixels — including stylesheet, layout, typography, color, caret, selection, focus, drag-feedback, or contenteditable rendering — DOM, CSS-class, and computed-style assertions are not sufficient visual evidence. Select the smallest representative set of affected states, run it in the real Electron renderer, and inspect its screenshot before handoff. Include light and dark appearances only when the change or affected styling differs by appearance.

Add or update a deterministic screenshot regression test when practical. Its baseline must be deliberately inspected; accepting a generated image without inspection is not verification. For interactions such as rich text, test both the rendered state and the relevant behavior matrix (for example mode changes, selection, and pointer interaction) so a visual fix cannot silently break the interaction.

Committed screenshots, fixtures, and other visual-regression artifacts must contain only synthetic data. Do not include personal, confidential, or otherwise sensitive information in them.

Record the inspected states, command, and artifact location separately from automated validation. Reuse still-valid visual evidence rather than generating images for non-rendering changes or repeating inspection when the rendered inputs and states did not change.

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

End-to-end and performance fixtures must own the Electron processes they launch. The concrete registration, cleanup, crash-dialog, and bounded-teardown mechanics are in `docs/DEVELOPMENT.md` §9.

---

## 10. Validation

Select validation by the highest applicable risk tier in `docs/DEVELOPMENT.md` §9. The matrix defines the required commands and when `npm run check` or `npm run check:full` is mandatory. Focused checks remain the preferred development loop.

Record each validation result with its exact command and scope, pass/fail/blocked status, the tested repository snapshot, and relevant environment or generated-artifact assumptions. For an active substantive task, keep this validation record in `WORKING_PLAN.md`; include a summary in the final handoff.

For a visual-regression workflow, record the inspected states, command, screenshot artifact, and outcome as visual evidence; a passing DOM, CSS, or computed-style assertion does not substitute for this record.

Validation records are temporary task evidence, not permanent repository artifacts. Do not create a committed validation-log or plan archive unless the Product Owner explicitly approves a new audit requirement.

A passing result may be reused only for the same command and scope while its repository inputs, relevant environment, and generated inputs remain valid. A broader pass subsumes checks it actually contains; a focused pass never implies broader coverage. Agents must consume valid recorded results and must not rerun a check solely because work changed hands or for reassurance.

Edits invalidate only checks whose inputs or exercised behavior may have changed. Documentation-only edits do not invalidate runtime suites. Source edits invalidate affected static checks, tests, builds, and suites using prior build output. Test, fixture, dependency, build-tool, test-runner, or agent-policy changes invalidate their affected stages. Read-only review and verification do not invalidate results. After a fix, rerun the affected checks and their dependencies; repeat full validation only when required by the risk matrix or when a substantial, architectural, high-risk, or materially scope-changing fix invalidated it.

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

* `README.md` — the project identity and documentation index.
* `PRODUCT.md` — what the product does.
* `PRODUCT_DISCOVERY.md` — uncertain product questions, experiments, evidence, and Product Owner decisions that are not yet requirements.
* `ARCHITECTURE.md` — how the software is structured.
* `DEVELOPMENT.md` — how the software is developed and validated.
* `AGENT_ROLES.md` — the formal definition of each agent role, shared by every coding-agent tool's config.
* `SECURITY.md` — the security model and how it is verified.
* `AGENTS.md` — how the coding agent should work.

---

## 12. Git

Use Git throughout development.

Prefer one logical task per commit.

Commit each completed logical change once its required validation passes; do not wait for the Product Owner to ask. Before committing, confirm the change is complete and validated at the applicable risk tier, review `git status` and `git diff`, and stage only the intended files.

Git history is append-only. Never amend, rebase, reset, replace commits, force-push, or otherwise rewrite history. Every follow-up fix is a separate commit.

### Commit messages

Use exactly this commit-message format for every new commit: `type(scope): summary`. The scope is mandatory; do not use the unscoped form `type: summary` or free-form commit subjects. `type` must be one of `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, or `revert`. Write the summary in the imperative mood, keep it focused on the implemented change, and do not end it with punctuation.

`npm run changelog` regenerates `CHANGELOG.md` from the Conventional Commit history.

Do not mix unrelated refactoring with a feature unless the refactoring is required for that feature.

Do not rewrite or discard existing user changes unless explicitly instructed.

Before modifying files with existing uncommitted changes, inspect those changes and preserve them, working around them when possible.

### Immediate follow-up fixes

When the Product Owner reports that the most recently committed fix still does not work, reproduce the remaining defect and make the next attempt without committing. Ask the Product Owner to verify the uncommitted result. After they confirm the defect is fixed, run the required validation and create a separate follow-up commit. Do not rewrite the earlier commit.

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
* the highest applicable validation tier in `docs/DEVELOPMENT.md` §9 passes;
* no required end-to-end test is skipped because of the environment;
* no unrelated behavior was changed;
* the repository remains in a coherent state.

For a substantive task, the approved plan must be satisfied and its durable knowledge extracted before the temporary plan is deleted.

One independent code-review pass and one product-verification pass must complete after implementation and automated verification. Both roles receive the validation record and reuse still-valid results. For R0/R1 internal-workflow changes, code review checks policy ownership, consistency, command safety, tests, and fulfillment of the approved change. Product verification follows the agent workflow through representative relevant states, such as clean and dirty trees, failed stages, evidence reuse, and handoff; application UI exploration is not required when application behavior did not change. Confirmed meaningful findings must be resolved and the affected checks rerun. Repeat a review or product-verification pass only when a fix materially invalidates that pass; a full repeat is required only when fixes are substantial, architectural, high-risk, or likely to introduce new problems. `No meaningful issues found` and `No meaningful product issues found` are successful outcomes.

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
