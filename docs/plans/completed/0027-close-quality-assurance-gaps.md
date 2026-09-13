Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Close quality assurance gaps

## Goal

Bring shutdown and persistence boundary coverage in line with the repository's testing policy, and prevent unit coverage from silently regressing below the established baseline.

## Current evidence

- The complete validation pipeline passes 198 unit/component tests, 64 Electron E2E tests, and 5 performance tests.
- Shutdown success and pending-save flushing have E2E coverage, while save failure, timeout, retry, duplicate requests, application-menu quit, window close, and renderer unavailability are covered only partially or only below the real Electron boundary.
- The application-menu quit handler requests the renderer handshake directly, so it cannot quit normally when no renderer window is available.
- Unit coverage is 89.32% statements, 80.65% branches, 89.70% functions, and 91.45% lines, but the validation pipeline enforces no coverage floor.

## Scope

- Route application-menu quit through the application lifecycle so the existing `before-quit` handshake remains the single shutdown path when a renderer is available.
- Add focused unit coverage for the corrected menu wiring.
- Add Electron E2E scenarios for save failure and recovery, timeout and retry, duplicate quit requests, application-menu quit, window close, and quitting when the renderer is unavailable.
- Extend E2E failure observation so intentionally induced and asserted errors can be distinguished from unexpected renderer errors.
- Enforce global coverage floors at the rounded-down current baseline and run the coverage-enabled unit suite from `npm run check`.
- Update development documentation for the enforced validation behavior without changing product requirements or architecture.

## Validation

- Run the focused unit and Electron E2E tests while developing.
- Run `npm run test:coverage` and confirm every configured floor passes.
- Run `npm run check:full` on supported macOS hardware with a display.
- Review the final diff and commit the completed logical change.

## Result

Application-menu quit now enters the normal application lifecycle, preserving the renderer flush handshake when a window exists while allowing a renderer-less macOS application to quit normally. The Electron suite exercises real save failure and recovery, timeout and retry, duplicate quit suppression, application-menu invocation, window close, renderer unavailability, and existing pending-save flushing. Expected failure messages must be declared by the inducing test and are still asserted in the UI; every other observed persistence or operation error continues to fail teardown.

`npm run check` now executes the coverage-enabled unit suite and enforces global floors of 89% statements, 80% branches, 89% functions, and 91% lines. The final coverage was 89.39% statements, 80.65% branches, 90% functions, and 91.45% lines. `npm run check:full` passed 199 unit/component tests, 67 Electron E2E tests, and 5 performance tests, along with type checking, linting, formatting, the production build, and a zero-vulnerability dependency audit.
