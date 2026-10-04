# Renderer AGENTS.md

Layer-specific rules for `src/renderer/` and `src/infrastructure/renderer/`. The root `AGENTS.md` still applies.

## Rules

* React is presentation only. Components dispatch application commands; they never manipulate the document or implement product rules (`docs/ARCHITECTURE.md` §8, §19).
* The renderer owns standard editing commands; intercept the shortcut, prevent the native default, and route through the store (`docs/decisions/0003-renderer-owns-standard-editing-commands.md`).
* Keep DOM and caret mechanics in `editor-dom.ts` and input bindings in `use-node-input-bindings.ts`, which owns the state and delegates handler groups to the `node-input-*`, `vim-session-finish`, `vim-keyboard-state`, `vim-node-visual-commands`, `vim-structural-repeat`, `vim-viewport-motion`, and `caret-projection-rules` modules; do not reimplement them in components.
* Display attachment bytes through the bounded byte cache. Surface image load failures with the approved product message and keep the editor usable.
* The root `ErrorBoundary` is the only render and lifecycle error surface; event and asynchronous errors flow through `EditorStore`.

## Tests

* jsdom tests opt in with `// @vitest-environment jsdom`. Run `npx vitest run src/renderer`.
* Assert observable UI behavior rather than internal component state.
