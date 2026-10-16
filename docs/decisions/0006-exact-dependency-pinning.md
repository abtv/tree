# Exact Dependency Pinning

Status: Accepted
Date: 2026-09-13

## Context

The project depends on fast-moving tooling: Electron, React, TypeScript, ESLint, Vite, and Vitest. Declaring caret ranges (`^`) permits any newer minor or patch version to be installed on a fresh `npm install`, so two installs of the same commit can resolve different code unless the lockfile is used exactly. The lockfile makes a local install reproducible, but it also absorbs upgrades silently when regenerated and hides the intended version from the manifest. The newest available major is not automatically the one the project wants to run.

## Decision

Declare every direct dependency in `package.json` with an exact version and no range operator. Upgrades are deliberate changes: update the exact version, reinstall, and complete the dependency validation defined in [Development Guide §9](../DEVELOPMENT.md#risk-based-validation), with Electron performance scope selected separately under [Agent Workflow Procedures §10](../AGENT_WORKFLOW.md#selecting-performance-checks). Indirect dependencies continue to be resolved by `package-lock.json`.

## Consequences

`package.json` and the lockfile agree on the direct dependency set, so the manifest states the exact version in use and `npm ci` is reproducible without range interpretation. Security and upgrade work becomes an explicit diff rather than an incidental one. The cost is that routine patch upgrades no longer arrive automatically and must be applied intentionally; `npm audit` remains required for dependency validation.
