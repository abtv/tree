# Refactor Renderer Input Bindings

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Reduce the renderer composition root's interaction complexity without changing product behavior, persistence, IPC, or the domain/application boundaries.

## Current State

- `src/renderer/App.tsx` combines page composition with input registration, focus and caret restoration, composition state, selection styling, and node-input event-to-command translation.
- `NodeInput` supports both plain-text textareas and linked-text contenteditable controls, making focus and selection behavior sensitive to the native control type.
- `editor-input-handlers.ts` is isolated from JSX but has no direct unit tests; its behavior is exercised indirectly through `App` tests and E2E tests.

## Proposed Changes

1. Extract a renderer-only hook that owns input registration, focus/caret synchronization, composition state, and node input bindings.
2. Keep `App` responsible for store subscription, view composition, current-level selection, attachments, status presentation, and preview state.
3. Use the existing domain lookup helpers rather than retaining a renderer-local tree traversal.
4. Add focused unit tests for keyboard dispatch and preserve component and E2E coverage.

## Boundaries

- The hook only translates DOM events into existing `EditorStore` commands.
- Tree manipulation rules remain in the domain/application layers.
- No product, persistence, data-model, IPC, or process-boundary behavior changes.

## Validation

- Run the focused renderer tests while implementing.
- Run `npm run check:full` before committing.

## Validation Outcome

- `npm run check` passed: type checking, linting, formatting, 187 unit/component tests, production build, and dependency audit.
- `npx playwright test` passed: 64 Electron end-to-end tests.
- `npm run test:perf` passed: 5 performance tests.
