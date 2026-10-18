# Electron performance

The root and parent `AGENTS.md` apply. This directory owns the serial, visible Electron performance suite and its fixtures.

- Keep per-test teardown in the `userDataDir` fixture. A module-level `test.afterEach` can attach only to the first importing suite because Playwright caches helper modules.
- Keep the existing Electron launcher and fixture-owned process cleanup.
