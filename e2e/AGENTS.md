# End-to-End AGENTS.md

Rules for the Playwright Electron suite in `e2e/`. The root `AGENTS.md` still applies.

## Rules

* Tests drive the production build in `out/` and isolate data with a temporary `--user-data-dir`.
* Hidden runs execute spec files in parallel across the workers configured in `playwright.config.ts`; selected long-running suites also distribute their independent tests across those workers through `configureHiddenParallelTests()`. Visible runs stay serial. The suite requires macOS with a display, and hidden windows still need a GUI session.
* Opt into hidden test-level parallelism only for suites whose tests are independent and use the per-test fixtures for data, cleanup, error observation, and shared-system locking. Never opt `e2e/shortcut.spec.ts` into it.
* Every worker owns its own applications. Data directories and stale-process cleanup use the per-worker marker `tree-e2e-p<pid>-`, so a launch can only ever terminate apps started by the same worker. Leftovers from earlier runs are removed once in `e2e/global-setup.ts`, before workers start.
* Never run two Playwright invocations at the same time: the global setup cleans stale `tree-e2e-` applications and would terminate the other invocation's apps.
* Launch hidden windows by default and keep the per-launch window-mode assertion. Select visibility only through `launchTree` (`windows: 'hidden' | 'visible'`) or `TREE_E2E_VISIBLE=1`, and implement it only through the test-owned entry (`e2e/electron-entry.cjs` and `e2e/hidden-windows.cjs`). Never add window-visibility hooks to application code.
* Never register the real machine-global `Cmd+0` accelerator outside `e2e/shortcut.spec.ts`. Parallel launches use the test-owned shortcut stub, selected through `launchTree({ shortcut: 'stub' | 'real' })` and implemented only in `e2e/shortcut-stub.cjs`; every launch asserts the requested mode. `e2e/shortcut.spec.ts` must request `real`.
* The system clipboard is machine-global. The clipboard helpers in `fixtures.ts` and `firePaste` acquire the cross-process lock in `e2e/clipboard-lock.ts`. A test that makes the application read or write the clipboard another way (Cmd+C, Cmd+X, Cmd+V, or a context-menu Copy or Paste) must call `lockSystemClipboard()` before the first clipboard interaction. The per-test fixture teardown releases the lock.
* Put per-test teardown in the `userDataDir` fixture, never in a module-level `test.afterEach`: Playwright caches imported helper modules for the lifetime of a worker, so a module-level hook attaches only to the first test file's suite and silently stops running for later files.
* Own every Electron child process: register it before waiting for readiness, clean it up on launch or readiness failure, and tear down with bounded escalation. Never kill arbitrary Electron processes.
* Address the application's main window through the `fixtures.ts` helpers (`closeMainWindow`, `setMainWindowBounds`, `readMainWindowBounds`); never use `BrowserWindow.getFocusedWindow()` for correctness, because the suite runs on a live desktop and the application may not be frontmost.
* Inject IPC delays, failures, and probes only through the test-owned entry `e2e/electron-entry.cjs` and its `globalThis.__treeIpc` registry; never read Electron-private internals such as `ipcMain._invokeHandlers`.
* For editing-command shortcuts, suppress the native browser behavior so the test proves the application handles the command (`docs/decisions/0003-renderer-owns-standard-editing-commands.md`).
* Observe visible save and operation errors; a test that intentionally induces one must declare the exact expected message.
* Temporary diagnostic specs are named `_*.spec.ts` in this directory. When the investigation finishes, move them to `test-results/` instead of deleting them: that directory is gitignored and Playwright clears it at the start of every run.

## Commands

* Run `npm run test:e2e`. Do not count blocked or skipped boundary tests as passing.
* Run `TREE_E2E_VISIBLE=1 npm run test:e2e` to observe the real UI.
* Run `TREE_E2E_VISIBLE=1 npm run test:e2e -- <spec>` or `TREE_E2E_VISIBLE=1 npx playwright test <spec>` to observe a single spec with visible windows.
* Prefer these documented command forms. One-off diagnostic environment variables are not pre-approved and must not be added to `opencode.json`.
