# Reliability, Security, and Renderer Maintenance

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Harden shutdown persistence and attachment validation, make asynchronous failures recoverable and visible, improve large-document performance, and reduce renderer complexity without changing the product model or user-visible editing behavior.

## Scope

1. Flush pending persistence before application shutdown.
2. Validate that attachment bytes are real PNG data and keep clipboard image handling consistent with the PNG-only model.
3. Clear recovered save errors and provide a testable error path for renderer-triggered asynchronous operations.
4. Measure and improve document update and rendering costs for large documents while preserving snapshot-based undo/redo correctness.
5. Extract focused renderer components/helpers from `App.tsx` without moving business rules into the UI.

## Affected Areas

- `src/application/editor-store.ts` and its tests.
- `src/main/index.ts`, `src/main/ipc-security.ts`, and attachment/clipboard infrastructure.
- `src/preload/index.ts` and shared IPC types.
- `src/renderer/App.tsx`, renderer components/helpers, and component tests.
- Performance fixtures/tests and development documentation.

## Testing Strategy

- Add unit tests for persistence flushing, save recovery, PNG validation, and rejected image formats.
- Add renderer tests for surfaced asynchronous operation errors and extracted components.
- Preserve and extend property tests for document validity, identity, and undo/redo.
- Run the performance suite for the existing 1,000- and 10,000-node scenarios and retain measurements in the test output.
- Run the Electron E2E suite on a macOS display; report environment limitations separately from product failures.

## Risks and Decisions

- Shutdown must not exit before the latest save has completed. If persistence fails, shutdown remains blocked and the error is surfaced so the user can retry.
- PNG validation should reject malformed or non-PNG bytes rather than silently converting data.
- Performance changes must not replace the existing simple snapshot history until measurements demonstrate a need.
- Renderer extraction must preserve keyboard, caret, drag-and-drop, hyperlink, and attachment behavior.

## Completion Criteria

- All five scoped issues have implementation and regression coverage.
- Architecture and development documentation describe the final shutdown and attachment guarantees.
- `npm run check` passes, subject to reporting external audit connectivity failures.
- `npm run check:full` passes on a supported macOS display, or any environment-only limitation is explicitly documented.
- The plan is moved to `docs/plans/completed/` with completion metadata before the logical commit.

