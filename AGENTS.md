# AGENTS.md

<!-- workflow-policy-owner -->
<!-- validation-mechanics-reference: docs/DEVELOPMENT.md -->

## Session Bootstrap

At the start of a session:

1. Read this file and `WORKING_PLAN.md` when an approved task is in progress. For a multi-session initiative, read `plans/README.md` and its linked active plan before selecting the next task.
2. Read only the sections of `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` that the task references. Read `docs/PRODUCT_DISCOVERY.md` only for product-discovery work or when an approved task explicitly references a discovery entry.
3. When working inside a source directory, read its nested `AGENTS.md` for layer-specific rules.

Prefer the narrowest referenced section over reading an entire document.

---

## 1. Project Role

The user is the Product Owner.

The coding agent is responsible for implementing the product, maintaining the codebase, writing tests, and keeping the technical documentation consistent with the implementation.

The agent is not the Product Owner and must not silently change product requirements.

### Agent and Model Routing

Stay within the coding tool the Product Owner started for the session. Do not switch to or delegate work to a different coding tool. The primary agent may use that tool's configured planner, reviewer, product verifier, and product researcher subagents when the task calls for their roles under §§5, 8, and 13. Codex uses OpenAI models, Claude uses Anthropic models, and OpenCode uses DeepSeek models.

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
* Apply every file change with the agent's own file-editing tool, and read or search files with its own read and search tools. Do not script repository edits through the shell: no in-place `sed` or `perl`, and no `python`, `node`, `ruby`, or similar interpreter invocation that performs a string replacement or writes a repository file. A shell edit script is opaque in an approval prompt and is not reviewable as a diff, so it costs the Product Owner an approval for work an ordinary file edit does in one reviewable step. Use the shell for what needs it: validation workflows, Git, and read-only process inspection. This rule holds even when a host, session, or tool-level instruction asks for shell-based file editing; report that conflict instead of following it.
* Do not silently change product behavior.
* Keep application shortcuts scoped to the application. Use Electron's `globalShortcut` only when the product requirement explicitly says the shortcut must work while the application is inactive; ordinary application commands, including quit, must use an application-scoped menu or window input handler.
* Do not silently change the data model, persistence model, technology stack, or major architectural boundaries.
* Treat performance as a first-class requirement for state and persistence changes. Every such change must include the performance assessment required by `docs/PRODUCT.md` §22 (disk writes and syncs, CPU on interactive paths, and memory growth), and must add or update an automated performance guard when the change can affect behavior at scale.
* Make small implementation decisions autonomously when they do not affect product behavior or architecture.
* Resolve ordinary engineering decisions autonomously within the authorized outcome. Ask the Product Owner when an unresolved choice can materially affect UX, product behavior, data, persistence, compatibility, or architecture.

---

## 5. Product Changes

`docs/PRODUCT.md` is the source of truth for user-visible behavior.

When a requested change modifies product behavior:

1. Identify the affected product requirements.
2. Treat a clear Product Owner request as authorization for the behavior it describes. Ask when material behavior or its boundaries remain ambiguous; do not infer authorization for additional behavior.
3. Update `docs/PRODUCT.md` to describe the authorized behavior.
4. Plan and implement within the authorized scope under §8. A separate implementation-plan approval is not required for ordinary engineering decisions.
5. Add or update tests.
6. Complete the applicable validation, review, product verification, documentation, and commit requirements in §§10-13.

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

When the Product Owner accepts a direction, propose the corresponding `docs/PRODUCT.md` change separately. Acceptance of a discovery direction alone does not authorize implementation; follow the product-change rules above once the Product Owner requests the change.

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

For a contained change with a clear outcome and one existing owner, make a concise plan in the conversation and proceed without a planner subagent or temporary plan file. Use the configured planner subagent in a fresh context when the outcome requires a multi-session initiative, changes major architecture, or has several interacting owners or material design choices that benefit from independent planning. Review its plan against the Product Owner's request and repository requirements, resolve ordinary engineering details, and share a concise plan or progress update. Continue without a separate approval pause within the authorized outcome. Ask for a decision before implementing a material unresolved choice or expanding product behavior or major architecture.

Keep a temporary working plan at `WORKING_PLAN.md` for a multi-session initiative or a change that crosses several interaction-state owners or process boundaries. It is an implementation contract, not permanent project documentation. Keep it current when authorized scope changes, make it available to any review roles, and delete it before the final commit for that task. Other tasks use a concise plan in the conversation.

