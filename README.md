# Tree

A macOS desktop application for working with a hierarchical tree of text nodes and image attachments. The authoritative product behavior is defined in [Product Requirements](docs/PRODUCT.md).

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Product Discovery](docs/PRODUCT_DISCOVERY.md) — non-normative hypotheses, experiments, evidence, and unresolved product questions.
* [Architecture](docs/ARCHITECTURE.md) — technology stack, technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development environment, commands, testing, validation, and repository conventions.
* [Agent Roles](docs/AGENT_ROLES.md) — the formal definition of each agent role, shared by every coding-agent tool's config.
* [Security Policy](docs/SECURITY.md) — the security model and the tests that verify it.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.
* [Active Plans](plans/README.md) — multi-session initiatives and their next tasks.
* [License](LICENSE) — MIT License.

## Working with Product Ideas

Use [Product Requirements](docs/PRODUCT.md) for behavior you have decided the application should have. If you know what you want, describe it to the coding agent. The agent can update the requirements, implement the change, and test it. If an important detail is unclear, decide it together before implementation.

Use [Product Discovery](docs/PRODUCT_DISCOVERY.md) when you are unsure whether a problem needs solving or which solution would help. Write down a real example from using the app, possible explanations, and a small way to learn more. You do not need a discovery entry for every fix or clear request.

After trying an idea, decide whether to pursue it. A discovery note is not permission to build it. When you want the change, ask the agent for the specific behavior; it will then update Product Requirements and follow the normal development workflow. After using the result, note whether it solved the original problem.

For example, you could say: “I had trouble finding a note today. Record what happened in Product Discovery and suggest a simple way to check whether this keeps happening.” If you later decide you want search, describe how search should work and ask the agent to implement it.

## Getting Started

Prerequisites, dependency installation, the development command, and the full command list are defined in the [Development Guide](docs/DEVELOPMENT.md).

## Project Structure

Implementation code lives under `src/`. The architectural layers, module structure, and dependency direction are defined in [Architecture](docs/ARCHITECTURE.md).

Coding-agent role definitions live in [Agent Roles](docs/AGENT_ROLES.md); each tool implements them through its own native config (`opencode.json` + `.opencode/agents/` for OpenCode, `.codex/config.toml` + `.codex/agents/` for Codex, `.claude/settings.json` + `.claude/agents/` for Claude Code). The development lifecycle is defined in [Agent Instructions](AGENTS.md), while durable Architecture Decision Records live in `docs/decisions/`.

## Development Principles

Product behavior is defined by the Product Owner and documented in [Product Requirements](docs/PRODUCT.md). The repository's operating rules, including domain/UI separation and the test contract, are defined in [Agent Instructions](AGENTS.md). The architectural invariants are defined in [Architecture](docs/ARCHITECTURE.md).
