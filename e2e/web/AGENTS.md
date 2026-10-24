# Chrome end-to-end tests

These tests use Playwright Test with `playwright.web.config.ts`, separately from the sibling Electron suite. Root workflow policy and the target-neutral parent instructions apply.

- Use the local `fixtures.mts` test and expect exports. Keep isolated contexts and persistent profiles under fixture ownership, including failure cleanup.
- Use the configured base URL and runner-managed local server. Never use the ordinary browser profile or machine clipboard. Clipboard checks use the headless browser's virtual clipboard only. Take the browser channel from the `channel` option set in `playwright.web.config.ts`; do not hard-code it in specs or fixtures. Use `primaryKey` from `fixtures.mts` for host shortcuts. Press native paste through `pressPaste(page, modifier)`; it supplies the CDP paste command for either profile independently of the host.
- Keep screenshots, traces and profiles in runner-owned output directories. Do not write browser artifacts into source or task scratch directories.
- Declare an editing-mode category on each spec. Browser platform and preference scenarios explicitly exercise their existing standard/Vim transitions; preserve those paths during refactors.
