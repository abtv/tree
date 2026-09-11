# Add End-to-End Tests

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Add automated end-to-end tests that exercise the real Electron application, so that regressions in user-visible behavior and persistence are detected even when unit and component tests still pass.

This plan does not change product behavior, the domain model, the persistence schema, or the technology stack. It adds development/test tooling only.

## Current State

The repository has:

- domain and application unit tests under `src/`, run by Vitest in a Node environment;
- jsdom renderer tests, including `src/renderer/App.test.tsx`, that render the React UI against a fake store;
- no tests that launch Electron, exercise the real preload/IPC boundary, use the real system clipboard, or verify persistence on disk;
- `npm run check` = `typecheck` + `lint` + `test` + `build`.

Because the renderer tests use a fake `EditorServices`, they cannot catch regressions in IPC wiring, the preload bridge, filesystem persistence, attachment files, or the actual application startup path.

## Scope and Constraints

In scope:

- a Playwright-based Electron e2e harness;
- launching the production build from `out/`;
- per-test isolation of the application data directory;
- an initial suite covering the highest-value product behaviors;
- new npm scripts and documentation.

Out of scope:

- changes to `src/` application or product behavior;
- test-only hooks, IPC endpoints, or environment switches added to the shipped app;
- packaging, signing, distribution, and CI configuration;
- testing macOS window activation (`Cmd+0`) by actually backgrounding the OS application.

Constraints:

- Business rules must remain outside React; e2e tests must not create pressure to move logic into components.
- No test hooks may leak into the domain, application, or renderer layers. Isolation is achieved with Electron's `--user-data-dir` switch, not with app branches.
- Playwright must not run the Vitest suite, and Vitest must not run the Playwright suite.
- Playwright browser binaries are not needed; the existing `electron` dependency is the runtime under test.

## Proposed Approach

### Tooling

Use `@playwright/test` with its Electron support (`_electron.launch()`). This is the maintained, first-class way to drive an Electron app, can interact with the renderer and evaluate code in the main process, and avoids a bespoke harness. The decision is recorded in `docs/decisions/0002-e2e-testing-with-playwright.md`.

### Test layout

```text
e2e/
├── fixtures.ts        # shared launch/teardown helpers and selectors
├── initial-state.spec.ts
├── editing.spec.ts
├── navigation.spec.ts
├── deletion.spec.ts
├── history.spec.ts
├── clipboard.spec.ts
├── drag-and-drop.spec.ts
└── persistence.spec.ts
playwright.config.ts
```

### Launch and isolation

- `npm run build` produces `out/main/index.js`; the harness launches that entry point with `_electron.launch({ args: ['.', `--user-data-dir=${tmpDir}`] })`.
- Each test (or worker) gets a fresh temporary `userData` directory, removed on teardown. `src/main/index.ts` already derives `data/` from `app.getPath('userData')`, so persistence and attachments land in the temp directory with no application change.
- The suite is serial and single-worker by default because the global `Cmd+0` shortcut and a single OS application instance make parallel Electron instances unreliable.
- The harness waits for the first window and for the renderer to finish initialization before interacting.

### Selector strategy

Prefer user-facing, already-present semantics: the accessible roles and names used by the existing renderer tests (`textbox` named `Node N`, `Current parent`, `Current location`). Add `data-testid` attributes only where no stable accessible target exists (for example, drop zones between nodes). These are presentation-only attributes and do not move logic into the UI.

### Restart and persistence

- To simulate an application restart, close the Electron app and relaunch it against the same `--user-data-dir`, then assert the document, node IDs, current parent, and selected node were restored.
- Attachment tests assert the attachment file exists in the temp `data/attachments/` directory and still renders after restart.

### Clipboard and images

- Use `electronApp.evaluate(({ clipboard }) => ...)` to write text, multiline text, and a small PNG image to the real OS clipboard before pressing `Cmd+V`.
- Assert multiline paste structure and image precedence (image over text representation) against the rendered UI.

### Drag and drop

- Use Playwright's `locator.dragTo` with a `targetPosition` near the top of the destination row so the drop lands at the intended insertion index, and assert the resulting order.

### macOS window activation

- Not covered in the initial suite. `Cmd+0` is a global shortcut and is unreliable to assert without backgrounding the OS application. It is recorded as deferred work rather than tested.

### Scripts and Vitest/Playwright separation

- Add `test:e2e`: `npm run build && playwright test`.
- Add `check:full`: `npm run check && playwright test`.
- `npm run check` remains the fast, standard pipeline (`typecheck` + `lint` + `test` + `build`).
- Configure Vitest to exclude `e2e/**`, and Playwright `testDir` to `./e2e`, so neither runner picks up the other's files.
- Add a `tsconfig.e2e.json` and `typecheck:e2e` script so the e2e sources are type checked without adding DOM globals to the main-process configuration.

