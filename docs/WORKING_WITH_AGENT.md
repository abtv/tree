# Working with the Coding Agent

As Product Owner, describe the problem, desired result, or question in ordinary language. You do not need to choose a work type, name files, split the work into tasks, or select validation commands. The agent identifies the appropriate approach, explains its interpretation, and carries authorized work to completion. You decide product behavior and material tradeoffs; the agent owns implementation, testing, documentation, and commits.

### Technical Decisions and Communication

You control architecture, data and persistence models, process boundaries, compatibility, and security commitments. The agent also brings you choices with substantial reversal cost or future constraints, new dependencies/services/tools with significant maintenance obligations, and material tradeoffs among performance, complexity, reliability, and operating cost. You can explicitly reserve a particular choice. The exact boundary is in [Agent Instructions §§6 and 14](../AGENTS.md#6-architecture-changes).

For those decisions, the agent recommends a solution before implementation and explains its consequences, a meaningful alternative, and the cost of changing course. It does not ask you to design the solution. Local reversible implementation choices within the agreed requirements and architecture belong to the agent; significant ones are explained in the result. Already authorized choices do not need another approval unless new evidence changes their consequences.

Answers start with the conclusion, recommendation, result, or blocker, followed by the evidence needed to assess it. The agent uses plain, literal language and consistent technical terms while keeping the technical depth needed for your decision. It checks clarity before sending; you do not need to request BLUF or repeat writing instructions. These are clear-writing principles inspired by ASD-STE100, not formal conformance to its English vocabulary and rules.

### Permission Review

Start a separate session in your chosen coding tool and write `improve-permissions`. The agent selects the relevant journal entries, assesses recurring causes and previous corrections, and proposes concrete changes. You do not need to supply entry IDs, assemble evidence, or request a metrics report. If there is no actionable evidence, it says so and stops.

That call is analysis only. You can then say “apply” to authorize the concrete proposal. The agent handles edits, required checks, recording, and commits; mandatory platform permissions remain separate. Later necessary operations supply evidence of effectiveness without a special probe or an owner reminder. The [shared procedure](OWNER_INTERVENTIONS.md#improve-permissions-procedure) applies to Codex, Claude Code, and OpenCode; each tool's actual permission scope is assessed separately.

### Vocabulary

| Term | Meaning |
| --- | --- |
| Idea | A possible improvement that has not yet been selected for implementation. |
| Open question | A specific uncertainty about a problem, solution, or technical direction. |
| Discussion | Clarifying a question or comparing choices without changing repository files. A proposed specification or README text shown in the conversation is a discussion draft. |
| Investigation | Gathering and analyzing evidence to answer a question. Its result is findings, limitations, and recommended next actions. |
| Prototyping | Making an explicitly requested, reversible version for you to try, then adjusting it from your feedback before completing the development workflow. |
| Implementation | Delivering an authorized change with the applicable requirements, tests, validation, review, and commit. |
| Task | A bounded piece of work with a concrete result and completion criteria. A task may investigate, prototype, write documentation, or implement a change. It is usually manageable in one session. |
| Initiative | A common objective organized into related tasks with a durable plan for continuing across sessions. Several tasks may finish in one session. |

Discussion, investigation, prototyping, and implementation describe the kind of work. Tasks and initiatives describe how it is organized. A bug fix, feature, or refactor is a kind of implementation task. A draft is an output; asking to review changes before committing is a delivery condition.

### How Requests Become Work

* “Let's discuss why navigation feels awkward.” — examine the question and discuss it; leave files unchanged.
* “Compare our Vim commands with Evil in Org.” — investigate and report the differences; comparison does not authorize implementing them.
* “There is a bug: pasting here loses my text.” — reproduce the reported defect and, when confirmed, fix, test, validate, and commit it. If reproduction is blocked, report the evidence and missing information.
* “The node icon is hard to see in the light theme.” — investigate the concrete visibility problem and make a focused correction consistent with the existing requirements. Raise a material design choice if the correction requires one.
* “I don't like how the icon looks.” — discuss the desired result first; propose a prototype when trying alternatives would help.
* “Show me a different layout, without tests or a commit yet.” — prototype under those conditions, let you try it, and iterate. Once you ask to finish it, update the requirements and complete the applicable development workflow before committing.
* “Show me the README text you propose.” — show a draft in the conversation. “Edit the README, but let me review before committing” authorizes file edits with a review condition.
* “Implement the agreed Vim changes.” — deliver a task or propose an initiative, depending on the scope and coordination needed.

Concrete defect reports authorize investigation and a correction within the recorded behavior. A tentative observation such as “rendering might be slow” starts by clarifying the scenario; “investigate it” authorizes measurement, and “fix it” authorizes correction of the confirmed problem. The agent chooses based on the requested result and remaining uncertainty, rather than on whether the word “bug” appears.

### Ideas, Questions, and Plans

A possible route is: idea → open question → investigation or prototype → product decision → implementation task or initiative. Clear requests can go directly to implementation. An idea may lead to several questions or tasks, and an initiative may combine several ideas.

Use [Open Questions](OPEN_QUESTIONS.md) to retain unresolved questions, observations, evidence, and your decisions. It is not an implementation backlog. Do not create an entry for every clear request or fix. Accepting an idea does not itself authorize implementation; ask for the behavior you want delivered.

Decided product behavior belongs in [Product Requirements](PRODUCT.md). An initiative plan belongs under [Active Plans](../plans/README.md): it records the objective, authorized scope, ordered tasks, completion evidence, unresolved decisions, and exact next task. The agent proposes and creates this plan when the authorized outcome needs coordination across sessions. A contained task normally uses a short conversation plan; the temporary `WORKING_PLAN.md` is used when working context needs to survive a handoff or independent review. Detailed rules are in [Agent Instructions §8](../AGENTS.md#8-plans-and-architecture-decisions).

For an initiative, the agent investigates, asks a consolidated batch of necessary questions, and presents the scope, priorities, decision principles, tasks, validation, expected manual-verification rounds and execution budget. You then explicitly approve implementation. That approval can cover all in-scope tasks, review corrections and closure commits; you do not have to approve each task again. Asking for investigation or a plan alone does not authorize implementation. You can retain task-by-task approval or a no-commit condition when you want it.

The plan's Owner Involvement section states the expected number of verification rounds and individual checks, their timing, and concrete steps for you. Checks whose automation depends on an unverified capability are listed separately, with any possible additional rounds. The agent checks capabilities before relying on them and updates the estimate when new evidence changes it. A required manual check blocks the affected task; grouping checks must not postpone a required pre-commit check.

You may delegate reversible UX details within named areas using explicit priorities and principles. Agents then make and record those decisions. New capabilities outside the approved scope, unspecified destructive or migration behavior, unapproved major architecture, and weakening standing commitments still come back to you. Ordinary implementation choices and in-scope corrections remain the agent's responsibility.

Prototyping is a separate stage from completing an implementation. A request to postpone tests or commits applies while you review the prototype. Agreeing that it looks promising does not by itself request finalization. Prototypes must preserve existing user work and data; anything that needs a material data or architecture decision is raised before trying it. The `Exploratory` marker in Product Requirements describes implemented behavior still being evaluated through use; it continues to require normal validation and is not a prototype exemption.

### Continuing in a New Session

You can say “continue” or “let's continue the work.” The agent checks Git state, any `WORKING_PLAN.md`, and Active Plans to recover unfinished authorized work before starting another task. A temporary plan or uncommitted change is checked against actual repository state; it is not proof that a task was completed, and unrelated user changes are preserved.

When exactly one active initiative has a ready, authorized next task, the agent names it and continues. When several do, it asks which to select. Deferred initiatives are excluded. When none does, it reports what prevents progress or that no implementation work is ready. It never selects an open product idea for implementation just because the work queue is empty. A remaining “show me before committing” condition survives a session change.

Harness/readiness preparation and E2E Coverage Efficiency are deferred until you explicitly request the named work. The agent preserves existing code, plans, evidence, and history; it does not ask about resumption on each task. Ordinary product work continues with its required checks. You may start a new session every 30–40 minutes; this is a context handoff interval, not a task-completion promise. The agent saves remaining work and reusable validation evidence so “continue” is sufficient for an identifiable unfinished task.

With initiative-wide approval and a verified runner, fresh task runs can start automatically within the agreed budget. They use the committed plan and Git state, preserve unfinished work, and continue only after required validation, reviews and owner checks pass. Failed checks trigger bounded repair of the same task; they do not permit skipping ahead. Missing permissions, mandatory verification, reserved decisions or exhausted recovery/budget produce a concrete blocker for you. The runner must remain in the coding tool selected for the initiative. The Codex host has exercised automatic advancement across two synthetic documentation tasks, independent roles, real validation and local commits, fresh repair of a seeded failure, and completed-task reconciliation after a host restart. These observations establish that bounded workflow, not permissions or capabilities for every future task.

The initiative runner includes an executable host, configured native role adapters, process inspection and synthetic tests. Missing capabilities stop the affected stage with a concrete next action. A completed local commit does not hide a newly discovered blocker or renew the elapsed allowance. Operational details are in [Development Guide §11](DEVELOPMENT.md#initiative-runner). Explicit initiative approval and host command permission are separate: the bounded AW-3 launcher permission does not cover generic initiative-host invocations. Use the supported approval flow for the exact invocation; the pilot needed owner setup to close an unrelated Electron app and approve host execution.

Pilot usage must count fresh primaries, acceptance resumes, independent roles, and retries; unavailable usage totals remain unknown. The pilot retains its original elapsed deadline across all runs and restarts. Report permissions observed during actual operations separately from configured permissions, including whether an operation prompted and whether it passed. A single pilot does not establish usage savings or quality equivalence.

### What to Expect During Delivery

Before substantial work, the agent checks the current session's capabilities needed for your task. If a required tool, validation environment, or independent role is unavailable, it explains the effect and next action early, and continues authorized work that can proceed. Settings alone do not prove access. You do not need to select tools or supervise this check.

The final answer starts with what was delivered, how you can try or inspect it, anything unverified or blocked, and whether you need to decide or do something. Interface results include links to representative inspected visual evidence when available. Documentation and internal changes link to the relevant result. Technical validation evidence follows or is linked from that answer, while failures and blockers remain visible in the short summary. A completed task requiring no action says so; it does not ask you to approve work already authorized. The detailed policy is in [Agent Instructions §12](../AGENTS.md#12-git).
