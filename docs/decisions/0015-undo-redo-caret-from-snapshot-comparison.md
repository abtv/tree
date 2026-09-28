# Undo/Redo Caret From Snapshot Comparison

Status: Accepted
Date: 2026-09-28

## Context

Undo and redo published a focus intent with the cursor hardcoded to `0`, so the caret jumped to the
beginning of the node. `docs/PRODUCT.md` §10 specified that behavior, and the Vim conformance
inventory recorded cursor `0` as the expected result, so the implementation, its tests, and the
documentation agreed with each other while diverging from Vim. Vim leaves the caret at the change
that undo or redo applied. The Product Owner authorized matching Vim, for `u` and `Ctrl+r` and for
the `Cmd+Z` and `Cmd+Shift+Z` application shortcuts alike.

Knowing where a change starts requires knowing what changed. Two options were available.

The first records a caret in each history entry. The history would learn the caret at `begin`, and
`undo`/`redo` would replay it. But the store's mutating commands do not all carry a caret:
`editText` and `replaceTextRanges` receive only text, and a text-editing session spans many
keystrokes before it becomes one entry. Every mutating call site in the renderer and the application
layer would have to supply and thread a position that most of them do not otherwise need.

The second derives the change from the two document snapshots the history already holds.

## Decision

Undo and redo derive the caret by comparing the outgoing document with the restored one, in
`editor-undo-focus.ts`. The comparison walks both trees together and reports the first difference:
the first differing character for a text change, the node's terminal image character for an
attachment change, and the node the resulting document now shows at the first position whose
occupant differs for a structural change. `EditorStore` publishes that as the focus and, so the
change is displayed, as the location.

`EditorHistory` stays a pure document store, and no mutating command changes.

This relies on the structural-sharing invariant in `docs/ARCHITECTURE.md` §11: every command
path-copies only the nodes from a root to the affected sibling array and shares every other subtree
by reference. Reference equality therefore prunes unchanged subtrees in constant time, and the
comparison visits only the changed path. A reallocated node is still compared by value, because a
whole-node Visual case command rebuilds every selected subtree whether or not its text changes.

ADR 0013 made the opposite choice for hyperlink offsets, rejecting a diff in favor of caller-supplied
positions. The difference is what a wrong answer costs. A misattributed link offset silently drops a
link from the document; a caret one node away from the ideal spot is visible and immediately
correctable by the user. Paying ADR 0013's plumbing cost again, at every mutating call site, was not
worth that.

## Consequences

- Undo and redo leave the caret on the change, and reach it even when the caret moved away first.
- Undo and redo may select a different node and change the current parent, which `docs/PRODUCT.md`
  §10 now states. A change site that is the node the user is currently inside stays the current
  parent heading rather than re-leveling.
- A snapshot comparison is symmetric while the edit that produced it was not, so two cases are
  deliberately approximate. Redoing a split or a multiline paste lands on the modified original node
  at the text offset rather than on the newly created node, because the diff cannot tell which side
  of a split was new. A reorder resolves positionally, so the caret lands at or beside the moved
  node rather than necessarily on it. Both are single keystrokes away from the ideal position, and
  neither is a silent data outcome.
- Redo does not always reproduce the caret its forward command left. One rule resolves every
  removal, so a redo lands on the node that takes the vacated position. That matches the forward
  command for `dd` and for whole-node Visual deletion, but not for Backspace on an empty node, whose
  forward caret moves to the end of the previous sibling so typing can continue there. Nothing about
  that previous sibling changes in the document, so it is not where the change is. Inverting the
  order to suit that one command would misplace the far more common `dd`.
- A future move from snapshot history to command/inverse-operation history would make the change
  site directly available and could retire the comparison.
