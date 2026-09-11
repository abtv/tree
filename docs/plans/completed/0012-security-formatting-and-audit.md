# Security, Formatting, and Audit Tooling

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Address three gaps raised in the project review:

- add a Content-Security-Policy to the renderer (Electron security hardening);
- add a formatting standard (Prettier + EditorConfig) and enforce it;
- run `npm audit` as part of validation.

## Current State

- `src/renderer/index.html` has no Content-Security-Policy.
- Formatting is only governed by ESLint, which does not cover layout; lines and JSX formatting are inconsistent.
- Dependencies are not checked for known vulnerabilities during validation.

## Scope and Constraints

In scope: the three items above, their configuration, tests, and documentation.

Out of scope: CI, packaging, Dependabot/Renovate (running `npm audit` locally is sufficient for now).

Constraints:

- Formatting choices must match the existing style: no semicolons, single quotes.
- The CSP must not break development (Vite/React Refresh inline scripts) or production (`file://`) rendering, attachments (`blob:`), or inline styles.
- No product behavior changes.

## Proposed Approach

### Formatting

- Add Prettier (`semi: false`, `singleQuote: true`, `printWidth: 120`) and an `.editorconfig`.
- Format the repository once and enforce `prettier --check` in `npm run check`.
- Ignore generated output and Markdown documentation via `.prettierignore`.

### Content-Security-Policy

- Inject a CSP meta tag into the production renderer HTML with a small Vite plugin applied only on build, so development keeps its inline React Refresh preamble.
- Policy: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
- `style-src` allows `'unsafe-inline'` because the renderer uses inline style attributes; `img-src` allows `blob:` for attachment object URLs.

### Audit

- Add an `audit` script (`npm audit`) and run it as the final step of `npm run check`.

## Affected Modules

- `package.json`, new `.prettierrc.json`, `.prettierignore`, `.editorconfig`.
- Repository-wide formatting.
- `electron.vite.config.ts`: CSP plugin.
- `e2e/csp.spec.ts`: policy assertion.
- `docs/DEVELOPMENT.md`: formatting and audit documentation.

## Data Model and Persistence Changes

None.

## Testing Strategy

- Existing unit, component, and end-to-end suites confirm formatting did not change behavior.
- End-to-end: assert the built page contains the expected CSP and that the application still loads and renders attachments.

## Risks and Open Questions

- **CSP and `file://`.** `'self'` behavior under the file protocol must be verified by the end-to-end run; if a directive blocks resources, adjust it.
- **Formatting churn.** The first Prettier pass reformats many files; this is a one-time large diff.
- **Audit network access.** `npm audit` requires registry access; it will fail offline.

## Completion Notes

Delivered as three focused commits:

- Prettier (`semi: false`, `singleQuote: true`, `printWidth: 120`), `.editorconfig`, `.prettierignore`, repository formatting, and `prettier --check` in `npm run check`.
- A production-only CSP meta tag injected at build time, with an end-to-end test asserting the policy and no violations.
- `npm audit` as the final step of `npm run check`, with dependency and formatting notes in `DEVELOPMENT.md`.

`npm run check:full` passes: type checking, linting, formatting check, 93 unit/component tests, build, `npm audit` (0 vulnerabilities), 42 end-to-end tests, and 5 performance scenarios.