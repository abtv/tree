Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Renderer robustness hardening

## Goal

Remove a test-only DOM shim from production renderer code and add a React error boundary so an unexpected render error shows a recoverable fallback instead of a blank window.

## Current behavior

- `src/renderer/use-node-input-bindings.ts` defines `value` and `setSelectionRange` on the contenteditable node element so form-oriented test helpers can treat it like a textarea. This is test convenience leaking into production DOM.
- The renderer has no error boundary. An error thrown during render or a React lifecycle unwinds the tree and leaves an empty `#root`.
- E2E helpers `setCursor` and `nodeTexts` in `e2e/fixtures.ts` assume a textarea and currently rely on the shim for linked (contenteditable) nodes.

## Proposed changes

- Remove the `Object.defineProperty` shim from `setInput`; only register the element.
- Delete the obsolete unit test that asserts the shim.
- Update E2E `setCursor` to place the caret with a DOM `Range`/`Selection` when the target is not a textarea, and `nodeTexts` to read `textContent` for non-textareas. These helpers already use DOM selection for linked-node caret assertions elsewhere.
- Add `src/renderer/ErrorBoundary.tsx`, a class component that catches render/lifecycle errors, reports them through the existing visible error surface (console error for diagnostics), and shows a fallback with a `Reload` button that reloads the renderer window.
- Wire the boundary around `App` in `src/renderer/main.tsx`.
- Document the fallback in `docs/PRODUCT.md` and the boundary in `docs/ARCHITECTURE.md`.

## Affected modules

- `src/renderer/use-node-input-bindings.ts`
- `src/renderer/use-node-input-bindings.test.tsx`
- `src/renderer/ErrorBoundary.tsx` (new)
- `src/renderer/ErrorBoundary.test.tsx` (new)
- `src/renderer/main.tsx`
- `e2e/fixtures.ts`
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`

## Out of scope

- Catching errors thrown in event handlers or async work; those continue to flow through `EditorStore.reportError` and the existing operation-error UI.
- Changing persistence, the document model, or the quit handshake.
- Automatic recovery or retry; recovery is an explicit user action.

## Testing

- Remove the shim test and add `ErrorBoundary.test.tsx` covering the fallback render and the reload action.
- Keep the affected renderer/E2E behavior covered: linked-node caret placement through the E2E helpers, and the error fallback through a component test.
- Run `npm run check` and `npm run check:full`.

## Risks

- Removing the shim changes how linked nodes behave under unit/e2e test helpers; the helper updates keep the real DOM contract faithful rather than masking it.
- A reload discards in-memory changes that were queued but not yet persisted, which is the same loss a crashed renderer would already cause.

## Result

- Removed the `Object.defineProperty` `value`/`setSelectionRange` shim from `use-node-input-bindings.ts` and deleted the unit test that asserted it.
- Made the E2E `setCursor` helper place the caret with a DOM range for contenteditable nodes and `nodeTexts` read `textContent` for non-textareas.
- Added `src/renderer/ErrorBoundary.tsx` with a fallback that shows the error and a `Reload` action, plus `ErrorBoundary.test.tsx` covering the pass-through, fallback, diagnostic logging, and reload action. Wired it around `App` in `main.tsx`.
- Documented the fallback in `docs/PRODUCT.md` §21 and the boundary in `docs/ARCHITECTURE.md` §8.
- `npm run check` passes: 281 unit/component tests and all coverage floors. `npm run check:full` passes, including 88 Electron E2E tests and 5 performance tests. The first full E2E run had one mouse-selection flake (`visually marks a hyperlink when node content is selected with the mouse`) that passed in isolation and on the complete rerun; it is unrelated to these changes.
