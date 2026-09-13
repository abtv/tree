Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Replace Electron-private IPC handler access in tests

## Goal

Stop the end-to-end and performance suites from reading Electron's private `ipcMain._invokeHandlers` map when injecting delays, failures, and probes, so the test harness depends only on documented `ipcMain.handle`/`ipcMain.removeHandler` behavior.

## Current behavior

Several tests wrap registered IPC handlers to exercise shutdown, persistence, clipboard, and probe paths: `e2e/fixtures.ts` (`delaySaveIpc`), `e2e/clipboard.spec.ts` (`holdClipboardWrite`), `e2e/attachment-validation.spec.ts` (read failure), `e2e/persistence-reliability.spec.ts` (three wrappers), and `perf/state.spec.ts` (save, cleanup, and attachment probes). Every site reaches into `(ipcMain as unknown as { _invokeHandlers: Map<...> })._invokeHandlers` to read the originally registered listener. That map is an Electron implementation detail: it is untyped, undocumented, and can change on any Electron upgrade even though the application's channel contract does not.

## Proposed changes

1. Add `e2e/electron-entry.cjs`, a test-owned Electron main entry. Before requiring the production bundle, it wraps `ipcMain.handle` and `ipcMain.removeHandler` with public-API equivalents that maintain a registry, and exposes `globalThis.__treeIpc` with `get(channel)` and `wrap(channel, wrapper)`. `wrap` re-registers the channel through `ipcMain.handle`, passing the original listener to the wrapper.
2. Launch Electron with the test entry as the app path from both `e2e/fixtures.ts` and `perf/fixtures.ts`. The production bundle stays unchanged and is still loaded by the entry.
3. Add `e2e/ipc-test-control.d.ts` declaring the registry API, and rewrite every `_invokeHandlers` site to use `globalThis.__treeIpc`.
4. Add `e2e/**/*.cjs` to the ESLint file set that receives Node globals.

No IPC channel, payload, main-process module, or product behavior changes.

## Affected modules

- `e2e/electron-entry.cjs` (new)
- `e2e/ipc-test-control.d.ts` (new)
- `e2e/fixtures.ts`, `e2e/clipboard.spec.ts`, `e2e/attachment-validation.spec.ts`, `e2e/persistence-reliability.spec.ts`
- `perf/fixtures.ts`, `perf/state.spec.ts`
- `eslint.config.mjs`

## Testing

- The affected E2E specs and the performance state spec exercise every rewritten wrapper.
- `npm run check:full` covers the complete E2E and performance suites.
- No new unit tests: the change is confined to the test harness and asserts no product behavior.

## Documentation

- `e2e/AGENTS.md`: state that tests inject faults only through public IPC registration APIs, never Electron-private internals.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **App path change.** Passing an entry file instead of the project directory changes `app.getAppPath()`. Nothing in the application reads it; window, preload, renderer, and user-data paths are derived from `__dirname` and `--user-data-dir`.
- **Entry availability.** The entry requires `out/main/index.js`, which the `test:e2e` and `test:perf` commands build first.

## Out of scope

- Changing Electron versions, the production bundle, or the IPC channel contract.
- Adding test hooks to production code.

## Outcome

All six `_invokeHandlers` sites now use the test-owned `e2e/electron-entry.cjs` registry. The affected E2E specs (clipboard, attachment validation, persistence reliability, shutdown failures) and the performance state spec passed after the change. `npm run check:full` passed before commit.
