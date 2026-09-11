# Domain and Store Property-Based Testing

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Use property-based testing to find bugs in the pure domain and in `EditorStore` command sequences, and to guard the invariants that must hold across all interactions.

## Approach

Add `fast-check` as a development dependency and write property tests that generate random trees, documents, locations, and command sequences, then assert invariants.

Domain invariants (`src/domain/document.property.test.ts`):

- serialize/parse round-trips any valid document and location;
- `splitNode` reconstructs the text and keeps the image and children on the original;
- `pasteText` inserts at the clamped cursor and preserves every other node;
- `pasteMultilineText` inserts the lines and moves the image to the final node;
- `moveSibling` permutes siblings and preserves subtrees and ids;
- `moveSibling` to the current index is a no-op;
- `deleteNode` removes exactly the subtree;
- every node is locatable, has a path ending at itself, and has a valid location;
- duplicate ids and mismatched locations are rejected.

Store invariants (`src/application/editor-store.property.test.ts`):

- after any command (edit, split, delete, delete-empty, move, enter, leave, arrow navigation, ancestor navigation, undo, redo, text paste, multiline paste, image paste), the snapshot is ready, ids are unique, the location is valid, the selected and focused nodes exist, the document is valid, and `serializeState` does not throw.

## Findings

The randomized invariants held for 500 runs of up to 30 commands. Two low-severity edge issues were found by targeted probes and have been fixed:

1. **Deep nesting overflowed the stack at roughly 2,500 levels.** Recursive `parseNodes`, `cloneNode`, `locateInSiblings`, `collectAttachmentIds`, and the renderer's `findNode` were rewritten to iterate. Deep documents (tested to 5,000 levels) now parse, clone, locate, serialize, and path without recursion failures.
2. **Caret offsets could split a surrogate pair.** `splitNode`, `pasteText`, and `pasteMultilineText` now snap the cursor to a code point boundary before slicing, so a position inside a surrogate pair cannot produce lone surrogates.

## Testing Strategy

Property tests run with the unit suite via `npm test`. They are excluded from coverage like other tests.

## Documentation Changes

- `docs/DEVELOPMENT.md` §12 notes that property-based tests use `fast-check`, and requires adding or updating property tests when a change affects domain invariants (tree structure, ordering, node identity, serialization, cursor or paste transforms, or undo/redo consistency).
- `AGENTS.md` §9 carries the same requirement for coding agents.

## Risks and Open Questions

- **Findings resolved.** Both edge issues were deemed worth fixing and are covered by regression tests in `src/domain/document.test.ts` (5,000-level nesting and a surrogate-pair split).
- **Runtime.** 500 runs of up to 30 commands per run complete in well under a second.
