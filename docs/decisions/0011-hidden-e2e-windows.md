# Hidden E2E Windows with a Visibility Escape Hatch

Status: Accepted
Date: 2026-09-20

## Context

The end-to-end suite launches the real Electron application for every test. Application windows appeared on the developer's desktop and stole focus, which made the suite disruptive to run and prevented parallel work. Playwright's Electron driver can drive a `show: false` window, and Playwright's Electron loader already appends the Chromium switches that keep timers and rendering unthrottled, so a hidden window still renders, accepts synthetic input, and stays screenshot-capable.

`require('electron').BrowserWindow` is a non-configurable, getter-only export, so it cannot be replaced by assignment or `Object.defineProperty`. The application creates its window with no `show` option, and ADR 0002 decided the suite would run without adding test hooks to the application. A visibility override therefore has to live in the test-owned entry that loads the application bundle.

## Considered Alternatives

- **Application environment flag** (`show: process.env['TREE_E2E_HIDDEN'] !== '1'` in `createMainWindow`): simple and robust, but it adds a test-only branch to production bootstrapping and contradicts ADR 0002's no-test-hooks decision. The Product Owner rejected it in favor of the test-owned entry.
- **Hide after launch** (`BrowserWindow.hide()` from the fixture): the window is already shown and has stolen focus by the time test code runs.
- **Subclass `BrowserWindow`**: an ES class subclass constructs a working hidden window, but its instances are not returned by `BrowserWindow.getAllWindows()`, which the fixtures use to address the application window for close, resize, and bounds reads.
- **Chromium headless switches**: Electron does not support headless `BrowserWindow`s on macOS, and the suite is macOS-only.

## Decision

`npm run test:e2e` launches hidden application windows by default. `e2e/fixtures.ts` resolves the selected mode and always passes it explicitly to the test-owned entry, which calls `enableHiddenWindows()` from `e2e/hidden-windows.cjs` before loading `out/main/index.js`. That module patches `Module._load` so the application bundle's `require('electron')` receives a memoized `Proxy` whose `BrowserWindow` property is a function wrapper forcing `show: false`. A function wrapper, not a subclass, preserves `getAllWindows`, `fromWebContents`, and `instanceof`.

Every launch asserts the selected mode and fails with an actionable message when the override stops applying, so an Electron or Node upgrade that invalidates the interception fails on the first launch instead of silently showing windows during a hidden run. `TREE_E2E_VISIBLE=1` runs the suite with visible windows for observing the real UI, including the product verification of native macOS surfaces owned by `docs/DEVELOPMENT.md` §8.

The performance suite deliberately keeps visible windows because its typing scenarios measure paint latency for a presented window, and its same-machine baselines are recorded that way. Its fixtures pass the visible mode explicitly so an ambient e2e setting cannot change what perf measures.

## Consequences

- This ADR refines the "headful" consequence of ADR 0002. The rest of ADR 0002 stands.
- The e2e suite still requires a macOS GUI session and a display; hidden mode does not make it headless or portable to a display-less CI.
- The `Module._load` interception depends on Node and Electron module-loading behavior. The per-launch assertion makes breakage fail loudly on the first launch, and the fallback is the application environment flag, which would need Product Owner approval.
- Hidden runs cannot observe real window activation, focusing, menu-bar behavior, or the native context-menu popup. Visible runs remain the path for those checks. The fixtures already avoid `getFocusedWindow()` for correctness.
- Window geometry, close-flush, quit, clipboard, drag, and persistence tests still exercise the real boundaries, because the window exists and renders; only its presentation changes.
- Performance baselines remain comparable because the performance suite stays visible.
