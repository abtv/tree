# Agent Workflow Procedures

<!-- workflow-policy-reference: AGENTS.md -->

These are the binding detailed procedures of [AGENTS.md](../AGENTS.md), which remains the workflow policy owner. Read only the sections that the core requires for the current action. Section numbers match the core; paths in code spans are relative to the repository root. This document is live policy, not a historical archive. Keep detailed rules here and concise obligations and routing in the core. Validation commands and execution mechanics belong to `docs/DEVELOPMENT.md`.

---

## 1. Project Role

Apply the role, autonomy, and communication rules in [AGENTS.md §1](../AGENTS.md#1-project-role). The procedures below explain how to interpret requests and handle prototypes.

### Operating model

The target is delivery with as few owner interruptions as the risk allows. Apply §5 for product decisions and §14 for interruptions.

### Discussion

Not every message asks for a change. The Product Owner also thinks out loud: asking what the agent makes of an idea, whether the current process holds together, how two options compare, or where the repository already covers something. Recognize that from the request itself — "what do you think", "let's discuss", "analyze this", "is this a good idea", "compare these" — and treat it as a discussion rather than a task.

Apply the discussion write boundary in [AGENTS.md §1](../AGENTS.md#discussion). Explain which parts are already covered and where, and recommend whether anything needs to change.

### Interpreting work requests

The Product Owner-facing vocabulary and examples are in [Working with the Coding Agent](WORKING_WITH_AGENT.md). Infer the kind of work and whether it needs a task or initiative from the request; the Product Owner does not need to supply a formal work type. State the interpretation before substantial work, and ask only when ambiguity affects authorization, product behavior, or a material choice.

A concrete defect report is a request to investigate and correct the defect within recorded requirements. Follow the defect-first workflow, required validation, and commit policy when the defect is confirmed. A concrete usability problem with a clear result, such as an existing icon being hard to see, likewise authorizes a focused correction consistent with recorded intent; §5 still governs material choices. A tentative concern or an aesthetic preference without a clear result starts with discussion. A request to investigate authorizes evidence gathering, not implementation of newly proposed behavior. A comparison, specification draft, or proposed file text shown in the conversation changes no repository files.

Explicit requests to edit files while withholding a commit authorize edits and preserve that review condition across sessions. Do not treat a request for a draft in the conversation as authorization to edit its file. A request to record an agreed discussion or create a plan authorizes the corresponding documentation work, not the planned runtime implementation.

### Prototyping

When explicitly requested, make a reversible prototype for Product Owner feedback within the stated scope. Honor instructions to postpone tests, full validation, or commits during this stage. State what is provisional and what has actually been checked; do not represent a prototype as a completed or validated implementation. Preserve user changes and data, and raise material product, persistence, compatibility, or architecture choices before crossing those boundaries. A prototype request authorizes trying the requested behavior, not choosing additional product behavior under §5.

Iterate from feedback, keeping any review and no-commit conditions in force. When the Product Owner requests finalization, update the requirements for the authorized behavior, resolve material gaps, and complete the applicable tests, validation, review, documentation, and commit workflow in §§5 and 9-13. Liking a prototype or accepting a direction is not by itself a request to finalize. The `Exploratory` marker in `docs/PRODUCT.md` §1.2 remains a separate mechanism for implemented behavior and never waives validation.

### Agent and Model Routing

Apply the standing delegation authorization and tool/model boundaries in [AGENTS.md §1](../AGENTS.md#agent-and-model-routing). Read [Agent Roles](AGENT_ROLES.md) before delegation; §§5, 8, and 13 determine when the roles are needed.

---

## 2. Source of Truth

The complete source-ownership and conflict rule is in `AGENTS.md` §2. This supplement belongs to its workflow policy; it does not create another source of product or architecture requirements.

---

## 3. Language

Apply `AGENTS.md` §3 to every repository artifact, including this supplement. Conversation language does not change the repository language.

---

## 4. General Working Rules

Apply the scope, preservation, permission, and simplicity rules in [AGENTS.md §4](../AGENTS.md#4-general-working-rules). Execution details follow.

* Compare the complete command prefix before relying on a permission rule, including wrappers such as `/usr/bin/time -p`. Permission for a wrapped npm workflow does not establish permission for the wrapper. Historical approval does not prove current access; use the supported platform approval flow when necessary.
* Run the full built-browser suite in a Linux Chromium container with `npm run test:web:chromium`, without arguments, following [Development Guide, Chromium container tests](DEVELOPMENT.md#chromium-container-tests). In Codex, request host execution from the first invocation. Do not replace it with ad-hoc Docker commands or broaden the approval to Docker generally. Only the Product Owner runs dependency-image preparation (`make setup`). Agents must not run this target, build or pull replacement images, or install dependencies for this workflow. If preparation is missing or stale, stop the container-validation stage and report the owner's required command; continue independent work.
* In Codex, `.codex/rules/processes.rules` allows `kill -INT <pid>` and `kill -TERM <pid>` outside the sandbox. Before stopping a process, inspect current process information and verify that the target was launched or is explicitly owned by the current task. Use the standalone `kill -INT <pid>` command for interruption. Do not send Ctrl+C or its control character through terminal input tools such as `write_stdin`, even when that mechanism is available. If SIGINT cannot be used, report the blocker rather than switching to terminal input. Use `kill -TERM <pid>` only for authorized cleanup after verifying ownership again. Do not use these permissions for unrelated processes, process groups, or system-wide cleanup. A denied or canceled interruption remains blocked; do not use another mechanism to bypass that decision.
* In Codex, run Electron E2E tests outside the sandbox from the first invocation, using `sandbox_permissions: "require_escalated"` and the named npm workflows allowed by `.codex/rules/tests.rules` and `.codex/rules/e2e.rules`. Use `npm run test:e2e -- <spec>` for focused runs and `npm run test:e2e:visible -- <spec>` for visible runs. Project rules require trusted `.codex/` configuration and are loaded at session startup; restart Codex after changing them. If a rule is unavailable, follow the platform approval flow rather than bypassing it.
* In Codex, retire a finished scratch task with `npm run retire:scratch -- <task>` outside the sandbox from the first invocation, using `sandbox_permissions: "require_escalated"`. `.codex/rules/scratch.rules` allows this guarded command, including the Git metadata updates needed for temporary worktrees. Let the command inspect and remove worktrees; do not precede it with raw `git worktree remove --force` or bypass a refusal with recursive deletion. Rule loading and trust requirements are the same as for the test commands above.
* In Codex, Claude Code, and OpenCode, use `npm run test:e2e:diagnose -- --shared-reset=reload --json-output=.scratch/<task>/report.json <spec> --reporter=list,json` for E2E diagnostics (options in `docs/DEVELOPMENT.md` §8) instead of shell environment assignments. Inspect task processes with the standalone `ps -axo pid=,ppid=,command=` command and inspect its returned output; do not add a shell pipeline that needs another approval. These are reusable project rules, not permission to run arbitrary shell commands. Each tool keeps its own permission configuration; another tool’s success does not prove access.
* In all three tools, place agent-created temporary work materials (notes, reports, diagnostic scripts, intermediate results, and evidence retained for comparison) under the repository's `.scratch/<task>/` directory. Choose a distinct task directory, with separate agent subdirectories when sharing a task, and use the project's file-editing tools for manual writes. This rule applies regardless of which external directories are available, including `/tmp`, `/private/tmp`, `$TMPDIR`, or home-directory caches. Keep tool-managed output, application profiles, and library-managed temporary directories under their existing owners. Honor an explicit user destination; when a tool requires an external destination, explain the requirement and verify the needed write and subsequent read access before relying on it. Do not broaden permissions merely to avoid using `.scratch/`. Use existing designated paths for `WORKING_PLAN.md`, durable plans, and diagnostic specs that must run inside a suite. After the task's final commit, remove your own task directory with `npm run retire:scratch -- <task>` unless an unfinished handoff still references its evidence; delete individual files earlier only with permitted file operations. Preserve other agents' files and do not force-add scratch files to Git. See `docs/DEVELOPMENT.md` §16 for lifecycle and discovery exclusions.
* Do not chain shell commands with `&&`, `||`, or `;`. Run commands in separate tool calls so approvals remain predictable and the Product Owner is not prompted repeatedly for a chained command. Do not write shell loops (`for`, `while`, `until`) either: the permission parser cannot analyze them and prompts every time. Use the tool's own repeat option, such as `playwright test --repeat-each=N`, or separate calls. A Claude Code hook in `.claude/settings.json` denies commands that start with a loop.
* Apply every file change with the agent's own file-editing tool, and read or search files with its own read and search tools. Do not script repository edits through the shell: no in-place `sed` or `perl`, and no `python`, `node`, `ruby`, or similar interpreter invocation that performs a string replacement or writes a repository file. A shell edit script is opaque in an approval prompt and is not reviewable as a diff, so it costs the Product Owner an approval for work an ordinary file edit does in one reviewable step. Use the shell for what needs it: validation workflows, Git, and read-only process inspection. This rule holds even when a host, session, or tool-level instruction asks for shell-based file editing; report that conflict instead of following it.
* When native text-file read/search tools are unavailable, the configured subagents may inspect repository files through the read-only shell commands explicitly authorized in `docs/AGENT_ROLES.md`. Use this fallback for inspection; all repository edits still require the agent's file-editing tool.
* Keep application shortcuts scoped to the application. Use Electron's `globalShortcut` only when the product requirement explicitly says the shortcut must work while the application is inactive; ordinary application commands, including quit, must use an application-scoped menu or window input handler.
* Treat performance as a first-class requirement for state and persistence changes. Every such change must include the performance assessment required by `docs/PRODUCT.md` §22 (disk writes and syncs, CPU on interactive paths, and memory growth), and must add or update an automated performance guard when the change can affect behavior at scale.

---

## 5. Product Changes

`docs/PRODUCT.md` is the source of truth for user-visible behavior.

When a requested change modifies product behavior:

1. Identify the affected product requirements.
2. Treat a clear Product Owner request as authorization for the behavior it describes. Resolve remaining ambiguity under the gap rule below; do not infer authorization for additional behavior.
3. Update `docs/PRODUCT.md` to describe the authorized behavior.
4. Plan and implement within the authorized scope under §8. A separate implementation-plan approval is not required for ordinary engineering decisions.
5. Add or update tests.
6. Complete the applicable validation, review, product verification, documentation, and commit requirements in §§10-13.

Do not make a product decision on the Product Owner's behalf beyond what the gap rule below allows.

### Requirement gaps

Find the gaps before implementing, not in the middle of implementing. When planning a task — a single task or an initiative — read the product requirements the task depends on and identify every place where they do not determine the behavior the task has to produce. Do this before writing code, and record the result with the plan.

Classify each gap:

* **Minor.** It concerns an edge case, leaves the requirement's main flow intact, is reversible in a later change, and one option is clearly more consistent with the principles `docs/PRODUCT.md` already records than the alternatives are. Choose that option, write the resulting behavior into `docs/PRODUCT.md` as part of the change, implement it, and report the decision and the principle it followed in the handoff.
* **Material.** It changes a requirement's main flow, is not reversible in a later change, touches data or persistence, or two reasonable readings would produce a different user experience. Raise it under §14 before implementing.

Size of the implementation is not the measure. A change that gives the user something they could not do before is material by definition, however small its code: a new command, mode, control, gesture, or screen enters the product for good and is expensive to withdraw. Settling an edge case of behavior the product already has stays minor.

A gap is material whenever the agent cannot name the specific recorded principle that settles it. Consistency with recorded intent is the test — not the agent's own preference, and not how small the code change would be.

An accumulation of minor decisions is itself material. When one task needs more than three of them, the requirement is underspecified: stop and raise that, rather than filling it in a decision at a time.

An approved initiative may explicitly delegate reversible UX decisions within named areas using Product Owner-provided priorities and decision principles. Within those areas, the agent may choose between reasonable UX alternatives and resolve more than three related details without another approval, provided each choice stays within the authorized outcome and follows a recorded principle. Record the choice, rationale and affected requirement in the plan and update `docs/PRODUCT.md`. This delegation overrides the minor-gap count and alternative-UX escalation triggers only within its stated boundary; it does not authorize new capabilities outside scope, unspecified destructive or migration behavior, changes to major architecture, or weakening standing product commitments. If no supplied principle resolves a material tradeoff, escalate it under §14. Outside an explicit delegation, the gap rules above remain unchanged.

By default no area is exploratory, and the rule above applies everywhere. The Product Owner marks an area exploratory explicitly, with the marker `docs/PRODUCT.md` §1.2 defines, and removes it once the behavior settles. The agent never marks or unmarks an area itself, and never infers that an area is exploratory from how new or incomplete it looks.

Inside a marked section the minor-gap rule does not apply. Implement exactly what the Product Owner asked, do not fill a gap by choosing a default, and do not extend the behavior to a neighbouring case. Report what you noticed — friction, an inconsistency with adjacent behavior, or a case the section does not cover — in the handoff, as observations rather than proposals. Everything else applies unchanged, including tests, validation, and documentation.

### Vim divergences

The two directions are not symmetric. A divergence while editing text inside a node is a defect: fix it without asking and report it, because a Vim user must not be surprised by how ordinary text editing behaves. The behavior of commands that act on the tree, where Vim has no counterpart, is the Product Owner's choice even when one option looks obvious — this product has no precedent to copy — so propose the options and their reasons rather than choosing one. `docs/PRODUCT.md` §1.1 records where Vim fidelity sits among the product's standing commitments; `docs/VIM_CONFORMANCE.md` records each deliberate divergence.

### Open Questions

`docs/OPEN_QUESTIONS.md` holds the questions the project has not answered yet, product and technical alike. It is not a backlog, specification, or source of implementation authority. An answered question leaves it: settled product behavior belongs in `docs/PRODUCT.md`, a settled technical decision in an ADR.

For work on an open question, agents may:

* record observations and Product Owner statements without changing their meaning;
* frame hypotheses and counter-hypotheses;
* distinguish repository facts, Product Owner statements, usage evidence, external evidence, and agent inference;
* propose the cheapest experiment capable of changing a decision;
* organize evidence and identify conflicts with established product principles.

Agents must preserve Product Owner disagreement instead of resolving it silently. They must not invent the Product Owner's position, set an entry to `Accepted`, `Rejected`, or `Deferred`, or treat any status as approval to change the product. Only the Product Owner decides, for technical questions as well as product ones.

When the Product Owner accepts a direction, propose the corresponding `docs/PRODUCT.md` change or ADR separately. Acceptance alone does not authorize implementation; follow the product-change rules above once the Product Owner requests the change.

Open questions need a moment when the Product Owner actually sees them, or they accumulate unread. When no plan in `plans/README.md` has a ready next task, the handoff lists the open questions in one line each as candidates and stops there. Selecting one is the Product Owner's decision: never start work on an open question because nothing else was pending.

---

## 6. Architecture Changes

The complete architectural and technical decision boundary is in `AGENTS.md` §6. Use the recommendation format in its §1 before a reserved decision. Do not ask again for decisions already covered by explicit authorization unless new evidence changes their consequences.

---

## 7. Domain and UI Separation

The complete separation and domain-testability rule is in `AGENTS.md` §7. It applies to all implementation procedures below.

---

## 8. Plans and Architecture Decisions

Exclude owner-deferred work from ready-task selection and continuation below.

For a contained change with a clear outcome and one existing owner, make a concise plan in the conversation and proceed without a planner subagent or temporary plan file. Use the configured planner subagent in a fresh context when the outcome requires a multi-session initiative, changes major architecture, or has several interacting owners or material design choices that benefit from independent planning. Review its plan against the Product Owner's request and repository requirements, resolve ordinary engineering details, and share a concise plan or progress update. Continue without a separate approval pause within the authorized outcome. Ask for a decision before implementing a material unresolved choice or expanding product behavior or major architecture.

For a new initiative, investigate first, collect the necessary questions in one batch, and present the resulting scope, priorities, delegated decisions, reserved decisions, task sequence, validation, expected owner-verification rounds and checks, unresolved capabilities, and execution budget. Obtain explicit authorization to implement that initiative before starting implementation. A request to investigate or record a plan is not implementation authorization. When the Product Owner has already explicitly authorized the presented outcome and boundaries, record that approval rather than asking again. Initiative-wide approval covers its in-scope tasks and required review corrections; closure is subject to the owner acceptance rule below. It does not authorize a different initiative, publishing, or scope expansion. Task-by-task authorization and explicit prototype or no-commit conditions remain valid when the Product Owner chooses them.

### Final owner acceptance

An initiative with three or more working tasks requires explicit Product Owner acceptance of the finished result before closure. Count tasks that produce substantive implementation, testing, investigation or policy outcomes; exclude administrative setup, acceptance, status-only and plan-retirement steps. Record the count before execution and update it if authorized scope grows. Once the threshold is reached, it remains applicable even if tasks are later combined or removed.

Complete, validate and commit authorized tasks autonomously, then retain the plan and index entry with initiative status `Awaiting owner acceptance`. Present the result, acceptance evidence, limitations and concrete inspection instructions, tied to the delivered commit. Initial execution approval, an agent's acceptance assessment and passing checks do not substitute for this final owner decision. Explicit acceptance of that result authorizes the agent to close the initiative without another confirmation. A rejection keeps it open: record the reported issues, repair them within authorized scope and available budget, validate the repairs, and request acceptance of the updated result. Raise scope expansion or an exhausted repair allowance before further implementation. Honor the immediate-follow-up no-commit rule in §12 when it applies.

Waiting for final owner acceptance must not consume the implementation allowance. Preserve its remaining allowance and recovery history; do not reset either on rejection or restart. Agree a separate small closure allowance during planning. Changes that affect the reviewed result invalidate its acceptance. Check the accepted commit and relevant inputs before closing; unrelated changes must be preserved and must not be included in closure. Keep existing pre-commit owner checks where required: final initiative acceptance is a separate post-implementation gate. Initiatives below the threshold retain their existing closure rules; review batches still require confirmation that no tasks remain.

Keep a temporary working plan at `WORKING_PLAN.md` only when the task's working context will not survive on its own: it crosses several interaction-state owners or process boundaries, it needs review roles that begin from a clean context, or it is long enough that a context summary could drop something the task depends on. Its purpose is to carry working context between those readers, not to record project history, and the Product Owner is not its audience. A task one session can hold in view — including most individual tasks of an initiative — uses a concise plan in the conversation instead. Keep it current when authorized scope changes, make it available to any review roles, and delete it before the final commit for that task.

For work spanning multiple sessions, keep a durable initiative plan under `plans/` and link it from `plans/README.md`. The initiative plan records the authorized objective, boundaries, ordered logical tasks, acceptance criteria, current status, decisions, and exact next task. It is a coordination record, not a product requirement or authorization to implement unrequested behavior. Record whether authorization covers the whole initiative or only named tasks. Within initiative-wide approval, continue ready tasks automatically while the approved budget and capabilities permit; a fresh run does not require another owner message. Otherwise, a request to continue authorizes the next ready task within the recorded scope. Ask about reserved decisions or scope expansion. An automatic run must name its initiative and task; it must not select another initiative when blocked. For an ambiguous human continuation request, resolve it from `plans/README.md`: when exactly one active plan has a next task that is ready and authorized, take it; when several do, ask which one before starting; when none does, say so instead of inferring work. State the selected initiative and task in the first reply. Each task uses `WORKING_PLAN.md` for its temporary implementation and validation evidence. Update the initiative plan as part of each completed task's commit so another session can resume from repository state. See `docs/DEVELOPMENT.md` §11 for the format and resume procedure.

A review or report that identified several follow-up fixes is a multi-task outcome even when its tasks are requested one at a time. The session that receives the first cited task captures the complete task list the Product Owner can provide as a plan under `plans/` before implementing that task, marks each task's status as it lands, and keeps the plan until the Product Owner confirms no further tasks remain. When approval covers only named tasks, implementing one cited task does not authorize the others. Explicit approval of the whole recorded batch follows the initiative-wide continuation rules above. If the remaining list is unavailable, record an explicit unverified remainder instead of assuming the cited task is the last one; whole-batch approval does not authorize an unknown remainder or waive owner confirmation before closure. Review tasks must not live only in conversation.

Propose a multi-session initiative when a requested outcome needs coordinated work across sessions: a recurring defect cluster with one underlying cause, a review that identified several follow-up fixes, a refactoring that touches many call sites, or work that cannot fit one session. Say why the work needs multiple tasks and list the proposed order. Do not silently narrow the outcome or combine unrelated logical tasks into one commit. Create the plan once the Product Owner authorizes the objective. Several focused commits may still land in one session under §12.

Write every initiative plan so that a future session, possibly using a smaller model, can execute any single task from repository state alone. Each task must name the files it is expected to change, its acceptance evidence, its validation tier, and any decision reserved for the Product Owner. Do not rely on the planning session's context, and do not leave a task whose scope can only be inferred from conversation. The Product Owner may deliberately use a more capable model to plan an initiative and a cheaper one to implement its tasks; §1 keeps all work within the coding tool started for each session.

Before completion, extract knowledge that remains useful into its durable owner:

* current product behavior into `docs/PRODUCT.md`;
* current architecture and constraints into `docs/ARCHITECTURE.md`;
* development and verification practices into `docs/DEVELOPMENT.md`;
* significant architectural choices and rationale into an ADR.

Git history is sufficient for completed implementation plans. Do not create or maintain a plan archive. After satisfying the final owner acceptance rule when applicable, remove a completed initiative plan, or a review-batch plan once the Product Owner confirms no further tasks remain, and its index entry in the commit that records completion after moving lasting knowledge to its durable owner.

Before marking a plan complete or retiring it, review its temporary continuation references under §11. Move lasting conclusions and decisions into their durable owners and retain any required reusable tooling in Git. Do not close the plan while understanding its result still requires scratch files.

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

When behavior changes, assess existing coverage and add or update tests where it is insufficient.

Every user-visible behavior described in `docs/PRODUCT.md` must be covered by at least one automated test. Behaviors that cross a process, persistence, or platform boundary — the Electron shell, preload/IPC, persistence, attachments, clipboard, drag-and-drop, and global shortcuts — must also have an end-to-end test, in addition to any unit test for the underlying rule.

### Selecting the test level

Cover each behavior at the fastest level that can reliably detect the relevant failure. Unit and property tests cover rules, edge cases, input tables and state combinations. Component and integration tests cover collaborating handlers, hooks and application state; use a real store when asserting store outcomes. E2E covers distinct risks in real Electron wiring, keyboard and pointer dispatch, native boundaries, focus, caret, selection and rendering that the lower levels cannot faithfully exercise. Detailed examples live in `docs/DEVELOPMENT.md` §8.

When selecting E2E coverage for a change, identify the failure each selected case can detect while the relevant focused tests remain green. Similar assertions at different levels are justified when they detect different failures. Do not repeat an entire input or state matrix at every level, in every editor or in every editing mode merely because those combinations exist. Select representative real-boundary cases and retain distinct handlers, editor implementations, native/DOM behavior and important failure paths.

Existing tests may satisfy a change's coverage obligations. A change does not require a new test at every level when the existing assertions already detect its failure. Test count, a fixed unit/E2E ratio and a target reduction percentage are not goals.

Tests must verify important edge cases, not only the happy path.

Coverage percentages are a gap-finding tool, not a target. Do not add tests solely to raise coverage. When product behavior changes, review the affected `docs/PRODUCT.md` requirements and confirm each one still has coverage at the appropriate level.

Property-based tests using `fast-check` guard domain invariants. When a change affects tree structure, ordering, node identity, serialization, cursor or paste transforms, or undo/redo consistency, add or update a property test for the affected invariants. Property tests are named `*.property.test.ts`, run with the unit suite, and are not a coverage target. Boundary wiring and presentation changes do not require property tests.

Do not remove or weaken tests merely to make an implementation pass.

Removing or moving redundant E2E coverage is allowed when the change identifies the focused test covering the rule and the retained E2E covering the distinct boundary or rendered state. Add missing coverage before removing the old case, preserve important failure paths and defect regressions at a level that can reproduce them, and update affected requirement/test references and screenshot ownership. Explain the mapping in the change or temporary task evidence; a permanent per-test justification registry is not required. Do not replace real boundary or rendering evidence with mocks that cannot detect the same failure.

### Navigation and caret changes

Follow the project-wide navigation and caret matrix and invariant in `docs/DEVELOPMENT.md` §8. Before changing implementation, inventory the affected caret and selection state and every command or interaction path that can change it, including paths that keep the selected node unchanged. Record the affected transitions and their expected states; when a working plan is required under §8, keep the inventory and matrix there. Update them when implementation reveals another path. Before handoff, compare the implementation and tests against the complete affected inventory and matrix, and explicitly report any intentionally unsupported combination. The required independent review under §13 must trace the affected state-changing paths in the code against that inventory, rather than infer completeness from passing tests alone.

### Visual-regression workflow

For a change that can alter rendered pixels — including stylesheet, layout, typography, color, caret, selection, focus, drag-feedback, or contenteditable rendering — DOM, CSS-class, and computed-style assertions are not sufficient visual evidence. Select the smallest representative set of affected states, run it in the real Electron renderer, and inspect its screenshot before handoff. Include light and dark appearances only when the change or affected styling differs by appearance.

Treat visual requirements in `docs/PRODUCT.md` as hard acceptance criteria. When a requirement specifies relative placement or alignment, add a real-renderer geometry assertion for that relationship where practical; a screenshot baseline alone can preserve an already-misaligned result. For focus or selection indicators, cover the selected row, an unfocused neighbor, and focus moving between them when the state persists across rows.

For changes to appearance, window creation, renderer loading or reloading, or closing, check the absence of contrasting flashes required by `docs/PRODUCT.md` §20.5. Follow the lifecycle verification procedure in `docs/DEVELOPMENT.md` §9; a screenshot of the fully loaded editor does not verify a transient startup or closing state.

Add or update a deterministic screenshot regression test when practical. Its baseline must be deliberately inspected; accepting a generated image without inspection is not verification. For interactions such as rich text, test both the rendered state and the relevant behavior matrix (for example mode changes, selection, and pointer interaction) so a visual fix cannot silently break the interaction.

Committed screenshots, fixtures, and other visual-regression artifacts must contain only synthetic data. Do not include personal, confidential, or otherwise sensitive information in them.

Record the inspected states, command, and artifact location separately from automated validation. Reuse still-valid visual evidence rather than generating images for non-rendering changes or repeating inspection when the rendered inputs and states did not change.

### Defect-first workflow

When fixing a reported defect:

1. Reproduce the defect before changing the implementation.
2. Add or extend a regression test at the appropriate level that fails because of the defect.
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

These are coverage obligations, not a requirement to add three new tests or files for every change. Reuse existing tests when their assertions exercise the changed behavior. One test may satisfy multiple obligations only when it actually exercises and asserts each one. Keep representative real-boundary success and important failure coverage; put rule and argument variants in focused tests rather than repeating their full matrix through Electron.

TypeScript types do not prove that runtime values are forwarded correctly across a boundary. Do not substitute broad UI coverage for a focused contract test when a boundary is changed.

Shutdown, startup, persistence, or quit changes must cover the success path and relevant failure paths, including pending-save flushing, save failure, timeout, retry, duplicate requests, application-menu quit, window close, and renderer unavailability.

End-to-end and performance fixtures must own the Electron processes they launch. The concrete registration, cleanup, crash-dialog, and bounded-teardown mechanics are in `docs/DEVELOPMENT.md` §9.

---

## 10. Validation

Select functional validation by the highest applicable risk tier in `docs/DEVELOPMENT.md` §9. The matrix defines the required commands. Focused checks remain the preferred development loop.

### Selecting performance checks

Keep the fast performance guards included in ordinary validation. Select Electron performance checks separately from the functional risk tier. A High Risk classification, a session ending, or a desire for extra confidence does not by itself justify an Electron performance run.

For a local run, identify a concrete affected cost: interactive or startup latency, document-scale CPU work, memory growth, or disk operations. Changes to these paths, fixes for a reported slowdown, and changes to performance measurements require the smallest set of scenarios that can detect the affected regression. Preserve the assessment and scale-guard obligations in `docs/PRODUCT.md` §22. A plausible regression mechanism is enough to require a check; do not wait for proof that the change is slow.

Run the full Electron performance suite when the performance impact spans the application and cannot be bounded to affected scenarios, such as an Electron or React upgrade or a broad change to rendering, state, persistence, or shared performance fixtures. A tooling-only dependency update or a correctness-only boundary fix does not automatically require Electron performance tests. Inspect the changed paths before selecting the scope. Keep the full scheduled/manual CI suite and verify the release candidate with the full suite before release, reusing valid results under the rules below.

Record the affected cost and selected scenarios, or a brief reason why no Electron performance run is needed, in the task's validation evidence. Use same-machine before/after measurements for performance fixes and changes expected to affect measured costs; interpret timing noise using `docs/DEVELOPMENT.md` §12. Reuse valid measurements, and rerun only invalidated scenarios. Use the all-suites command only when its full performance stage is justified by these rules or explicitly requested.

### Validation evidence

Record each validation result with its exact command and scope, pass/fail/blocked status, the tested repository snapshot, and relevant environment or generated-artifact assumptions. Keep this record in `WORKING_PLAN.md` when one is required under §8; otherwise include it in the final handoff.

Select local E2E scope using [Development Guide §9, Local affected-spec E2E validation](DEVELOPMENT.md#local-affected-spec-e2e-validation), including production-coverage inventory, empty-selection handling, and full-suite requirements.

For a visual-regression workflow, record the inspected states, command, screenshot artifact, and outcome as visual evidence; a passing DOM, CSS, or computed-style assertion does not substitute for this record.

Validation records are temporary task evidence, not permanent repository artifacts. Do not create a committed validation-log or plan archive unless the Product Owner explicitly approves a new audit requirement.

A passing result may be reused only for the same command and scope while its repository inputs, relevant environment, and generated inputs remain valid. A broader pass subsumes checks it actually contains; a focused pass never implies broader coverage. Agents must consume valid recorded results and must not rerun a check solely because work changed hands or for reassurance.

Edits invalidate only checks whose inputs or exercised behavior may have changed. Documentation-only edits do not invalidate runtime suites. Source edits invalidate affected static checks, tests, builds, and suites using prior build output. Test, fixture, dependency, build-tool, test-runner, or agent-policy changes invalidate their affected stages. Read-only review and verification do not invalidate results. After a fix, rerun the affected checks and their dependencies; repeat full validation only when required by the risk matrix or when a substantial, architectural, high-risk, or materially scope-changing fix invalidated it.

If validation fails, fix the problem before considering the task complete.

If a failure is unrelated to the current task, report it explicitly rather than hiding or ignoring it.

A test suite that cannot launch the application or execute the relevant boundary is not considered passed. If validation is blocked by the environment, report the exact blocked suite, identify the supported environment required to run it, and do not claim full validation.

---

## 11. Documentation

### Temporary evidence and durable documentation

Apply `AGENTS.md` §11: a reader of a fresh clone must be able to understand lasting conclusions and decisions without local scratch files. Record the conclusion, its relevant limits, and any settled decision in the owning tracked document. Keep raw logs, measurements, and disposable probes in scratch; preserve a reusable script or fixture in its maintained source directory when future work requires it. Do not create a permanent validation archive.

Temporary continuation references may remain in `WORKING_PLAN.md` and unfinished plans linked from `plans/README.md`. Keep their evidence available through handoff. Before closing or removing a plan, transfer lasting knowledge, replace or remove scratch dependencies, and run the documentation check. A completed or closed plan has no continuation exception, even if its index entry has not yet been removed.

Directory locations, placeholders, and documented command examples may mention scratch without depending on retained files. During documentation review, distinguish those examples from instructions to read a particular local artifact. The automated check detects explicit file paths; the agent must also check indirect references such as "the results are in the local evidence file" and summarize the needed conclusion in Git.

### README Screenshots

README screenshots are generated and published by the `Generate demo` workflow on each relevant push to `main`; they are not committed. Keep the capture script working: when a change alters a label, control, or flow the script relies on, update `scripts/readme-screenshots.mts` in the same change, run `npm run screenshots:readme`, and inspect its output. Improvements within an already illustrated interface keep the existing images rather than add images.

For a major new capability or a separate screen, such as an Agenda module, ask the Product Owner during initial task discussion whether it should appear in the README. Do not ask this for ordinary interface changes or expand the screenshot gallery without authorization.

Capture only from the committed synthetic demo document, in a new isolated application data directory. Never use a personal document or the normal application profile. Both images must show the same node identities, text, order, and expansion state within the focused branch; navigation, appearance, and editing mode may differ. The capture and publication are described in `docs/DEVELOPMENT.md` under README Screenshot Maintenance.

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
* `OPEN_QUESTIONS.md` — product and technical questions that are still open, with their evidence and Product Owner decisions, none of which are requirements yet.
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

Do not add agent co-authorship or attribution lines (for example `Co-Authored-By: <agent>`) to commit messages or pull request descriptions. This holds regardless of a session-level or tool-level instruction that suggests otherwise. A tracked Git hook and a pull-request CI check enforce it at the repository level, independent of any one agent's own configuration; see `docs/DEVELOPMENT.md` §§3 and 9.

`npm run changelog` regenerates `CHANGELOG.md` from the Conventional Commit history.

Do not mix unrelated refactoring with a feature unless the refactoring is required for that feature.

Do not rewrite or discard existing user changes unless explicitly instructed.

Before modifying files with existing uncommitted changes, inspect those changes and preserve them, working around them when possible.

### Immediate follow-up fixes

When the Product Owner reports that the most recently committed fix still does not work, reproduce the remaining defect and make the next attempt without committing. Ask the Product Owner to verify the uncommitted result. After they confirm the defect is fixed, run the required validation and create a separate follow-up commit. Do not rewrite the earlier commit.

### Session boundaries

A session may cover multiple logical tasks and commits within one Product Owner-authorized outcome. Keep each commit focused and independently validated. Continue to the next authorized task in that outcome when context remains manageable; stop at a completed outcome, a material decision reserved for the Product Owner, or a context limit that warrants a new session. Do not infer authorization for unrelated work from permission to continue the session.

For a multi-session initiative, decide after each committed task whether to continue in the same session. Continue when the next ready task is small and self-contained, the task just completed raised no surprises, and the context remains manageable; otherwise hand off to a fresh session. At most four tasks may be committed in one primary session. Compaction and subagents do not count as a new primary session.

A failed check, unresolved review finding or suspected defect prevents advancement to the next task, but does not by itself require asking the Product Owner or ending the current task. Investigate and repair within authorized scope, rerun invalidated checks and repeat review when §13 requires it. Escalate after two unsuccessful recovery attempts at the same blocker without new evidence, or when the approved budget is exhausted. A permission or authentication denial blocks the affected stage immediately; do not retry through another command or tool to bypass it. Stop dependent work for missing mandatory verification, a reserved decision, contradictory requirements or a discovery that invalidates the authorized outcome. Preserve unfinished work and evidence. Each task keeps its own commit and validation.



For a multi-session initiative, commit the updated task status and next task with the completed change. A later session reads the active plan and Git state before starting; it does not infer completion from a checkbox when the corresponding change is uncommitted or validation is incomplete. If a session stops before a commit, leave any `WORKING_PLAN.md` and the worktree intact, record the blocker in the handoff, and resume that same task next time.

### Delivery reports

For completed or interrupted repository work, provide an explicit delivery report. The checklist below applies to that report; a requested prompt for another session uses the separate procedure below.

The conversation report is a bottom-line summary of at most three short lines, in this order: what was delivered and its completion status, with the commit; what failed, remains unverified or is blocked; and whether a Product Owner decision or action is needed. For a completed task requiring no action, say so rather than requesting confirmation. Add a line only for a product decision made on the Product Owner's behalf, a possible shared cause reported by `npm run fix:history`, or, for an interface change, a link to representative inspected screenshots or recordings from the required visual evidence. Do not add headings, tables, check lists or mechanism explanations to the conversation report. Do not invent a manual application check for documentation or internal changes.

Keep the technical evidence out of the conversation report. Give it when the Product Owner asks for it. When work is interrupted or a handoff remains, record the evidence in `WORKING_PLAN.md` or `.scratch/<task>/` and link it in one line; a link must remain usable at handoff, so never link to a deleted working plan. Failures, blockers and the next action always stay in the summary. Detailed evidence remains required under §10 and the list below. Do not create a permanent validation archive.

The technical evidence states:

* what was completed;
* for a defect fix, the output of `npm run fix:history`, and, when it reports a possible shared cause, a proposed structural initiative under §8 or a stated reason why none is needed;
* every product decision made on the Product Owner's behalf under §5, with the recorded principle each one followed;
* which validation passed;
* which validation failed or was blocked;
* whether unresolved failures remain;
* the exact next authorized task, if one remains;
* enough saved context for “continue” to resume identifiable authorized work in another session; supply a short task selector only when multiple unfinished outcomes would otherwise be ambiguous.

Never leave unresolved validation failures without identifying the next action needed to investigate them.

The direct follow-up rule above still applies when the Product Owner reports that the most recently committed fix does not work. Context grows with every message and tool call; use a new session when continuing would make the work harder to verify.

### New-session prompts

When the Product Owner asks for a prompt to start another session, provide one complete, concise, pasteable prompt on the first attempt. Include the new objective and the relevant context the receiving agent cannot recover from the repository: the owner's motivation, concrete observations and their verification status, decisions or rejected suggestions, unresolved alternatives, and task-specific authorization or review conditions. Include only what this conversation establishes and the new task needs; do not invent missing evidence or promote an agent suggestion into an owner decision.

The receiving agent owns bootstrap and repository inspection. Omit copied permanent rules, reminders to read instructions, Git state, and repository-recoverable task history. Keep a conversation-only constraint when it changes the new task's scope, even if it resembles a standing rule. A request to discuss a new objective remains a discussion; it is not a continuation of an unrelated initiative or a delivery report for the preceding task.

Before sending, check the prompt against the relevant conversation: can the next agent start the requested work without asking the owner to repeat known context? If the owner challenges an omission or redundant policy, reassess the whole handoff and return a complete corrected prompt, not just the explanation or the latest missing fragment. Drafting a prompt in conversation does not authorize repository edits.

---

## 13. Completion Criteria

A task is complete only when:

* the requested behavior is implemented;
* every affected `docs/PRODUCT.md` behavior has coverage at the appropriate level under §9, including real E2E evidence for boundary wiring where required;
* existing coverage is assessed and relevant tests are added or updated where needed;
* documentation is updated when necessary;
* the highest applicable validation tier in `docs/DEVELOPMENT.md` §9 passes;
* no required end-to-end test is skipped because of the environment;
* no unrelated behavior was changed;
* a change to user-visible behavior was checked against Apple's Human Interface Guidelines as `docs/PRODUCT.md` §1.3 requires, and any unrecorded conflict was raised under §14;
* the repository remains in a coherent state.

When a working plan is required, satisfy it and extract durable knowledge before deleting it.

The primary agent reviews every completed diff against the request, tests, policy, and validation evidence. An independent code-review pass is additionally required for shared interaction-state changes, process or persistence boundaries, major architecture, and High Risk changes under `docs/DEVELOPMENT.md` §9. Product verification is required for changed user-visible behavior: the primary agent checks contained flows, while a separate product verifier checks changes spanning interaction states or process/platform boundaries and other High Risk user-visible changes. Inspect affected flows and nearby states. Review roles receive the validation record and reuse still-valid results. Contained internal changes need no separate reviewer or product verifier. Confirmed meaningful findings must be resolved and the affected checks rerun. Repeat a review or product-verification pass only when a fix materially invalidates that pass; a full repeat is required only when fixes are substantial, architectural, high-risk, or likely to introduce new problems. `No meaningful issues found` and `No meaningful product issues found` are successful outcomes when those roles are used.

---

## 14. When to Ask the Product Owner

Ask the Product Owner instead of guessing when:

* two reasonable interpretations would produce different user experiences outside the explicit principle-directed delegation in §5;
* a material requirement gap is outside that delegation, or requirements contradict one another;
* a proposed behavior change extends beyond what the Product Owner requested or authorized;
* a proposed data or persistence-model change extends beyond what the Product Owner requested or authorized;
* a major architectural decision has not been explicitly authorized;
* a technical choice is reserved by `AGENTS.md` §6 or explicitly reserved by the Product Owner;
* backward compatibility or migration behavior is unclear;
* destructive behavior is not explicitly defined;
* an implementation choice could significantly constrain future product development.

For ordinary implementation details that do not affect these areas, make a reasonable decision and proceed.

When requesting an optional preference on a reversible choice already within delegated authority, recommend one concrete action and state “if you do not answer, I will do X.” Give the owner a reasonable opportunity to respond and continue independent work meanwhile. If the answer is required for a reserved decision, explicit confirmation, platform permission, destructive action, or final acceptance, state that the dependent action waits for an answer. Silence never supplies that authorization. Do not turn routine engineering choices into questions merely to attach a default.

Ask once, early. Collect the material gaps, scope boundaries, priorities, delegated decision areas, verification obligations and budget needed for initiative approval in one exchange. After approval, interrupt only for the reserved decisions above, a missing mandatory capability or owner check, a permission/authentication action that requires the owner, exhausted recovery or budget under §12, or a discovery that invalidates the authorized outcome. Resolve ordinary engineering choices and explicitly delegated details autonomously, record the reasoning, and report them in the handoff. An initial approval does not waive a newly discovered reserved decision. Report a new manual-verification obligation promptly with its cause and the revised estimate; never defer a required pre-commit check merely to reduce interruptions.

These are not reasons to interrupt: wanting an already-authorized piece of work confirmed, wanting reassurance that an approach is acceptable, reporting progress, or asking whether to carry on with the task in hand.
