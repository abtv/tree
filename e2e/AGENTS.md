# End-to-End tests

The root `AGENTS.md` applies to both targets. Read the target's nested instructions before changing its tests or helpers.

- `electron/` owns Electron tests, launch fixtures, process controls and screenshot baselines. Use `playwright.config.ts` and `config/testing/playwright.memory.config.ts`.
- `web/` owns Chrome tests and browser fixtures. Use `config/testing/playwright.web.config.ts`.
- Keep target-specific helpers inside their target directory. Put a helper at this level only when both targets use it.
- Preserve target isolation, test coverage and synthetic test data when reorganizing files.
