# Behavior-to-Test Coverage Requirement and Audit

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Make behavior coverage an explicit part of the development workflow, and audit the current tests against `docs/PRODUCT.md` so that every user-visible behavior has coverage at the appropriate level.

## Workflow Change

- `AGENTS.md` §9 now requires that every user-visible behavior in `docs/PRODUCT.md` has at least one automated test, and that boundary behaviors (Electron shell, preload/IPC, persistence, attachments, clipboard, drag-and-drop, global shortcuts) also have an end-to-end test. Coverage percentages are a gap-finder, not a target.
- `AGENTS.md` §13 completion criteria now include behavior coverage and `npm run check:full` for integration-sensitive changes.
- `docs/DEVELOPMENT.md` §12 now states the same requirement and explicitly says coverage numbers are not a target.

There is no separate matrix file. The mapping is re-checked whenever behavior changes.

## Audit

Each `docs/PRODUCT.md` section mapped to the levels that currently cover it.

| Requirement | Unit / component | End-to-end | Status |
| --- | --- | --- | --- |
| §2 tree model | `document.test.ts` | `navigation.spec.ts` | Covered |
| §2.1 node presentation | `App.test.tsx` (disclosure) | implicit | Covered; visual styling intentionally not asserted |
| §2.2 location path | `App.test.tsx` | `navigation.spec.ts` | Covered |
| §3 initial state | `editor-store.test.ts` | `initial-state.spec.ts` | Covered |
| §4.1 up | `editor-store.test.ts` | `navigation.spec.ts` | Covered |
| §4.2 down | `editor-store.test.ts` | `navigation.spec.ts` | Covered |
| §5.1 Enter split | `document.test.ts` (image on original) | `editing.spec.ts` | Covered |
| §6 enter / Cmd+. | partial | `navigation.spec.ts` | Gap: entering a node with children selects the first child at the beginning is not asserted |
| §7 leave / Cmd+, | — | `navigation.spec.ts` | Covered |
| §8.1 Cmd+Backspace | `editor-store.test.ts` | `deletion.spec.ts` | Covered |
| §8.2 Backspace empty | `editor-store.test.ts` | `empty-node.spec.ts` | Covered |
| §9 Cmd+0 | `window.test.ts` | — | Gap: global shortcut registration and state preservation are not wired end to end |
| §10 undo/redo | partial | `history.spec.ts` | Gap: sibling reorder, multiline paste, subtree deletion, and image-containing deletion are not unit tested |
| §11 drag and drop | `document.test.ts` | `drag-and-drop.spec.ts` | Covered |
| §12 clipboard | `clipboard.test.ts` | `clipboard.spec.ts` | Covered |
| §13 plain paste | `editor-store.test.ts` | `clipboard.spec.ts` | Covered |
| §14 multiline paste | `editor-store.test.ts`, `document.test.ts` | `clipboard.spec.ts` | Covered |
| §15 image paste | `editor-store.test.ts` | `clipboard.spec.ts` | Covered |
| §16 persistence | `file-services.test.ts` | `persistence.spec.ts` | Covered |
| §17 attachments | `file-services.test.ts` | `persistence.spec.ts` | Gap: attachment file cleanup after deleting the referencing node is not observed across restart |
| §17.1 preview | `App.test.tsx` | `preview.spec.ts` | Covered |
| §18 node identity | `document.test.ts` | `history.spec.ts`, `persistence.spec.ts` | Covered |
| §19 empty nodes | `editor-store.test.ts` | `empty-node.spec.ts` | Covered |
| §20 interaction principles | — | — | Descriptive, not directly testable |

## Planned Fixes

1. Unit: entering a node with children selects the first child at the beginning.
2. Unit: entering the already-selected current parent is a no-op.
3. Unit: undo restores sibling order after reordering.
4. Unit: undo restores the document after multiline paste.
5. Unit: undo restores a deleted subtree.
6. Unit: undo restores an image-containing deletion.
7. End-to-end: `Cmd+0` is registered as a global shortcut and does not change document, selection, or current parent.
8. End-to-end: deleting a node and restarting removes the now-unreferenced attachment file.

## Testing Strategy

Unit tests live in `src/application/editor-store.test.ts`. End-to-end tests extend `e2e/` (a new `shortcut.spec.ts` and an addition to `persistence.spec.ts`).

## Documentation Changes

- `AGENTS.md` §9 and §13 (done).
- `docs/DEVELOPMENT.md` §12 (done).

## Risks and Open Questions

- **`Cmd+0` end-to-end.** The OS activation itself cannot be asserted without backgrounding the application; the test asserts registration and state preservation only.
- **Attachment cleanup timing.** Cleanup retains files reachable through undo/redo, so removal is observed after restart, when runtime history is empty.
- **Intentional non-coverage.** Purely visual styling and descriptive principles are not asserted.

## Completion Notes

All eight planned fixes were implemented:

- unit: entering a node selects its first child at the beginning;
- unit: entering the already-selected current parent is a no-op;
- unit: undo restores sibling order, the document after multiline paste, a deleted subtree, and an image-containing deletion;
- end-to-end: `Cmd+0` is globally registered and does not change the document or selection (`e2e/shortcut.spec.ts`);
- end-to-end: an unreferenced attachment file is removed after deleting its node and restarting (`e2e/persistence.spec.ts`).

`npm run check:full` passes: type checking, linting, 64 unit/component tests, build, and 36 end-to-end tests.

`src/application/editor-store.ts` coverage is now 96.35% statements / 86.23% branches. The remaining uncovered lines are defensive throws, mid-await selection races, and cleanup-failure handling, which are not product logic.
