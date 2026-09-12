# Shutdown, Renderer, and Performance Improvements

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Make shutdown coordination bounded and recoverable, reduce renderer complexity without moving business rules into the UI, and improve large-document editing performance while preserving product behavior and snapshot-based undo/redo.

## Scope

1. Add a bounded main/renderer shutdown handshake with a five-second timeout. On timeout or save failure, keep the application open and surface the error to avoid silent data loss.
2. Decompose `App.tsx` into focused renderer components and DOM helpers while keeping commands in `EditorStore`.
3. Measure and optimize text editing, tree lookup, rendering, and persistence costs for large documents.

## Affected Areas

- `src/main/index.ts`, preload/shared IPC, and main-process tests.
- `src/application/editor-store.ts` and application tests.
- `src/renderer/App.tsx`, new renderer components/helpers, and component tests.
- `src/domain/document.ts` and property/performance tests.
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT.md` if guarantees or workflows change.

## Testing Strategy

- Unit-test shutdown success, timeout, renderer disappearance, save failure, and duplicate requests.
- Preserve all existing keyboard, caret, link, drag/drop, attachment, and navigation tests while adding focused tests for extracted components.
- Add or update property tests for structural sharing, identity, serialization, and undo/redo invariants.
- Establish startup and typing baselines for 1,000- and 10,000-node documents, then compare optimized results.
- Run the full validation suite on a supported macOS desktop; report Electron/macOS LaunchServices failures separately when the environment prevents launch.

## Decisions

- Shutdown timeout: five seconds.
- On timeout or persistence failure: do not force quit; keep the application open and show the failure.
- Do not introduce a state-management library or replace snapshot history unless profiling proves the simpler architecture insufficient.

## Completion Criteria

- Shutdown cannot wait indefinitely and does not silently discard unsaved changes.
- `App.tsx` is reduced to composition and orchestration, with focused renderer modules and unchanged behavior.
- Large-document performance has measured before/after evidence and no regression in correctness tests.
- Relevant documentation is consistent with the implementation.
- `npm run check:full` passes on supported macOS hardware, or environmental failures are explicitly reported.

## Validation Outcome

Type checking, linting, formatting, 137 unit/component tests, and the production build pass. The Electron E2E and performance suites remain blocked in the current environment by macOS 26 LaunchServices/Electron startup aborts before application code runs. `npm audit` remains blocked by registry DNS connectivity.

## Follow-up Correction

The renderer and application-menu quit commands now initiate the handshake directly through the main process. They no longer call `app.quit()` and rely on `before-quit` interception, avoiding a race that could leave the application open after displaying a shutdown timeout error.

## Follow-up Correction

The preload quit bridge now forwards the shutdown request ID through IPC. Without this argument, renderer confirmation was interpreted as a new quit request and the handshake always reached its timeout path. A regression test covers the forwarding contract.
