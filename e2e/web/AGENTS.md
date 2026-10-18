# Chrome end-to-end tests

These tests use Playwright Test with `playwright.web.config.ts`, separately from the Electron suite in the parent directory. Root workflow policy applies. Parent rules about Electron launch, application fixtures, native clipboard locking, and Electron editing-mode parameterization apply only to Electron tests.

- Use the local `fixtures.mjs` test and expect exports. Keep isolated contexts and persistent profiles under fixture ownership, including failure cleanup.
- Use the configured base URL and runner-managed local server. Never use the ordinary browser profile or machine clipboard. Clipboard checks use headless Chrome's virtual clipboard only.
- Keep screenshots, traces and profiles in runner-owned output directories. Do not write browser artifacts into source or task scratch directories.
- Declare an editing-mode category on each spec. Browser platform and preference scenarios explicitly exercise their existing standard/Vim transitions; preserve those paths during refactors.
