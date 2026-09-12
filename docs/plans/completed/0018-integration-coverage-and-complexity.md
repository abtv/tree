# Main/Preload Coverage and Renderer Complexity

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Improve focused integration coverage for main/preload lifecycle paths and reduce complexity in the largest renderer modules without changing product behavior, persistence, or process boundaries.

## Current State

- `src/main/index.ts` owns Electron application setup, IPC registration, window creation, menu setup, shortcut registration, and quit coordination through top-level side effects.
- `src/preload/index.ts` exposes the complete bridge but has focused coverage only for quit request-ID forwarding.
- `src/renderer/main.tsx` combines store construction, initialization, shutdown listeners, and React mounting.
- `src/renderer/App.tsx` combines view composition, node input event translation, focus/caret coordination, drag-and-drop, and preview state.
- The main/preload unit coverage is low because most wiring is reachable only through full Electron E2E tests.

## Proposed Changes

1. Extract testable main-process composition around injected Electron-facing dependencies while preserving the existing `src/main/index.ts` entrypoint and security checks.
2. Add focused contract tests for IPC handler registration, trusted-renderer enforcement, quit request/confirmation behavior, and error propagation.
3. Expand preload bridge tests to cover event listener registration/removal and every exposed IPC method's channel and argument forwarding.
4. Extract renderer lifecycle setup from `src/renderer/main.tsx` into a small testable module covering initialization and shutdown flush/acknowledgement behavior.
5. Split the densest node interaction and presentation responsibilities from `App.tsx` into focused renderer modules without moving business rules into UI code.
6. Keep E2E coverage unchanged and use it to verify the real Electron boundary after the refactor.

## Testing Strategy

- Add unit tests for the extracted main composition using mocked platform adapters.
- Add preload contract tests for all channels, arguments, listener cleanup, and rejected IPC promises.
- Add renderer lifecycle tests for initialization failure and successful/failed shutdown flushing.
- Run the existing component, E2E, performance, and property-based suites.
- Run `npm run check:full` before completion.

## Risks and Boundaries

- Do not change IPC channel names, persisted data, application shortcuts, or Electron process boundaries.
- Keep domain and application logic independent of React, DOM, and Electron.
- Avoid introducing a state-management library or broad abstraction layer.
- Preserve the existing macOS E2E fixture process-ownership guarantees.

## Completion Criteria

- Main/preload lifecycle behavior has focused contract coverage in addition to E2E coverage.
- Renderer startup/shutdown wiring is independently testable.
- The largest renderer module is reduced into focused components/helpers without behavior changes.
- `npm run check:full` passes.
- This plan is moved to `docs/plans/completed/` with completion metadata.

## Validation Outcome

`npm run check:full` passes with 149 unit/component tests, 62 functional E2E tests, and 5 performance tests. Type checking, linting, formatting, production build, and dependency audit also pass.
