# Bootstrap Application

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Bootstrap the documented Electron, React, TypeScript, and Vite application so that it can be run, tested, linted, type-checked, and built from the empty repository.

## Current State

The repository contains product, architecture, development, and agent documentation but no npm project, application source, automated tests, or validation tooling.

## Proposed Changes

- Normalize Markdown filenames to the lowercase paths used throughout the documentation.
- Initialize a private npm package and pin the supported Node.js and npm toolchain.
- Configure Electron Vite builds for isolated main, preload, and renderer processes.
- Add a secure Electron main process and a minimal React application shell.
- Add strict TypeScript configurations and ESLint rules, including architectural import restrictions.
- Configure Vitest with a Node.js default environment and jsdom only for renderer tests.
- Provide the documented development, build, type-checking, linting, testing, and full-validation scripts.
- Document the concrete bootstrap workflow.

## Affected Modules

- Repository and npm configuration
- Electron main and preload entry points
- React renderer entry point and application shell
- Renderer smoke tests
- Development documentation

Domain, application, persistence, clipboard, attachment, navigation, and history modules are intentionally outside this bootstrap.

## Data Model and Persistence

No data model or persistence behavior is introduced or changed.

## Testing Strategy

- Run renderer component tests in jsdom.
- Keep Node.js as the default test environment for future domain and application tests.
- Validate all TypeScript projects, ESLint rules, tests, and production builds through `npm run check`.
- Manually verify that `npm run dev` opens the Electron application.

## Documentation Changes

- Update the README with the available bootstrap commands and scope.
- Update the development guide with the pinned runtime, scripts, test environments, and build output.
- Do not change product requirements or architectural boundaries.

## Risks and Decisions

- Electron, Vite, and related tools must be installed at mutually compatible stable versions and locked in `package-lock.json`.
- Packaging, code signing, distribution, and product functionality are deferred because they are not part of this bootstrap.
- No ADR is required because the work implements the already-approved architecture and technology stack.

## Outcome

- Initialized and locked the npm project with a Vite 7-compatible Electron Vite toolchain.
- Added isolated Electron main, preload, and React renderer entry points.
- Added strict type checking, architectural lint rules, Node-default testing, a jsdom renderer smoke test, and production builds.
- Added the complete `npm run check` validation pipeline.
- Verified both `npm run check` and an Electron development launch.
- Preserved the documented product requirements and architecture.
