# Extract Structural Editor Transitions

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Further reduce `EditorStore` command complexity by extracting pure node-creation and sibling-reordering transitions while preserving editor behavior and the `EditorStore` public API.

## Current State

`EditorStore` already delegates navigation/deletion and clipboard/paste decisions to focused application-layer transition modules. It still directly combines the pure document, location, and focus outcomes for Enter-driven sibling-or-child creation and drag reordering with history, persistence, focus-token, and text-session orchestration.

## Proposed Changes

1. Extend the editor command transition module with pure transitions for creating a sibling or first child and moving a displayed node to an insertion index.
2. Route `EditorStore` structural commands through those transitions, retaining ownership of ID generation, text-session boundaries, snapshot history, persistence, focus tokens, listeners, and its public API.
3. Add focused unit tests for start-of-text insertion, splitting, current-parent child creation, valid reordering, and no-op/out-of-level moves; retain the existing store, property, Electron E2E, and performance coverage.

## Boundaries

- The transition functions may depend only on domain document types and operations. They must not depend on React, Electron, filesystem APIs, or infrastructure services.
- No product, data-model, persistence, IPC, or process-boundary behavior changes are intended.
- `EditorStore` remains the application command facade and side-effect coordinator.

## Validation

- Run the focused application tests while implementing.
- Run `npm run check:full` before committing.

## Risks

These commands are sensitive to cursor-zero insertion, attachment-preserving node splitting, selected-current-parent behavior, sibling destination-index adjustment, and drag events for nodes outside the displayed level. The extracted transitions must preserve each existing outcome exactly.

## Outcome

- Added pure command transitions for Enter-driven sibling-or-first-child creation and displayed-level sibling reordering.
- Kept `EditorStore` as the public command facade and owner of ID generation, text-session boundaries, snapshot history, persistence, focus tokens, and listeners.
- Added focused transition tests for insertion, splitting, first-child creation, reordering, and no-op/out-of-level moves.

## Validation Outcome

- `npm run check` passed: type checking, linting, formatting, 198 unit/component tests, production build, and dependency audit.
- `npx playwright test --reporter=dot` passed: 64 Electron end-to-end tests.
- `npm run test:perf` passed: 5 performance tests.
