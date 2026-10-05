# Struck-Through Nodes in Schema Version 4

Status: Accepted
Date: 2026-10-05

## Context

The Product Owner asked for nodes that can be struck through with `Cmd+Y` (`docs/PRODUCT.md` §2.5) and approved storing that state per node in the document. The persisted document was schema version 3.

Two options were considered for the file format: add an optional node field and keep version 3, or add the field and raise the version to 4. Every application build loads a node by copying only the fields it knows, so a version 3 build that reads a file with the new field accepts it, drops the strikethrough, and writes the document back without it on its next save.

## Decision

A struck-through node carries `struckThrough: true` in `document.json`; a normal node omits the field. The schema version becomes 4, with the version 3 `view` block unchanged. Both validators reject a `struckThrough` that is present but not `true`. Versions 1 to 3 load with no struck-through node and are saved as version 4.

The state is document content, not view state: a toggle is one undoable change through the ordinary history, and it is saved by the pending-change policy rather than immediately.

## Consequences

- An older build rejects a version 4 file as unsupported and falls back to an older generation instead of silently erasing strikethroughs, so downgrading remains unsupported, as it has been since ADR 0017.
- The field rides the existing save, flush, generation, recovery, and failure-lock path; the main process validates it on the untrusted save payload and on every load candidate through the shared domain validator.
- Every domain operation that rebuilds a node must keep the field, and every operation that creates a node must leave it absent; the domain property tests guard both for the generated documents.
