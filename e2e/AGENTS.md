# End-to-End AGENTS.md

Rules for the Playwright Electron suite in `e2e/`. The root `AGENTS.md` still applies.

## Rules

* Tests drive the production build in `out/` and isolate data with a temporary `--user-data-dir`.
* The suite is serial with a single worker and requires macOS with a display.
* Own every Electron child process: register it before waiting for readiness, clean it up on launch or readiness failure, and tear down with bounded escalation. Never kill arbitrary Electron processes.
* Inject IPC delays, failures, and probes only through the test-owned entry `e2e/electron-entry.cjs` and its `globalThis.__treeIpc` registry; never read Electron-private internals such as `ipcMain._invokeHandlers`.
* For editing-command shortcuts, suppress the native browser behavior so the test proves the application handles the command (`docs/decisions/0003-renderer-owns-standard-editing-commands.md`).
* Observe visible save and operation errors; a test that intentionally induces one must declare the exact expected message.
* Temporary diagnostic specs are named `_*.spec.ts` in this directory. When the investigation finishes, move them to `test-results/` instead of deleting them: that directory is gitignored and Playwright clears it at the start of every run.

## Commands

* Run `npm run test:e2e`. Do not count blocked or skipped boundary tests as passing.
