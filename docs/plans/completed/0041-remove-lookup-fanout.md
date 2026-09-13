Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Remove sibling scans from node lookups

## Goal

Make `locateNode` strictly O(depth). Plan 0038 gave lookups a derived parent index, but the descent still scanned each level with `siblings.find` and `siblings.indexOf`, so a wide or flat document stayed O(n) per lookup. Record each node's position within its sibling list during the same O(n) index build and use direct indexing during the descent.

This resolves the fanout risk recorded in `docs/plans/completed/0038-index-document-node-lookups.md:137`.

## Current behavior

- `buildNodeIndex(document)` walks every node once and maps id to parent id.
- `locateNode` walks the parent chain to build the id path, then, for each level, calls `siblings.find(...)` to get the node and `siblings.indexOf(node)` for its index. For a flat document with 100,000 top-level roots, each lookup scans the root list.
- The index is memoized per immutable document object and transferred across topology-preserving operations.

## Proposed changes

In `src/domain/document.ts`:

1. Replace the cached `NodeIndex` with an internal `IndexInfo` holding the parent map and a sibling-index map (`NodeId` to its position in its parent's children, or its position in `document.roots`).
2. Build both maps in one traversal, recording each node's index while pushing its children.
3. Keep the exported `NodeIndex` type and `buildNodeIndex` signature; `buildNodeIndex` returns the parent map from the same build.
4. `locateNode` descends each level with `siblings[siblingIndex]` and returns that index, with a defensive id check. No `find` or `indexOf` remains.
5. `shareIndex` continues to transfer the cached info only for topology-preserving operations; operations that reorder or change siblings do not transfer it, so the sibling indices stay valid.

No behavior, document shape, persisted schema, or IPC payload changes. `LocatedNode` keeps the same fields and values.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`
- `docs/ARCHITECTURE.md`

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change.
- **CPU:** the index build stays O(n) once per topology version. Each warm lookup drops from O(depth + fanout) to O(depth); a flat 100,000-root document drops from a full list scan to a constant number of array accesses. Topology-preserving edits and renders reuse the warm index.
- **Memory:** one additional `Map<NodeId, number>` entry per node alongside the parent entry, on the same non-persisted, per-document memo. At 100,000 nodes this is a small constant factor over the existing parent map and is discarded with the document.
- **Scaling:** lookup cost no longer grows with the width of a level.

## Automated performance guards

- **Unit:** a 1,000-node flat document is wrapped in a proxy that counts numeric element reads; a warm lookup reads exactly one sibling element instead of scanning the level.
- **Property:** the existing "locates every node exactly like a full-traversal reference" properties compare node, parent, sibling order, index, and ancestors after every operation, guarding index and sibling-index correctness.
- **Existing:** the warm-lookup-does-not-read-unrelated-subtree test and the index-sharing/rebuild tests stay green.
- **Perf:** the `wide-1000` typing scenario remains the end-to-end observation.
- `npm run check:full` before commit.

## Measured results

Measured on this machine with the real domain code. On a flat document with 100,000 top-level roots, 1,000 warm lookups took **~0.58 ms** with the sibling index versus **~266 ms** scanning the level with `find` plus `indexOf` — roughly 460× faster. The `wide-1000` typing scenario is unchanged at ~316 ms because the level is narrow enough that Playwright overhead dominates.

## Testing

- New flat-document sibling-access unit test.
- All existing domain, application, renderer, IPC, E2E, and performance suites stay green.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §5: lookups are O(depth) via the parent and sibling indices.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Stale sibling index.** The sibling index is only valid while sibling order is unchanged. Operations that insert, delete, split, paste multiline, or reorder do not transfer the index and rebuild it on the next lookup, while text/link/attachment edits do transfer it. The reference-comparison property test guards every operation.
- **Index correctness.** The defensive id check in the descent turns a corrupt index into an absent result rather than a wrong node; the property test is the primary guard.

## Out of scope

- Incremental (non-rebuild) index updates for structural commands; the plan-0038 tradeoff of one O(n) rebuild per topology change remains.
- Changing the exported `NodeIndex` type, `buildNodeIndex` signature, or `LocatedNode` shape.
