Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Lift weak UI branch coverage

## Goal

Raise renderer branch coverage for the UI adapters that carry real interactive behavior but currently have thin unit coverage, without changing product behavior or architecture.

## Current evidence

- `npm run test:coverage` reports renderer branch coverage of 76.87%, below the rest of the codebase.
- `src/renderer/AttachmentPreview.tsx` has 47.5% branch coverage and no dedicated test file; modal focus trapping, focus restoration, image-load failure, and object-URL cleanup are exercised only indirectly through `App` tests.
- `src/renderer/editor-dom.ts` has 70.78% branch coverage; nested non-anchor reads, caret-prefix offset calculation through nested elements, and null-selection fallbacks are unexercised.
- `src/renderer/use-node-input-bindings.ts` has 66.66% branch coverage; the contenteditable `value`/`setSelectionRange` shims, `onContentChange`, and the `onSelect` textarea/collapsed branches are unexercised.
- `src/renderer/editor-input-handlers.ts` has uncovered `Cmd+0` and horizontal/boundary key fallbacks.
- `src/renderer/App.tsx` has an unexercised `saveError` branch, and `NodeList` row-drop geometry has an unexercised branch.

## Scope

- Add focused jsdom unit tests for `AttachmentImage` and `ImagePreview`: successful image rendering, missing bytes, failed reads, object-URL revocation, Escape/Tab focus trapping, focus outside the dialog, and focus restoration.
- Extend `editor-dom.test.ts` for nested element reads and caret-prefix offsets.
- Add a `use-node-input-bindings` hook test for the DOM-compatibility accessors and selection/content event branches.
- Extend `editor-input-handlers.test.ts` for `Cmd+0` and boundary-key fallbacks.
- Add `App` save-error coverage and a `NodeList` row-drop geometry unit test.
- Re-measure coverage and record the new renderer baseline.

## Out of scope

- Changing coverage thresholds.
- Changing production behavior, persistence, or architecture.
- Adding tests solely to raise the global statement/line numbers; each test asserts observable UI behavior or a boundary fallback.

## Validation

- Run `npm run test:coverage` and confirm the renderer branch coverage improves and every configured floor still passes.
- Run `npm run check`.
- Run `npm run check:full` on supported macOS hardware with a display.
- Review the final diff and confirm no product or architectural change.

## Result

Added `AttachmentPreview.test.tsx`, `use-node-input-bindings.test.tsx`, and `NodeList.test.tsx`, and extended `editor-dom.test.ts`, `editor-input-handlers.test.ts`, and `App.test.tsx`. The tests exercise image-load success, missing bytes, failed reads, object-URL revocation, modal focus trapping and restoration, nested editable-content reads, caret-prefix offsets through nested elements, no-selection fallbacks, contenteditable DOM shims, content-change and selection-session branches, `Cmd+0`, boundary-key fallbacks, row-drop geometry, and the visible save-error state.

Renderer branch coverage rose from 76.87% to 93.48% (statements 88.17% to 98.81%, functions 86.17% to 94.68%, lines 90.52% to 100%). `AttachmentPreview.tsx` went from 47.5% to 87.5% branches, `editor-dom.ts` from 70.78% to 86.51%, `editor-input-handlers.ts` from 89.13% to 98.91%, and `use-node-input-bindings.ts` from 66.66% to 94.44%. Overall coverage rose to 96.31% statements, 90.12% branches, 95.78% functions, and 97.97% lines. Remaining uncovered renderer branches are defensive guards that are not reachable through the public component API.

The unit suite grew from 255 to 279 tests. `npm run check:full` passes: type checking, linting, formatting, the coverage-enabled unit suite, the production build, a zero-vulnerability dependency audit, 88 Electron E2E tests, and 5 performance tests. No production behavior, persistence, architecture, or coverage threshold changed.