Note: this makes `npm run check` no longer include the complete pipeline, which conflicts with `AGENTS.md` §10 and `docs/DEVELOPMENT.md` §9. The plan therefore updates those documents (pending Product Owner approval) so that `check:full` is defined as the complete validation pipeline and `check` is the standard local loop. Changes that touch the Electron shell, IPC/preload, persistence, attachments, or clipboard must run `check:full`.

## Affected Modules

- New: `e2e/**`, `playwright.config.ts`, `tsconfig.e2e.json`.
- `package.json`: add `@playwright/test` devDependency and the `typecheck:e2e`, `test:e2e`, and `check:full` scripts.
- `vitest.config.ts`: exclude `e2e/**`.
- `eslint.config.mjs`: include the e2e and Playwright config files in the Node globals block and allow the empty destructuring pattern Playwright fixtures require.
- `src/renderer/App.tsx` and `src/renderer/App.test.tsx`: fix the text-edit undo grouping bug found by the new tests (see Completion Notes). This is a presentation-layer interaction fix; it does not move business logic into the UI.

## Data Model and Persistence Changes

None. The suite reuses the existing versioned JSON document and attachment layout inside an isolated `userData` directory.

## Testing Strategy

Unit and component tests remain the primary, fast feedback for domain and application rules. E2E tests are a second layer that verifies integration and persistence end to end. The initial suite covers:

1. **Initial state** (PRODUCT §3): first launch creates one empty root with the cursor in it; launching against an existing document does not overwrite it.
2. **Editing and Enter/split** (PRODUCT §5): split at end, beginning, and middle; image stays with the original node.
3. **Navigation** (PRODUCT §4, §6, §7, §2.2): `↑`/`↓`, `Cmd+.`, `Cmd+,`, breadcrumb navigation, and selection restoration.
4. **Deletion** (PRODUCT §8): sibling selection after delete, returning to the parent, deleting the only root, and deleting the current parent.
5. **Undo/redo** (PRODUCT §10): create, split, delete, reorder, paste, and image operations; stable node IDs across undo/redo.
6. **Clipboard** (PRODUCT §12–§15): plain text, multiline text, image paste, and image precedence over text.
7. **Drag and drop** (PRODUCT §11): sibling reordering only, subtree moves with its node.
8. **Persistence** (PRODUCT §16, §17): document, current parent, and selected node survive a real restart; attachment files are created and cleaned up.

Each spec should assert observable behavior rather than internal implementation, matching the existing test philosophy.

## Documentation Changes

- `docs/DEVELOPMENT.md`: document `test:e2e` and `check:full`, the isolated `userData` strategy, the serial/single-worker constraint, and when `check:full` is required.
- `AGENTS.md` §10: define `check:full` as the complete pipeline, with `check` as the standard loop.
- `docs/decisions/0002-e2e-testing-with-playwright.md`: record the tool choice and its consequences.
- `README.md`: list the new commands alongside the existing ones.

## Risks and Open Questions

- **Flakiness and runtime.** Electron e2e is slower and more timing-sensitive than unit tests. Mitigation: serial execution, wait for renderer readiness, and keep assertions behavior-focused.
- **macOS-only and headful.** Electron needs a display, so e2e cannot run in a headless Linux CI without a virtual display. The repository has no CI today; this is acceptable for now but constrains future automation.
- **`Cmd+0` global shortcut.** Registering a global shortcut during tests can interfere with the developer's machine and is hard to assert, so it is deferred.
- **Selector coupling.** Accessible roles and names cover all current interactions; no `data-testid` attributes were needed.
- **Dependency install cost.** `@playwright/test` would normally download browser binaries on install. `docs/DEVELOPMENT.md` documents `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, since only Electron is under test.

## Definition of Done for This Plan

- The e2e harness, config, and initial specs exist and pass locally.
- `npm run test:e2e` and `npm run check:full` work.
- Vitest and Playwright do not run each other's tests.
- `npm run check` still passes.
- Documentation and ADR are updated.
- The undo-grouping bug found by the suite is fixed, with the fix covered by a component test.

## Completion Notes

The harness, Playwright configuration, `tsconfig.e2e.json`, scripts, and 22 passing end-to-end tests were delivered. Tests cover initial state, Enter/split, navigation and breadcrumbs, deletion, undo/redo, text and image clipboard, drag-and-drop reordering, and persistence across a real Electron restart.

Two findings during implementation:

- **Product bug found and fixed.** Driving the real UI revealed that typing character by character created one undo entry per character. React's `onSelect` fires on every caret `selectionchange`, and `App.tsx` ended the text session on each one, violating PRODUCT §10. The renderer now ends the session only for non-collapsed selections and explicit caret movement (mouse down, left/right/home/end/page keys). The existing unit tests could not catch this because they edit text in one event.
- **Electron 44 clipboard behavior on macOS.** The new W3C-style clipboard API drops a `ClipboardItem` written under `image/png`. Writing the image under the macOS pasteboard type `public.png` makes it available on read as `image/png`, which the application consumes. This is a test-harness detail only; no application code changed.

Deferred: `Cmd+0` global activation coverage.
