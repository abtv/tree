# Working with the Coding Agent

As Product Owner, describe the problem, desired result, or question in ordinary language. You do not need to choose a work type, name files, split the work into tasks, or select validation commands. The agent identifies the appropriate approach, explains its interpretation, and carries authorized work to completion. You decide product behavior and material tradeoffs; the agent owns implementation, testing, documentation, and commits.

### Command Menu

Write `menu` to see these calls in your conversation language. Use them as ordinary messages in Codex, Claude Code, or OpenCode; they require no installation or terminal command. Natural-language requests work too. The text after `:` describes the target; you do not need to choose files, record IDs, tools, or validation commands. An unambiguous reference to the current discussion is sufficient.

| Call | Result | File changes |
| --- | --- | --- |
| `menu` | Show this menu and its read/write labels without starting any listed action. | Read only |
| `status` | Inspect current task evidence and Git state; report what is done, what remains, blockers, and any necessary owner action. Do not resume work or rerun validation. | Read only |
| `continue` | Resume identifiable unfinished authorized work under [continuation rules](#continuing-in-a-new-session). Exclude deferred work and preserve review/no-commit conditions. If nothing is ready, report that. | Within existing authorization |
| `ideas` | Give a short periodic review of PD-001, PD-002, PD-004, TD-001 and TD-002 from [Open Questions](OPEN_QUESTIONS.md): ID, title, kind, recorded status, latest recorded evidence date, and the unresolved owner choice. Do not select, investigate, or change an idea. | Read only |
| `save-idea: …` | Save the supplied idea in Open Questions. The agent chooses the kind and an unused ID, uses the existing template, and checks for an existing matching entry before adding another. Preserve the owner's meaning and uncertainty; record an uninvestigated new idea as `Idea`. This authorizes recording only. | Documentation; validate and commit |
| `discuss: …` | Inspect relevant evidence and give a recommendation with material tradeoffs. Do not implement or record the discussion in repository files. | Read only |
| `implement: …` | Deliver the stated outcome with required documentation, checks, review, and commit. Resolve material gaps before implementation; follow initiative planning/authorization rules if the outcome needs one. | Implementation within stated scope |
| `fix: …` | Reproduce and correct the reported defect within recorded requirements, following the defect-first workflow and required validation. Apply the uncommitted owner-verification gate for a failed latest fix. | Implementation within stated scope |
| `improve-permissions` | Analyze relevant interventions and prior corrections, then recommend concrete changes under the [shared procedure](OWNER_INTERVENTIONS.md#improve-permissions-procedure). | Read only; application needs authorization |

Read-only calls do not authorize file edits or settings changes. Mandatory intervention logging under `AGENTS.md` §4 remains the sole recording exception when owner action is required. Calls that authorize edits retain all scope, review, validation, and platform-permission requirements; existing instructions to withhold a commit still apply. `save-idea` does not authorize experiments, product changes, or resolution of an existing question. If the evidence needed by its template is not yet known, record that uncertainty rather than invent observations or an owner decision. The agent handles formatting, record selection, and required checks itself.

For example, `save-idea: make notes easier to find` records an idea; `discuss: ways to find notes` requests analysis; `implement: the search behavior we just specified` requests delivery within that agreed scope. A bare `fix` or `implement` with no identifiable target needs clarification. Showing or quoting a call is not an instruction to execute it. No call implicitly resumes deferred infrastructure or permits bypassing a denial; resumption still requires an explicit request naming that work.

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

For a brief weekly review, send `ideas` when you want it. Use one compact row per requested question, report missing evidence as unknown, and stop after the summary. Review the saved record only; do not research implementation or external sources, launch experiments, choose priorities, change statuses, schedule recurring work, or send reminders unless explicitly requested. A later explicit request naming an idea authorizes only the investigation or action it describes.

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

Harness/readiness preparation and E2E Coverage Efficiency are deferred until you explicitly request the named work. The agent preserves existing code, plans, durable findings, and history; it does not ask about resumption on each task. Ordinary product work continues with its required checks. You may start a new session every 30–40 minutes; this is a context handoff interval, not a task-completion promise. The agent saves remaining work and reusable validation evidence so “continue” is sufficient for an identifiable unfinished task.

Runner development and unattended preflight are deferred. Their retained procedures are in [Deferred Runner](DEFERRED_RUNNER.md); they apply only after an explicit request to resume the named work. Ordinary planning, continuation and final owner acceptance remain in [Development Guide §11](DEVELOPMENT.md#11-multi-session-initiatives).

### What to Expect During Delivery

Before substantial work, the agent checks the current session's capabilities needed for your task. If a required tool, validation environment, or independent role is unavailable, it explains the effect and next action early, and continues authorized work that can proceed. Settings alone do not prove access. You do not need to select tools or supervise this check.

The final answer starts with what was delivered, how you can try or inspect it, anything unverified or blocked, and whether you need to decide or do something. Interface results include links to representative inspected visual evidence when available. Documentation and internal changes link to the relevant result. Technical validation evidence follows or is linked from that answer, while failures and blockers remain visible in the short summary. A completed task requiring no action says so; it does not ask you to approve work already authorized. The detailed policy is in [Agent Instructions §12](../AGENTS.md#12-git).
