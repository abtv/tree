# Tree

A macOS desktop application for working with a hierarchical tree of text nodes and image attachments. The authoritative product behavior is defined in [Product Requirements](docs/PRODUCT.md).

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Product Discovery](docs/PRODUCT_DISCOVERY.md) — non-normative hypotheses, experiments, evidence, and unresolved product questions.
* [Architecture](docs/ARCHITECTURE.md) — technology stack, technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development environment, commands, testing, validation, and repository conventions.
* [Agent Roles](docs/AGENT_ROLES.md) — the formal definition of each agent role, shared by every coding-agent tool's config.
* [Security Policy](SECURITY.md) — the security model and the tests that verify it.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.
* [License](LICENSE) — MIT License.

## Getting Started

Prerequisites, dependency installation, the development command, and the full command list are defined in the [Development Guide](docs/DEVELOPMENT.md).

## Project Structure

Implementation code lives under `src/`. The architectural layers, module structure, and dependency direction are defined in [Architecture](docs/ARCHITECTURE.md).

Coding-agent role definitions live in [Agent Roles](docs/AGENT_ROLES.md); each tool implements them through its own native config (`opencode.json` + `.opencode/agents/` for OpenCode, `.codex/config.toml` + `.codex/agents/` for Codex, `.claude/settings.json` + `.claude/agents/` for Claude Code). The development lifecycle is defined in [Agent Instructions](AGENTS.md), while durable Architecture Decision Records live in `docs/decisions/`.

## Development Principles

Product behavior is defined by the Product Owner and documented in [Product Requirements](docs/PRODUCT.md). The repository's operating rules, including domain/UI separation and the test contract, are defined in [Agent Instructions](AGENTS.md). The architectural invariants are defined in [Architecture](docs/ARCHITECTURE.md).
