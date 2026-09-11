# Empty-Node Backspace and Up-to-Parent Navigation

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Implement two new product behaviors in `docs/PRODUCT.md`:

- `Backspace` on a node whose text is empty deletes that node and its subtree, then moves selection according to fixed rules;
- `↑` on the first child moves selection to the editable current parent.

This is domain/application behavior plus a small UI key-dispatch change. It does not change the data model or persistence schema.

## Current State

- `EditorStore.moveSelection` does nothing when the selected node is the first node on a level.
- There is no plain-`Backspace` command for nodes; `Backspace` in a node input is ordinary text editing. `Cmd+Backspace` deletes via `EditorStore.deleteSelected`.
- The renderer key handler in `App.tsx` dispatches commands but does not handle plain `Backspace`.

## Scope and Constraints

In scope:

- a store command for deleting an empty selected node;
- the `↑`-to-parent rule in `moveSelection`;
- UI key dispatch for plain `Backspace` when the node text is empty;
- product documentation and tests.

Out of scope:

- `Cmd+Backspace` behavior, which is unchanged;
- deletion via `Backspace` on the editable current-parent heading, which remains text editing;
- automatic deletion of empty nodes, which remains forbidden.

Constraints:

- Rules belong in the domain/application layer, not in React. The renderer only decides which command to dispatch.
- Deletions are structural and must be undoable, with stable node IDs.
- Caret placement for the new focus targets is specified as end-of-text (previous sibling, current parent) or beginning-of-text (next root).

## Proposed Approach

### Application command

Add `EditorStore.deleteEmptySelected()`:

- no-op if the selected node is the current parent or its text is not empty;
- delete the node and its subtree;
- select the previous sibling at the end of its text, if any;
- otherwise select the current parent at the end of its text, if it exists;
- otherwise select the next root at the beginning of its text, if any;
- otherwise (only root) do nothing.

### Up-to-parent

In `moveSelection`, when direction is `up`, the selected node is index 0, and a current parent exists, select the parent with the caret at the end of its text.

### Renderer

In `App.tsx`, when plain `Backspace` is pressed and the focused node's text is empty, prevent the default and dispatch `deleteEmptySelected`. All other `Backspace` presses remain native text editing.

## Affected Modules

- `src/application/editor-store.ts`: new command and `moveSelection` rule.
- `src/renderer/App.tsx`: `Backspace` dispatch.
- `src/application/editor-store.test.ts`: unit tests for all branches.
- `e2e/empty-node.spec.ts`, `e2e/navigation.spec.ts`: end-to-end coverage.
- `docs/PRODUCT.md`: §2, §4.1, §8.1, §8.2, §19 updated.

## Data Model and Persistence Changes

None. Empty-node deletion reuses `deleteNode`, including subtree and attachment cleanup.

## Testing Strategy

Unit tests:

- previous sibling selection and caret at end;
- current parent selection when there is no previous sibling (first child with siblings, and only child);
- subtree deletion;
- only root stays unchanged;
- first root selects the next root at the beginning;
- non-empty node and current-parent heading are no-ops;
- `↑` from the first child selects the parent at the end;
- `↑` from the first root does nothing.

End-to-end tests:

- delete an empty child and focus the previous sibling;
- delete the empty first child and focus the parent;
- `Backspace` on the only root does nothing;
- delete the empty first root and focus the next root;
- the deletion is undoable;
- `↑` from the first child focuses the parent.

## Documentation Changes

- `docs/PRODUCT.md` (done).

## Risks and Open Questions

- **Ambiguity resolved with the Product Owner:** subtree deletion, parent focus when no previous sibling exists, end-of-text caret, keeping the only root, next-root fallback, and excluding the current-parent heading.
- **Caret after next-root fallback.** Chosen as the beginning of the next root's text because the deleted node preceded it.
- **Undo grouping.** The deletion is structural, so it starts a new history entry as expected.

## Completion Notes

Delivered:

- `EditorStore.deleteEmptySelected` implementing the agreed focus/caret rules, including subtree deletion and undo;
- `↑` from the first child selecting the current parent at the end of its text;
- renderer `Backspace` dispatch when the focused node is empty;
- 9 new application unit tests, 1 new component test, and 6 new end-to-end tests.

`npm run check:full` passes: type checking, linting, 27 unit/component tests, build, and 34 end-to-end tests.

No data model, persistence, or IPC changes.