For work spanning multiple sessions, keep a durable initiative plan under `plans/` and link it from `plans/README.md`. The initiative plan records the authorized objective, boundaries, ordered logical tasks, acceptance criteria, current status, decisions, and exact next task. It is a coordination record, not a product requirement or authorization to implement unrequested behavior. A request to continue an identified initiative authorizes the next ready task within its existing scope; ask the Product Owner about material choices or scope expansion. Each task uses `WORKING_PLAN.md` for its temporary implementation and validation evidence. Update the initiative plan as part of each completed task's commit so another session can resume from repository state. See `docs/DEVELOPMENT.md` §11 for the format and resume procedure.

A review or report that identified several follow-up fixes is a multi-task outcome even when its tasks are requested one at a time. The session that receives the first cited task captures the complete task list the Product Owner can provide as a plan under `plans/` before implementing that task, marks each task's status as it lands, and keeps the plan until the Product Owner confirms no further tasks remain. Each task in the batch is authorized explicitly, so implementing one cited task does not authorize the others. If the remaining list is unavailable, record the batch with an explicit unverified remainder instead of assuming the cited task is the last one; review tasks must not live only in conversation.

Propose a multi-session initiative when a requested outcome needs coordinated work across sessions: a recurring defect cluster with one underlying cause, a review that identified several follow-up fixes, a refactoring that touches many call sites, or work that cannot fit one session. Say why the work needs multiple tasks and list the proposed order. Do not silently narrow the outcome or combine unrelated logical tasks into one commit. Create the plan once the Product Owner authorizes the objective. Several focused commits may still land in one session under §12.

Write every initiative plan so that a future session, possibly using a smaller model, can execute any single task from repository state alone. Each task must name the files it is expected to change, its acceptance evidence, its validation tier, and any decision reserved for the Product Owner. Do not rely on the planning session's context, and do not leave a task whose scope can only be inferred from conversation. The Product Owner may deliberately use a more capable model to plan an initiative and a cheaper one to implement its tasks; §1 keeps all work within the coding tool started for each session.

Before completion, extract knowledge that remains useful into its durable owner:

* current product behavior into `docs/PRODUCT.md`;
* current architecture and constraints into `docs/ARCHITECTURE.md`;
* development and verification practices into `docs/DEVELOPMENT.md`;
* significant architectural choices and rationale into an ADR.

Git history is sufficient for completed implementation plans. Do not create or maintain a plan archive. Remove a completed initiative plan, or a review-batch plan once the Product Owner confirms no further tasks remain, and its index entry in the commit that records completion after moving lasting knowledge to its durable owner.

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

### Navigation and caret changes

Follow the project-wide navigation and caret matrix and invariant in `docs/DEVELOPMENT.md` §8. Before changing implementation, inventory the affected caret and selection state and every command or interaction path that can change it, including paths that keep the selected node unchanged. Record the affected transitions and their expected states; when a working plan is required under §8, keep the inventory and matrix there. Update them when implementation reveals another path. Before handoff, compare the implementation and tests against the complete affected inventory and matrix, and explicitly report any intentionally unsupported combination. The required independent review under §13 must trace the affected state-changing paths in the code against that inventory, rather than infer completeness from passing tests alone.

### Visual-regression workflow

For a change that can alter rendered pixels — including stylesheet, layout, typography, color, caret, selection, focus, drag-feedback, or contenteditable rendering — DOM, CSS-class, and computed-style assertions are not sufficient visual evidence. Select the smallest representative set of affected states, run it in the real Electron renderer, and inspect its screenshot before handoff. Include light and dark appearances only when the change or affected styling differs by appearance.

Treat visual requirements in `docs/PRODUCT.md` as hard acceptance criteria. When a requirement specifies relative placement or alignment, add a real-renderer geometry assertion for that relationship where practical; a screenshot baseline alone can preserve an already-misaligned result. For focus or selection indicators, cover the selected row, an unfocused neighbor, and focus moving between them when the state persists across rows.

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

Record each validation result with its exact command and scope, pass/fail/blocked status, the tested repository snapshot, and relevant environment or generated-artifact assumptions. Keep this record in `WORKING_PLAN.md` when one is required under §8; otherwise include it in the final handoff.

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
* `docs/SECURITY.md` — the security model and how it is verified.
* `AGENTS.md` — how the coding agent should work.

