Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Single-pass persisted-state validation

## Goal

Remove the redundant full-document traversal and derived node-index build from the save path so that validating a large document does not allocate a node index or read the tree twice.

## Current behavior

`validatePersistedState` (`src/domain/document.ts`) validates the untrusted persisted payload. It first calls `walkNodes` over every node, then calls `isValidLocation`, which calls `locateNode`, which calls `indexInfoFor` and builds `IndexInfo`: a parent map and a sibling-index map covering every node of the freshly received payload. On a large document this is a second full traversal plus two large map allocations per save, and the index is discarded immediately because the payload is a transient structured clone. The main process repeats the renderer's validation on a fresh clone, so nothing is reused. The renderer's `serializeState` also validates, but the live document already has a warm index, so only the main-process path pays the build.

## Proposed changes

In `src/domain/document.ts`:

1. Extend the iterative `walkNodes` traversal to carry each frame's parent id and invoke an optional observer with `(id, parentId)` for every validated node.
2. Rewrite `validatePersistedState` to validate the nodes and resolve the location in that one traversal: while walking, record the selected node's parent and whether the current parent was seen, then apply the same reachability rule as `isValidLocation` (the selected node exists; at the root it is a top-level root; otherwise the current parent exists and is either the selected node or the selected node's parent).
3. Keep `isValidLocation`, `locateNode`, and `assertDocument` unchanged; the live-document path continues to use the warm derived index.

No behavior, persisted schema, IPC payload, or error-message change.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`
- `docs/ARCHITECTURE.md`

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change.
- **CPU:** removes a second full traversal and two O(n) map allocations from every save validation on the main-process path. Validation stays O(n) but with a single pass and no index construction.
- **Memory:** removes the transient O(n) parent and sibling-index maps allocated per save. No retained structure is added.
- **Scaling:** the per-save validation cost no longer contains a second document-sized pass or index allocation, so it grows with document size at half the previous traversal count and without the map overhead.

## Automated performance guards

- **Unit:** a counting-children test asserts that `validatePersistedState` reads each sibling list exactly once; the previous implementation read it again while building the index.
- **Existing:** `document.property.test.ts` compares indexed location resolution against a full-traversal reference; `src/main/ipc-security.test.ts` and `e2e/persistence*.spec.ts` exercise the save boundary.
- `npm run check:full` before commit.

## Testing

- New single-traversal unit guard.
- Existing domain, application, main, renderer, end-to-end, and performance suites stay green.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §13: validation is a single traversal that does not build the derived index.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Location-validity drift.** The inlined reachability rule must match `isValidLocation` exactly. The existing validation tests, location tests, and the property test guard the equivalence.
- **Observer ordering.** The observer runs after id uniqueness is established and before attachment, link, and child parsing; it does not change which error a malformed payload throws.

## Out of scope

- The renderer's `assertDocument` on the live document and the structured-clone cost of the whole-document save, which are inherent to the whole-document persistence design.
