# Extract Editor Command Transitions

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Reduce `EditorStore` command complexity by extracting pure navigation, focus, and structural-deletion transition decisions into a focused application-layer collaborator, without changing product behavior or `EditorStore`'s public API.

## Current State

`EditorStore` owns command orchestration plus several pure decisions about the next location and cursor after navigation or deletion. Those decisions are intermixed with snapshot updates, history, persistence, and infrastructure operations.

## Proposed Changes

1. Add an application-layer transition collaborator for pure navigation and deletion outcomes.
2. Route `EditorStore` navigation and deletion commands through that collaborator while retaining its existing public methods and side-effect ownership.
3. Add focused collaborator unit tests for location and focus outcomes, retaining existing store, property, and end-to-end coverage.

## Boundaries

- The collaborator may depend on domain document types and lookup helpers, but not React, Electron, or infrastructure services.
- `EditorStore` retains history, persistence, clipboard, attachment, snapshot, and listener orchestration.
- No product, data-model, persistence, IPC, or process-boundary behavior changes are intended.

## Validation

- Run focused application tests during implementation.
- Run `npm run check:full` before committing.

## Outcome

- Added a pure application-layer transition collaborator for vertical and horizontal navigation, entering, leaving, ancestor navigation, selected-node deletion, and empty-node deletion.
- Retained `EditorStore` as the public command facade and owner of snapshot, history, persistence, clipboard, attachment, and listener orchestration.
- Added focused transition tests and retained the existing store, property, end-to-end, and performance coverage.

## Validation Outcome

- `npm run check` passed: type checking, linting, formatting, 192 unit/component tests, production build, and dependency audit.
- `npx playwright test --reporter=dot` passed: 64 Electron end-to-end tests.
- `npm run test:perf` passed: 5 performance tests.
