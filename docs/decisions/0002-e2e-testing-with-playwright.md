# End-to-End Testing with Playwright

Status: Accepted
Date: 2026-09-11

## Context

The application is an Electron desktop app. Existing tests run domain and application logic under Vitest and render the React UI in jsdom against a fake service layer. Neither layer exercises the real Electron shell, the preload/IPC boundary, the system clipboard, or the on-disk persistence and attachment layout. Regressions in those integration points can pass all current tests.

We need end-to-end coverage that launches the real application, drives it through the real user interface, and verifies persistence across restarts. The repository currently has no Electron driver and no CI.

## Considered Alternatives

- **Playwright with Electron support.** Maintained, first-class `_electron.launch()` support, can interact with the renderer and evaluate in the main process, works with the existing `electron` dependency, and needs no browser binaries for Electron testing.
- **WebdriverIO with an Electron service.** Viable but introduces a larger, less common harness for this project and more configuration than the problem requires.
- **Vitest with jsdom only.** Already present, but it is component testing, not end-to-end. It structurally cannot catch IPC, preload, filesystem, or attachment regressions.

## Decision

Add `@playwright/test` as a development dependency and use its Electron support for end-to-end tests, located in `e2e/`. The suite launches the production build in `out/` and isolates each run with Electron's `--user-data-dir` switch, so tests exercise real persistence without touching developer data and without adding test hooks to the application.

Because e2e is slower and more timing-sensitive than unit tests, `npm run test:e2e` is a separate command. `npm run check` remains the standard fast pipeline, and `npm run check:full` adds e2e as the complete validation pipeline for changes that touch the Electron shell, IPC/preload, persistence, attachments, or clipboard.

## Consequences

- `package.json` gains a development dependency and two scripts; `vitest.config.ts` must exclude `e2e/**` so the two runners stay separate.
- Browser binary downloads are not required for Electron testing and should be skipped during install.
- E2E tests are macOS-only and headful for now, so they cannot run in a headless CI without a virtual display. This constrains future automation.
- The suite runs serially with a single worker because of the single-instance application and the global `Cmd+0` shortcut.
- `check:full` becomes the meaningful definition of done for integration-sensitive changes, which requires updating `AGENTS.md` and `docs/DEVELOPMENT.md`.
