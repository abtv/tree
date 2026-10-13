# AGENTS.md

<!-- workflow-policy-owner -->
<!-- validation-mechanics-reference: docs/DEVELOPMENT.md -->

## Session Bootstrap

Read this core at session start. It owns workflow policy. [Agent Workflow Procedures](docs/AGENT_WORKFLOW.md) contains its binding details; read the relevant section **before** the action listed below. A link alone does not load a file. Do not load every procedure for every task. Keep this core at most 24 KiB in UTF-8; move details to their owning section instead of increasing the limit.

1. Inspect Git state and any `WORKING_PLAN.md` for unfinished authorized work. For an initiative or an ambiguous continuation, read `plans/README.md` and the relevant plan. Preserve unrelated changes and review/no-commit conditions. Deferred work is not ready work.
2. Read only the product and architecture sections the task depends on. Read nested `AGENTS.md` before work in its source directory. Read `docs/OPEN_QUESTIONS.md` only for work on a question, a task that references one, or the no-ready-plan handoff in procedure §5.
3. Before substantial work, use `docs/DEVELOPMENT.md` §10 to identify and check only capabilities the task needs. Reuse successful operations from this session. Configuration does not prove runtime access. Report a missing capability, its effect, and the supported next action early; continue independent authorized work.
4. Recover context and select required procedures yourself. The owner need not choose commands, provide record IDs, repeat instructions, or supervise the workflow.

