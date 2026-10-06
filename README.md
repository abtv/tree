# Tree

Tree is a keyboard-first outliner for macOS. Write notes, break ideas into branches, and focus on a branch while keeping the surrounding structure within reach.

## Features

* **Nested outlines.** Edit text inline, expand branches, or enter a node to focus on its children.
* **Flexible editing.** Use standard text editing or enable Vim-inspired editing with Normal, Insert, Visual, and Replace modes.
* **Easy organization.** Move nodes and their branches with keyboard commands or drag-and-drop, and undo or redo edits.
* **Image attachments.** Paste images into nodes and open them in a larger preview.
* **Local storage.** Documents and images stay on your machine, with automatic saving and recovery from retained document versions.
* **Light and dark appearances.** Choose an appearance or follow the macOS setting.

Tree has no cloud document service and sends no telemetry. Opening external links, searching with Google, and using macOS Look Up can contact external services at your request; see the [Security Policy](docs/SECURITY.md#network-egress-and-content-disclosure).

Detailed behavior and editing commands are described in [Product Requirements](docs/PRODUCT.md).

## Running from Source

Tree is currently in development. There is no packaged application release yet; the repository provides the source and development build.

On macOS, install the toolchain listed in the [Development Guide](docs/DEVELOPMENT.md#2-prerequisites), clone this repository, and run these commands from its directory:

```bash
npm install
npm run dev
```

To build and run the production output locally:

```bash
npm run build
npm run start
```

The build produces unpackaged output, not an installable `.app` or `.dmg`. See the [Development Guide](docs/DEVELOPMENT.md) for setup details, checks, and troubleshooting.

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Open Questions](docs/OPEN_QUESTIONS.md) — non-normative product and technical questions that are still open, with their evidence and decisions.
* [Architecture](docs/ARCHITECTURE.md) — technology stack, technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development environment, commands, testing, validation, and repository conventions.
* [Agent Roles](docs/AGENT_ROLES.md) — the formal definition of each agent role, shared by every coding-agent tool's config.
* [Security Policy](docs/SECURITY.md) — the security model and the tests that verify it.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.
* [Active Plans](plans/README.md) — multi-session initiatives and review follow-up batches, with their next tasks.
* [License](LICENSE) — MIT License.

## Working with the Coding Agent

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

Use [Open Questions](docs/OPEN_QUESTIONS.md) to retain unresolved questions, observations, evidence, and your decisions. It is not an implementation backlog. Do not create an entry for every clear request or fix. Accepting an idea does not itself authorize implementation; ask for the behavior you want delivered.

Decided product behavior belongs in [Product Requirements](docs/PRODUCT.md). An initiative plan belongs under [Active Plans](plans/README.md): it records the objective, authorized scope, ordered tasks, completion evidence, unresolved decisions, and exact next task. The agent proposes and creates this plan when the authorized outcome needs coordination across sessions. A contained task normally uses a short conversation plan; the temporary `WORKING_PLAN.md` is used when working context needs to survive a handoff or independent review. Detailed rules are in [Agent Instructions §8](AGENTS.md#8-plans-and-architecture-decisions).

Prototyping is a separate stage from completing an implementation. A request to postpone tests or commits applies while you review the prototype. Agreeing that it looks promising does not by itself request finalization. Prototypes must preserve existing user work and data; anything that needs a material data or architecture decision is raised before trying it. The `Exploratory` marker in Product Requirements describes implemented behavior still being evaluated through use; it continues to require normal validation and is not a prototype exemption.

### Continuing in a New Session

You can say “continue” or “let's continue the work.” The agent checks Git state, any `WORKING_PLAN.md`, and Active Plans to recover unfinished authorized work before starting another task. A temporary plan or uncommitted change is checked against actual repository state; it is not proof that a task was completed, and unrelated user changes are preserved.

When exactly one active initiative has a ready next task, the agent names it and continues. When several do, it asks which to select. When none does, it reports what prevents progress or that no implementation work is ready. It never selects an open product idea for implementation just because the work queue is empty. A remaining “show me before committing” condition survives a session change.

## Project Structure

Implementation code lives under `src/`. The architectural layers, module structure, and dependency direction are defined in [Architecture](docs/ARCHITECTURE.md).

Coding-agent role definitions live in [Agent Roles](docs/AGENT_ROLES.md); each tool implements them through its own native config (`opencode.json` + `.opencode/agents/` for OpenCode, `.codex/config.toml` + `.codex/agents/` for Codex, `.claude/settings.json` + `.claude/agents/` for Claude Code). The development lifecycle is defined in [Agent Instructions](AGENTS.md), while durable Architecture Decision Records live in `docs/decisions/`.

## Development Principles

Product behavior is defined by the Product Owner and documented in [Product Requirements](docs/PRODUCT.md). The repository's operating rules, including domain/UI separation and the test contract, are defined in [Agent Instructions](AGENTS.md). The architectural invariants are defined in [Architecture](docs/ARCHITECTURE.md).

## License

Tree is licensed under the [MIT License](LICENSE).
