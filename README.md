# Tree

A macOS desktop application for working with a hierarchical tree of text nodes and image attachments.

The application combines the simplicity of Workflowy-style hierarchical editing with the navigation model of a file explorer.

## Overview

The application represents information as a tree of nodes.

Each node can contain:

* text;
* child nodes;
* at most one image attachment.

The user works with one level of the tree at a time and can navigate into nodes to explore deeper levels.

The application is designed to be keyboard-first, with mouse drag-and-drop available for reordering sibling nodes.

## Tech Stack

* Electron
* React
* TypeScript
* Vite

## Getting Started

Use Node.js `24.13.1` and npm `11.8.0`. The Node.js version is recorded in `.nvmrc`.

Install dependencies:

```bash
npm install
```

Run the application in development mode:

```bash
npm run dev
```

Run the standard validation pipeline:

```bash
npm run check
```

Run the complete validation pipeline, including end-to-end tests:

```bash
npm run check:full
```

Other available commands:

```bash
npm run build
npm run start
npm run typecheck
npm run lint
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e
```

The end-to-end suite launches the real Electron application and verifies persistence, clipboard, and attachment behavior. It is macOS-only and builds the application before running Playwright.

The application opens an inline, keyboard-first tree editor. It supports multiple root nodes, entering and leaving levels, sibling creation and reordering, undo/redo, text and image paste, local image attachments, and automatic persistence between restarts.

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Architecture](docs/ARCHITECTURE.md) — technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development workflow, testing, validation, and repository conventions.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.

## Project Structure

The repository is organized around a clear separation between product requirements, architecture, development practices, and implementation.

Implementation code lives under `src/`.

The implementation separates pure tree behavior in `src/domain/`, editor commands and runtime history in `src/application/`, Electron and filesystem adapters in `src/infrastructure/` and `src/main/`, and the React UI in `src/renderer/`.

Additional documentation may be added under `docs/` as the project evolves, including:

* `docs/plans/` — implementation plans for larger tasks.
* `docs/decisions/` — Architecture Decision Records for important technical decisions.

These directories are created when they are first needed.

## Development Principles

The project follows several core principles:

* Product behavior is defined by the Product Owner.
* Product requirements are documented in `docs/PRODUCT.md`.
* Domain logic is independent of React and Electron.
* UI code should not contain core business logic.
* Important behavior is covered by automated tests.
* Changes should remain focused and avoid unnecessary complexity.
* Git history should preserve meaningful logical changes.