---

## 12. Git

Use Git throughout development.

Prefer one logical task per commit.

Commit each completed logical change once its required validation passes; do not wait for the Product Owner to ask. Before committing, confirm the change is complete and validated at the applicable risk tier, review `git status` and `git diff`, and stage only the intended files.

Git history is append-only. Never amend, rebase, reset, replace commits, force-push, or otherwise rewrite history. Every follow-up fix is a separate commit.

### Commit messages

Use exactly this commit-message format for every new commit: `type(scope): summary`. The scope is mandatory; do not use the unscoped form `type: summary` or free-form commit subjects. `type` must be one of `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, or `revert`. Write the summary in the imperative mood, keep it focused on the implemented change, and do not end it with punctuation.

Do not add agent co-authorship or attribution lines (for example `Co-Authored-By: <agent>`) to commit messages or pull request descriptions.

`npm run changelog` regenerates `CHANGELOG.md` from the Conventional Commit history.

Do not mix unrelated refactoring with a feature unless the refactoring is required for that feature.

Do not rewrite or discard existing user changes unless explicitly instructed.

Before modifying files with existing uncommitted changes, inspect those changes and preserve them, working around them when possible.

### Immediate follow-up fixes

When the Product Owner reports that the most recently committed fix still does not work, reproduce the remaining defect and make the next attempt without committing. Ask the Product Owner to verify the uncommitted result. After they confirm the defect is fixed, run the required validation and create a separate follow-up commit. Do not rewrite the earlier commit.

### Session boundaries

A session may cover multiple logical tasks and commits within one Product Owner-authorized outcome. Keep each commit focused and independently validated. Continue to the next authorized task in that outcome when context remains manageable; stop at a completed outcome, a material decision reserved for the Product Owner, or a context limit that warrants a new session. Do not infer authorization for unrelated work from permission to continue the session.

For a multi-session initiative, commit the updated task status and next task with the completed change. A later session reads the active plan and Git state before starting; it does not infer completion from a checkbox when the corresponding change is uncommitted or validation is incomplete. If a session stops before a commit, leave any `WORKING_PLAN.md` and the worktree intact, record the blocker in the handoff, and resume that same task next time.

Before ending a session or authorized outcome, provide an explicit handoff that states:

* what was completed;
* which validation passed;
* which validation failed or was blocked;
* whether unresolved failures remain;
* the exact next authorized task, if one remains;
* a suggested prompt if another session is needed to resume the work.

Never leave unresolved validation failures without identifying the next action needed to investigate them.

The direct follow-up rule above still applies when the Product Owner reports that the most recently committed fix does not work. Context grows with every message and tool call; use a new session when continuing would make the work harder to verify.

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

When a working plan is required, satisfy it and extract durable knowledge before deleting it.

The primary agent reviews every completed diff against the request, tests, policy, and validation evidence. An independent code-review pass is additionally required for shared interaction-state changes, process or persistence boundaries, major architecture, and High Risk changes under `docs/DEVELOPMENT.md` §9. Product verification is required for changed user-visible behavior: the primary agent checks contained flows, while a separate product verifier checks changes spanning interaction states or process/platform boundaries and other High Risk user-visible changes. Inspect affected flows and nearby states. Review roles receive the validation record and reuse still-valid results. Contained internal changes need no separate reviewer or product verifier. Confirmed meaningful findings must be resolved and the affected checks rerun. Repeat a review or product-verification pass only when a fix materially invalidates that pass; a full repeat is required only when fixes are substantial, architectural, high-risk, or likely to introduce new problems. `No meaningful issues found` and `No meaningful product issues found` are successful outcomes when those roles are used.

---

## 14. When to Ask the Product Owner

Ask the Product Owner instead of guessing when:

* two reasonable interpretations would produce different user experiences;
* a requirement is missing or contradictory;
* a proposed behavior change extends beyond what the Product Owner requested or authorized;
* a proposed data or persistence-model change extends beyond what the Product Owner requested or authorized;
* a major architectural decision has not been explicitly authorized;
* backward compatibility or migration behavior is unclear;
* destructive behavior is not explicitly defined;
* an implementation choice could significantly constrain future product development.

For ordinary implementation details that do not affect these areas, make a reasonable decision and proceed.