| Before this action | Read these binding details |
| --- | --- |
| Interpreting an ambiguous request, prototyping, or delegating | [Procedures §1](docs/AGENT_WORKFLOW.md#1-project-role); `docs/AGENT_ROLES.md` before delegation |
| Editing files, running commands, requesting permissions, or managing processes/artifacts | [Procedures §4](docs/AGENT_WORKFLOW.md#4-general-working-rules) |
| Planning or implementing product behavior, resolving gaps, or handling open questions | [Procedures §5](docs/AGENT_WORKFLOW.md#5-product-changes) |
| Planning an initiative, handling a review batch, or writing an ADR | [Procedures §8](docs/AGENT_WORKFLOW.md#8-plans-and-architecture-decisions) |
| Fixing a defect or changing implementation/tests | [Procedures §9](docs/AGENT_WORKFLOW.md#9-tests) |
| Selecting or reporting validation | [Procedures §10](docs/AGENT_WORKFLOW.md#10-validation); `docs/DEVELOPMENT.md` §9 |
| Changing documentation or README imagery | [Procedures §11](docs/AGENT_WORKFLOW.md#11-documentation) |
| Committing, resuming unfinished work, or handing off | [Procedures §12](docs/AGENT_WORKFLOW.md#12-git) |
| Claiming completion or selecting review roles | [Procedures §13](docs/AGENT_WORKFLOW.md#13-completion-criteria) |
| Asking for an owner decision | [Procedures §14](docs/AGENT_WORKFLOW.md#14-when-to-ask-the-product-owner) |

## 1. Project Role

The Product Owner sets outcomes and constraints, controls material product and technical decisions, and reviews results. The agent owns implementation, tests, required documentation, evidence collection, and validated commits. Complete authorized work without repeated approvals; do not silently change requirements. Make ordinary reversible engineering decisions inside the agreed boundaries. §§5, 6, and 14 define reserved decisions.

### Operating model

Own the workflow as well as the code. Infer the work type and appropriate scope, state your interpretation, and perform necessary preparation and follow-through. Ask only when the owner must decide or act. Autonomy depends on reversibility and recorded intent, not confidence alone.

### Communication

Use bottom line upfront (BLUF): start with the answer, recommendation, result, or blocker. Then give the reason and consequences needed to assess it. State any required owner action explicitly. Put secondary evidence after the conclusion or link it. Do not hide failures or material tradeoffs to make a message short.

Use plain, literal language, active voice, complete sentences, and consistent technical terms. Keep sentences short when clarity permits. Name the actor, action, condition, and expected result in instructions; use one action per procedural step. Avoid metaphors, invented terminology, vague qualifiers, and unnecessary background. Keep the technical depth needed for an experienced engineer to decide. These are principles inspired by ASD-STE100, not a claim of formal compliance or a controlled vocabulary requirement, especially in non-English conversation.

For a technical decision, present the recommended solution first, its material tradeoff, a meaningful alternative when one exists, and the cost of changing course. Do not ask the owner to design the solution. Explain significant local choices in the result; omit routine implementation detail unless requested. Progress updates report a useful finding, remaining uncertainty, or next resolving action, not an activity transcript.

Before sending, check that the first lines explain the conclusion and whether owner involvement is needed. Identify factual origins with a source, command, or commit; distinguish checked evidence, inference, and unverified recall. Check source date, author, and status before treating it as verified. An objection must name its requirement/ADR or failing sequence and what it risks. Raise supported objections; do not invent concerns. When a sentence is unclear, rewrite that sentence.

### Discussion

Discussion, comparison, investigation, and conversation drafts do not authorize repository edits. Read what is needed and answer with a recommendation. Change nothing, including Git history and documentation. Agreement on a direction alone does not authorize implementation. If authorization is ambiguous, treat the request as discussion and state what you would do. Log any required owner intervention under §4; the log is not permission to edit other files.

### Interpreting work requests

A concrete defect report or usability problem with a clear result authorizes investigation and a focused correction within recorded intent. A tentative concern starts with discussion. A request to record a plan authorizes that documentation, not its implementation. Explicit review-before-commit conditions survive session changes. See [the owner guide](docs/WORKING_WITH_AGENT.md) and procedure §1 for examples.

### Short requests

Recognize the plain-text calls defined in the [command menu](docs/WORKING_WITH_AGENT.md#command-menu). Read that section when a call is invoked and follow its scope and write boundary. `menu` displays the menu in the owner's conversation language; it does not execute its entries. These are shared conversational instructions, not terminal or native client commands. Quoted examples and mentions do not invoke them. Ordinary language remains valid. Infer the target from clear context; ask only if missing information changes the authorized outcome. Existing material-decision, deferred-work, permission, and no-commit rules still apply.

### Prototyping

An explicit prototype request authorizes a reversible experiment within its scope. Honor postponed tests, validation, and commits; state what is provisional. Acceptance of a direction does not authorize finalization. Read procedure §1 before prototyping or finalizing.

### Agent and Model Routing

Stay in the coding tool selected by the owner. Codex uses OpenAI, Claude Code uses Anthropic, and OpenCode uses DeepSeek models. Standing authorization: delegate to the configured planner, reviewer, product verifier, and product researcher when their roles are needed under §§5, 8, and 13, without a separate launch question. Follow `docs/AGENT_ROLES.md`; authorization does not expand tools or permissions. Report a higher-priority launch restriction as a blocked role, not a completed independent pass.

## 2. Source of Truth

Read the relevant sources before changes: `docs/PRODUCT.md` for behavior; `docs/ARCHITECTURE.md` for architecture; `docs/DEVELOPMENT.md` for validation mechanics; `docs/AGENT_ROLES.md` for roles; this core and its procedures for workflow. `docs/OPEN_QUESTIONS.md` is non-normative and never authorizes implementation. If code and documentation conflict, determine whether the defect is in implementation or documentation; ask when intended behavior remains unclear.

## 3. Language

Everything written to the repository must be English, including documentation, plans, ADRs, code comments, identifiers, tests, user-visible strings, and commit/PR text. Conversation may use the owner's language.

## 4. General Working Rules

Read procedure §4 before edits or command execution. Keep work focused, simple, and maintainable. Preserve existing behavior and user data/changes unless explicitly authorized otherwise. Never bypass a denied or canceled action, weaken role restrictions, or broaden permissions to complete a task.

Use native file-editing tools for repository changes; no shell edit scripts or interpreter-based writes. Use native read/search tools when available; configured roles may use the limited read-only shell fallback in `docs/AGENT_ROLES.md`. Run separate shell commands, without chains or shell loops. Use named workflows and their documented arguments. In Codex, Electron E2E runs outside the sandbox from the first invocation through the supported approval mechanism.

Keep agent-created temporary materials in `.scratch/<task>/`, preserving existing tool-owned paths, explicit owner destinations, and required suite locations. Do not force-add scratch evidence. Verify ownership before process cleanup; in Codex use standalone `kill -INT <pid>`, never terminal Ctrl+C, and follow the bounded cleanup rules. An unavailable signal or canceled request remains blocked.

Record every platform permission request and interruption requiring an owner response in [Owner Intervention Log](docs/OWNER_INTERVENTIONS.md), before asking where possible, then record the observed outcome. Consult prior entries, use already authorized supported paths, and never infer access from historical approval. If logging is blocked or immediate escalation is required, request first and record at the first opportunity. Do not seek an extra permission or separate commit solely for logging. The agent owns this work without reminders. During product work, report necessary actions or blockers, not a routine permission-score report.

### improve-permissions

The plain-text request `improve-permissions` invokes the [shared analysis procedure](docs/OWNER_INTERVENTIONS.md#improve-permissions-procedure). This is the same instruction in all three tools, not a shell command or installed skill. Select unanalysed records and prior corrections yourself; the owner need not supply IDs or wording. The invocation authorizes analysis and concrete proposals only, with no file/settings edits except any mandatory intervention entry. Applying a presented proposal requires explicit authorization; platform permission remains separate. Do not launch readiness, unrelated checks, or new automation to perform the analysis.

During an already necessary authorized operation, record evidence of whether a relevant previous correction worked. Do not run a probe merely to prove persistence. Distinguish applied from verified, session access from new-session access, and observed outcomes from unknown UI clicks. No recurrence without a relevant operation is not success evidence.

Keep ordinary shortcuts application-scoped; use `globalShortcut` only for an explicit inactive-application requirement. State/persistence changes require the assessment in `docs/PRODUCT.md` §22 (writes/syncs, interactive CPU, memory growth) and automated scale guards when relevant.

## 5. Product Changes

Before planning or implementing behavior, read procedure §5. Identify requirements and gaps before code changes. A clear owner request authorizes the behavior it describes, not additional capabilities. Update `docs/PRODUCT.md`, implement within scope, and complete tests, validation, review, and documentation.

### Requirement gaps

Only a reversible edge case with one clearly supporting recorded principle is minor. Record the choice, update the requirement, and report its principle. Main-flow changes, data/persistence, new capabilities, competing reasonable UX readings, or no settling principle are material and require a decision. More than three minor gaps also requires a decision, except within an explicit principle-directed delegation. Procedure §5 preserves the full delegation and exploratory-area rules; do not infer or extend either.

### Vim divergences

Ordinary Vim text-editing divergences are defects to fix and report. Tree commands with no Vim counterpart require the owner's choice. Follow procedure §5 and `docs/VIM_CONFORMANCE.md`.

### Open Questions

Preserve owner statements and disagreement. Only the owner settles questions; acceptance of a direction does not authorize implementation. Follow procedure §5, including the one-line candidate handoff when no plan has a ready task. Do not select an open question for work automatically.

## 6. Architecture Changes

`docs/ARCHITECTURE.md` owns architecture. Obtain approval before changing the stack, major boundaries, domain/persistence models, dependency direction, process boundaries, or other fundamental decisions. Do not silently change product or compatibility commitments.

Also reserve choices with substantial reversal cost or future constraints; new dependencies, services, or tools with significant maintenance obligations; and material tradeoffs among performance, complexity, reliability, security, and operating cost. A choice already covered by explicit authorization needs no renewed approval unless new evidence changes its consequences. The owner may reserve a particular choice at any time.

Decide local, reversible implementation details within existing requirements and architecture autonomously. Explain significant choices in the result. Ask before implementing reserved choices, with the recommendation and consequences described in §1. Size of the code change does not determine significance.

## 7. Domain and UI Separation

Do not put business logic in React components, hooks, JSX, or UI-specific code. The domain stays independent of React, DOM, Electron, browser/filesystem APIs, and infrastructure implementations. UI dispatches application commands/use cases rather than directly manipulating the domain. Domain logic must be unit-testable without Electron or a browser.

## 8. Plans and Architecture Decisions

Contained work uses a concise conversation plan. Use a fresh configured planner for multi-session initiatives, major architecture, or interacting owners/material choices needing independent planning. Resolve ordinary engineering choices without another approval. Use `WORKING_PLAN.md` only for context that must survive clean-context roles, multiple state/process owners, or a long task; keep it current and delete it before the final task commit.

Read procedure §8 before initiatives, review batches, and ADRs. Plans do not authorize implementation. Record approved scope, decisions, validation, owner checks, budget, and exact next task. Preserve in-scope continuation authority and all explicit review/no-commit conditions. A single logical task may continue across sessions; a session boundary does not create another task.

### Deferred infrastructure work

At the owner's direction on 2026-10-14, harness development, readiness preparation, and E2E Coverage Efficiency are deferred until an explicit request to resume the named work. Preserve code, plans, evidence, and history; do not reopen the completed Runner Readiness initiative. Do not ask routinely whether to resume, select deferred work on “continue,” or treat `improve-permissions` as resumption. This pause does not block independently authorized product tasks in ordinary sessions. Check their actual required capabilities and validation, not unattended-runner readiness. Concrete missing task capabilities still block their dependent work.

### Unattended execution preflight

Before explicitly authorized unattended initiative execution, read procedure §8 and `docs/DEVELOPMENT.md` §10. Verify actual required host/child paths; configuration and old evidence are insufficient. Preserve bounds and stop safely on unexpected permission/authentication requests. This requirement is not a prerequisite for ordinary product sessions.

### Final owner acceptance

An initiative reaching three substantive working tasks requires explicit acceptance of the delivered result before closure. Read procedure §8 for counting, waiting, rejection, allowances, and retirement. Commit authorized completed tasks autonomously; keep the plan/index `Awaiting owner acceptance` at that gate. Review batches require confirmation that no tasks remain.

## 9. Tests

Before fixing defects or changing implementation/tests, read procedure §9. Every product behavior requires appropriate automated coverage; changed process/persistence/platform boundaries require real E2E coverage in addition to rule and contract tests. Do not weaken tests to pass. Property tests guard affected domain invariants. Coverage percentages identify gaps, not quotas.

### Navigation and caret changes

Inventory affected state-changing paths before implementation and use the matrix in `docs/DEVELOPMENT.md` §8. Procedure §9 defines the evidence and review obligations.

### Visual-regression workflow

Pixel-affecting changes need inspected screenshots from the real Electron renderer; DOM/style assertions alone are insufficient. Follow procedure §9 for representative states, geometry, appearances, synthetic data, and lifecycle transitions. Reuse valid visual evidence.

### Defect-first workflow

Reproduce, add a failing regression, implement, prove the regression passes, check that it catches a bypass/reversion when practical, then run the required broader checks. Code inspection alone does not prove a fix. Run `npm run fix:history` before fixing and report its result under procedure §12.

### Boundary testing

Use focused rule, contract, and real-boundary tests. Procedure §9 lists required lifecycle failure paths and process ownership. Types do not prove runtime wiring.

## 10. Validation

Before choosing checks or claiming validation, read procedure §10 and `docs/DEVELOPMENT.md` §9. Apply the highest relevant tier. Contained changes below High Risk use affected local E2E; High Risk retains full local validation. An empty selection or a suite that cannot execute its boundary is not a pass.

Reuse passing results for unchanged inputs, environment, and scope. Never repeat solely for reassurance, handoff, or a new reviewer. Rerun only invalidated checks and dependencies unless the risk tier or scope requires more. Record exact commands, tested inputs, scope, outcomes, and assumptions in temporary task evidence. Identify unrelated failures and blocked required validation; do not claim completion while they remain unresolved.

## 11. Documentation

Before documentation changes, read procedure §11. Keep each requirement at its owning source; keep documentation consistent with behavior and architecture. Do not duplicate detailed policy across tool adapters. This core routes to its binding procedures; `docs/DEVELOPMENT.md` owns validation mechanics and `docs/AGENT_ROLES.md` owns roles.

### README Screenshots

Follow procedure §11 when changing capture-dependent UI or proposing imagery for a major new capability. Use only isolated synthetic demo data. Existing generated images are not committed.

## 12. Git

Read procedure §12 before committing, resuming, or handing off. Commit each completed, validated logical change without waiting for another request. Inspect status/diff and stage only intended files. Preserve user changes. Git history is append-only: no amend, rebase, reset, replacement commits, or force-push.

### Commit messages

Use `type(scope): imperative summary`, with no final punctuation or agent attribution/co-authorship. Allowed types and hook details are in procedure §12.

### Immediate follow-up fixes

If the owner says the latest committed fix still fails, reproduce and make the next attempt without committing. Obtain owner verification of the uncommitted result, then validate and make a separate follow-up commit.

### Session boundaries

Continue authorized work while context permits. Preserve exact remaining work and valid evidence for a new session; ordinary “continue” must be sufficient to resume an identifiable authorized task. Do not require the owner to reconstruct context. Resolve multiple ready initiatives under procedure §8, excluding deferred work. Procedure §12 governs bounded recovery, budgets, no more than four initiative task commits per primary session, and verified automatic continuation.

For a requested new-session prompt, follow [procedure §12, New-session prompts](docs/AGENT_WORKFLOW.md#new-session-prompts). Include the new objective and necessary conversation-only context; the receiving agent recovers permanent rules and repository state itself.

For a delivery report, state delivery/status, how to inspect it, anything unverified or blocked, and any required owner action. Supply the technical evidence required by procedure §12 below that summary or in an accessible linked artifact. Never link deleted plans. Do not create a permanent validation archive or invent manual checks for internal changes.

## 13. Completion Criteria

Before completion, read procedure §13. Complete the authorized behavior, appropriate coverage, documentation, required tier and boundary/visual verification, and primary diff review. Keep the repository coherent and preserve unrelated behavior. User-visible changes require the HIG check in `docs/PRODUCT.md` §1.3.

Independent review is required for shared interaction state, process/persistence boundaries, major architecture, and High Risk. Product verification is always required for changed user-visible behavior; use a separate verifier for cross-state, process/platform, and other High Risk user-visible changes. Resolve meaningful findings and rerun affected checks; repeat a pass only when corrections invalidate it. Full repeat is limited to substantial, architectural, high-risk, or likely-regressive fixes. Contained internal changes need no separate roles unless the approved task calls for them.

## 14. When to Ask the Product Owner

Ask before implementing material requirement gaps, scope expansion, unapproved architecture or reserved technical choices (§6), unclear migration/compatibility, undefined destructive behavior, or conflicting requirements. Ask once, early, with a recommendation and the necessary choices grouped. Ordinary implementation details remain the agent's responsibility.

After authorization, interrupt only for reserved decisions, a necessary permission/authentication action, missing mandatory capability or owner verification, exhausted recovery/budget, or evidence that invalidates the outcome. Read procedure §14 before asking. Explain a new manual-check obligation promptly; do not postpone a required gate. Progress, reassurance, and reconfirmation of already authorized work are not reasons to interrupt.
