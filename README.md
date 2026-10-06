# Tree

Tree is a keyboard-first outliner for macOS. Write notes, break ideas into branches, and focus on a branch while keeping the surrounding structure within reach.

[Watch the demo video](https://abtv.github.io/tree/tree-demo.webm)

![Tree in the light appearance, showing reading club, work, learning, and ideas branches, with some branches expanded and others folded.](https://abtv.github.io/tree/tree-overview.png)

Keep projects, notes, and ideas in one outline. Expand the branches you are working on and keep other details folded away.

![Tree in the dark appearance, focused on the first meetup branch with its breadcrumb path and Vim Normal mode indicator visible.](https://abtv.github.io/tree/tree-focus-dark.png)

The same outline, focused on “Plan the first meetup”: the node text and expanded branches are unchanged. The breadcrumb path keeps its place in the larger project visible. Here, the dark appearance and Vim Normal mode are enabled.

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

## Development Workflow

For the project’s agent development workflow, see [Working with the Coding Agent](docs/WORKING_WITH_AGENT.md).

## Project Structure

Implementation code lives under `src/`. The architectural layers, module structure, and dependency direction are defined in [Architecture](docs/ARCHITECTURE.md).

Coding-agent role definitions live in [Agent Roles](docs/AGENT_ROLES.md); each tool implements them through its own native config (`opencode.json` + `.opencode/agents/` for OpenCode, `.codex/config.toml` + `.codex/agents/` for Codex, `.claude/settings.json` + `.claude/agents/` for Claude Code). The development lifecycle is defined in [Agent Instructions](AGENTS.md), while durable Architecture Decision Records live in `docs/decisions/`.

## Development Principles

Product behavior is defined by the Product Owner and documented in [Product Requirements](docs/PRODUCT.md). The repository's operating rules, including domain/UI separation and the test contract, are defined in [Agent Instructions](AGENTS.md). The architectural invariants are defined in [Architecture](docs/ARCHITECTURE.md).

## License

Tree is licensed under the [MIT License](LICENSE).
