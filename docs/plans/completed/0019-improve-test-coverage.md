# Improve Test Coverage

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Improve meaningful automated coverage of renderer DOM adapters, Electron service wiring, and lifecycle boundary behavior without changing product behavior.

## Current State

- Unit and component tests pass, but coverage is approximately 80.5% statements and 74.7% branches.
- `src/renderer/editor-dom.ts` has uncovered caret, selection, and linked-text branches.
- `src/infrastructure/renderer/electron-services.ts` has minimal direct coverage.
- `src/renderer/main.tsx` and `src/main/index.ts` are entrypoint-heavy and difficult to cover without testing composition seams.

## Proposed Changes

1. Add focused jsdom tests for rich-text rendering/parsing, caret and selection helpers, linked caret boundaries, and selection edge cases.
2. Add a contract test for renderer Electron service forwarding and attachment reads.
3. Add a small testable entrypoint seam where needed for lifecycle composition, preserving the existing Electron and React boundaries.
4. Run coverage and the fast validation pipeline; record the measured result and any remaining environment-only E2E limitation.

## Testing Strategy

- Keep domain and application tests in the Node environment.
- Use jsdom only for DOM-dependent renderer helpers.
- Assert runtime channel/argument forwarding at the renderer service boundary.
- Preserve existing tests and add edge cases rather than tests written only to increase percentages.

## Completion Criteria

- New tests pass and cover the targeted renderer and infrastructure behavior.
- Type checking, linting, formatting, unit/component tests, and production build pass.
- Coverage improves in the targeted files without weakening existing assertions.
- This plan is moved to `docs/plans/completed/` with completion metadata.

## Validation Outcome

- Added nine jsdom tests for renderer DOM serialization, parsing, caret, selection, and linked-text boundary behavior.
- Added three renderer Electron service contract tests for forwarding, rejected promises, and the optional clipboard writer.
- Unit tests pass: 161 tests across 15 files.
- Coverage improved from 80.51% to 82.34% statements, 74.73% to 75.78% branches, 77.95% to 80.83% functions, and 82.70% to 84.55% lines.
- Type checking, linting, formatting, and production build pass.
- E2E and performance suites remain environment-blocked by Electron startup aborts before application code runs; no product behavior was changed.
