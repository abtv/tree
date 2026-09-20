# Parallel E2E Execution with Test-Owned Shortcut and Clipboard Isolation

Status: Accepted
Date: 2026-09-20

## Context

The complete validation command runs the end-to-end suite before every commit. With a single Playwright worker the suite took about 2.3 minutes because each test launches a real Electron application and a few tests intentionally wait on product timing. The unit and performance suites were far smaller, so the end-to-end suite dominated validation time. Hidden windows (`docs/decisions/0011-hidden-e2e-windows.md`) made the suite non-disruptive but not faster.

Three constraints prevented naive parallelization:

- `globalShortcut.register('CommandOrControl+0')` is machine-global, and the application treats a failed registration as a fatal startup error (`src/main/bootstrap.ts`). A second concurrent application therefore cannot open a window.
- Every launch called `cleanupStaleElectronProcesses('tree-e2e-')` before starting, and every launched application carries a `tree-e2e-*` user-data directory. With several workers, one worker's launch would terminate sibling workers' applications.
- The macOS system clipboard is machine-global. Many specs write it and then paste, so interleaved workers would observe each other's clipboard content.

While implementing the change, an additional latent defect surfaced: the suite's `test.afterEach` in `e2e/fixtures.ts` attached only to the first test file's suite. Playwright caches imported helper modules for the lifetime of a worker process, so hook registration inside an imported module happens once per worker, not once per test file. The save-error guard therefore did not run for most files.

## Considered Alternatives

- **Keep the suite serial.** Simple, but leaves the largest validation stage at about 2.3 minutes and leaves the hook defect unaddressed.
- **Shard the suite into multiple Playwright invocations.** Requires an orchestrator, still conflicts on the global shortcut and cleanup marker, and makes `npx playwright test` semantics ambiguous.
- **Virtual per-app clipboard through the test entry.** Fast and deterministic, but most clipboard tests would stop exercising the native pasteboard, which `docs/decisions/0002-e2e-testing-with-playwright.md` exists to cover.
- **`fullyParallel: true`.** Would let tests from one file run on different workers; the shortcut spec must keep its real registration on a single worker.
- **Parallelize the performance suite too.** Rejected: `perf/AGENTS.md` requires serial, visible execution and same-machine baselines.

## Decision

Hidden end-to-end runs execute spec files in parallel across five workers in `playwright.config.ts`; visible runs stay serial because they observe the real desktop UI. `fullyParallel` stays false so a spec file remains on one worker. Playwright's `--workers` option remains the tuning escape hatch for environments, including future CI runners, that need a different concurrency limit.

Worker isolation:

- Each worker uses the user-data prefix `tree-e2e-p<pid>-` and cleans stale processes only through that marker. `e2e/global-setup.ts` removes leftover `tree-e2e-*` applications and a leftover clipboard lock before any worker starts.
- Every launch selects `shortcut: 'real' | 'stub'`. Serial runs default to `real`; parallel runs default to `stub`. `e2e/shortcut.spec.ts` always requests `real`, and every launch asserts the requested mode, so a broken stub or a missing real registration fails loudly. The stub lives in `e2e/shortcut-stub.cjs` and is enabled by the test-owned entry.
- Clipboard helpers and `firePaste` acquire a cross-process lock (`e2e/clipboard-lock.ts`, `tree-e2e-clipboard.lock` in the temporary directory). Specs that make the application touch the clipboard outside those helpers call `lockSystemClipboard()` first. The lock stores a unique acquisition token in an owner file, treats a live owner process as never stale, reclaims a lock whose owner process is gone by renaming its directory to a quarantine name, and is removed by the per-test fixture teardown only while this process still owns it. A lock left behind by a crashed worker is removed by the global setup or reclaimed mid-run.

Per-test teardown — the save-error guard, app cleanup, and clipboard-lock release — lives in the `userDataDir` fixture rather than a module-level hook, because fixture teardown is guaranteed for every test in every file.

## Consequences

- This ADR refines ADR 0002's serial-execution consequence and builds on ADR 0011's hidden-window mode. The rest of both decisions stands.
- The initial three-worker implementation reduced the hidden suite from about 2.3 minutes to about 1.2 minutes on the development machine. Increasing the configured worker count to five reduced three subsequent runs to 58.0–58.9 seconds; `--workers` remains a tuning escape hatch.
- The real global `Cmd+0` registration is covered only by `e2e/shortcut.spec.ts` during parallel runs; every other launch asserts the stub instead. Visible and single-worker runs keep the real registration everywhere.
- The clipboard lock serializes the clipboard-sharing portion of the suite; it is a correctness boundary, not an optimization target. It is best-effort test tooling that prevents normal cross-worker interference and reclaims locks left by crashed workers; it is not a general-purpose mutual-exclusion primitive.
- Two concurrent Playwright invocations remain unsupported and would terminate each other's applications.
- The `.save-error` guard now runs for every test file, which can surface errors that were previously unchecked; a test that intentionally induces one must declare the exact expected message.
- The performance suite stays serial and visible with unchanged baselines.
