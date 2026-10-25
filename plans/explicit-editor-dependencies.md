# Explicit editor dependencies

Status: In progress

## Authorization and scope

The owner authorized the concrete follow-ups from the architectural review on 2026-10-25:
explicit save timing (review item 1), browser Data command ownership (item 2), and the
limited platform dependency cleanup (item 5). Preserve all current behavior, storage
identity, save triggers, picker activation, focus handling and clipboard parsing.
No dependencies, platform capabilities, persistence formats or UI features are added.

Item 3 (limited EditorStore state encapsulation) is a separate subsequent proposal,
not part of the active implementation. Item 4 (broad Vim interface refactoring) is deferred.
There are three substantive tasks. This review batch remains open until the owner
accepts the delivered result and confirms no further tasks remain in this batch.

## Tasks

1. **Explicit save timing — Completed.** Add explicit idle and cleanup-retry intervals to
   the scheduler configuration and pass the browser values at composition. Remove
   the delay-equality Clock adapter. Files: `src/application/save-policy.ts`,
   `editor-save-scheduler.ts`, `editor-store.ts`, their focused tests,
   `src/web/services.ts`, `src/web/main.tsx`, and `docs/ARCHITECTURE.md`.
   Acceptance: default desktop timing and browser timing stay unchanged; an unrelated
   clock timer is unaffected; cleanup retry retains its own explicit interval.
2. **Browser command source — Completed.** Replace label-based command discovery and
   MutationObserver with explicit command IDs, enabled state and shared handlers.
   Files: `src/web/menu-commands.ts`, `data-menu.ts`, `backup/backup-controller.ts`,
   `main.tsx`, focused command tests and browser command-panel coverage.
   Acceptance: export/import/restore and backup start/stop/resume remain available
   in the same states; actions start synchronously and preserve existing focus handling.
3. **Platform dependencies — Validated; awaiting commit.** Import the shared attachment limit directly,
   move pure clipboard link parsing into a platform-neutral module, and guard internal
   platform imports. Files: `src/web/services.ts`, `src/infrastructure/main/clipboard.ts`,
   the shared parser, clipboard tests, `eslint.config.mjs`, import-guard tests and
   `docs/ARCHITECTURE.md`. Inspection also found the same browser dependency in
   `paste.ts` and pure PNG validation imported from IPC security. Both are covered:
   PNG checks move unchanged to `shared/png-validation.ts` with desktop compatibility
   re-exports and their existing coverage floor retained in the Vitest configuration.
   Acceptance: both platforms use the unchanged parser;
   browser production code no longer imports desktop implementation modules;
   checks reject reintroduced dependencies.

## Validation and review

High Risk applies to persistence/platform/clipboard changes: `npm run check`,
`npm run test:e2e`, and `npm run audit`. Add focused browser storage, quit, command
panel, backup and clipboard boundary checks. Reuse existing contract and failure
coverage; add focused tests for explicit timing and command identity/activation.
Run independent review after validation. No intentional pixel or product changes;
no manual owner check is currently required before commits. Runtime test access is
verified on each workflow's first invocation; configuration alone is not evidence.

Performance: timing values, save counts and sync semantics are preserved. Command
updates are bounded by the small menu, with no document scan or retained history.
Parser movement preserves its algorithm and input limits. No Electron performance
scenario is selected unless implementation reveals a new scale-sensitive cost;
the fast guards in `npm run check` remain required.

Execution is bounded to these three tasks, one focused commit each, and the existing
two-attempt recovery rule for a repeated blocker. Closure needs only acceptance,
plan retirement and documentation checks. Reserved decisions or behavior changes
stop the dependent work. Temporary validation details live in `WORKING_PLAN.md`.

## Next task

Validation and independent review passed for all three tasks. Commit task 3.
Retain this plan for final owner acceptance and confirmation of the review batch scope.
