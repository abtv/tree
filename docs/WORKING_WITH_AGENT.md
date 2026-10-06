# Working with the Coding Agent

As Product Owner, describe the problem, desired result, or question in ordinary language. You do not need to choose a work type, name files, split the work into tasks, or select validation commands. The agent identifies the appropriate approach, explains its interpretation, and carries authorized work to completion. You decide product behavior and material tradeoffs; the agent owns implementation, testing, documentation, and commits.

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

Decided product behavior belongs in [Product Requirements](PRODUCT.md). An initiative plan belongs under [Active Plans](plans/README.md): it records the objective, authorized scope, ordered tasks, completion evidence, unresolved decisions, and exact next task. The agent proposes and creates this plan when the authorized outcome needs coordination across sessions. A contained task normally uses a short conversation plan; the temporary `WORKING_PLAN.md` is used when working context needs to survive a handoff or independent review. Detailed rules are in [Agent Instructions §8](../AGENTS.md#8-plans-and-architecture-decisions).

Prototyping is a separate stage from completing an implementation. A request to postpone tests or commits applies while you review the prototype. Agreeing that it looks promising does not by itself request finalization. Prototypes must preserve existing user work and data; anything that needs a material data or architecture decision is raised before trying it. The `Exploratory` marker in Product Requirements describes implemented behavior still being evaluated through use; it continues to require normal validation and is not a prototype exemption.

### Continuing in a New Session

You can say “continue” or “let's continue the work.” The agent checks Git state, any `WORKING_PLAN.md`, and Active Plans to recover unfinished authorized work before starting another task. A temporary plan or uncommitted change is checked against actual repository state; it is not proof that a task was completed, and unrelated user changes are preserved.

When exactly one active initiative has a ready next task, the agent names it and continues. When several do, it asks which to select. When none does, it reports what prevents progress or that no implementation work is ready. It never selects an open product idea for implementation just because the work queue is empty. A remaining “show me before committing” condition survives a session change.
