# End-to-End tests

The root `AGENTS.md` applies to both targets. Read the target's nested instructions before changing its tests or helpers.

- `electron/` owns Electron tests, launch fixtures, process controls and screenshot baselines. Use `config/testing/playwright.config.ts` and `config/testing/playwright.memory.config.ts`.
- `web/` owns Chrome tests and browser fixtures. Use `config/testing/playwright.web.config.ts`.
- `smoke/` owns the Playwright smoke scenario for the Electron and Chromium smoke commands. Use `config/testing/playwright.smoke.config.ts`; `config/testing/playwright.smoke-electron.config.ts` extends it for Electron. `docs/DEVELOPMENT.md` §9 describes the smoke checks.
- Keep target-specific helpers inside their target directory. Put a helper at this level only when both targets use it.
- Preserve target isolation, test coverage and synthetic test data when reorganizing files.
