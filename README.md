# Tree

A macOS desktop application for working with a hierarchical tree of text nodes and image attachments. The authoritative product behavior is defined in [Product Requirements](docs/PRODUCT.md).

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Product Discovery](docs/PRODUCT_DISCOVERY.md) — non-normative hypotheses, experiments, evidence, and unresolved product questions.
* [Architecture](docs/ARCHITECTURE.md) — technology stack, technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development environment, commands, testing, validation, and repository conventions.
* [Security Policy](SECURITY.md) — the security model and the tests that verify it.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.
* [License](LICENSE) — MIT License.

## Getting Started

Prerequisites, dependency installation, the development command, and the full command list are defined in the [Development Guide](docs/DEVELOPMENT.md).

## Project Structure

Implementation code lives under `src/`. The architectural layers, module structure, and dependency direction are defined in [Architecture](docs/ARCHITECTURE.md).

OpenCode task roles and model settings live in `opencode.json` and `.opencode/agents/`. The development lifecycle is defined in [Agent Instructions](AGENTS.md), while durable Architecture Decision Records live in `docs/decisions/`.

## Development Principles

Product behavior is defined by the Product Owner and documented in [Product Requirements](docs/PRODUCT.md). The repository's operating rules, including domain/UI separation and the test contract, are defined in [Agent Instructions](AGENTS.md). The architectural invariants are defined in [Architecture](docs/ARCHITECTURE.md).
