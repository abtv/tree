Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Index document nodes for O(depth) lookups

## Goal

Remove the per-lookup full-document traversal from the interactive path by maintaining an in-memory parent index for the current document. After one O(n) index build per topology version, `locateNode` / `requireNode` and everything built on them (`displayedNodes`, `nodePath`, `isValidLocation`, the command transitions, and the store) resolve a node in O(depth + fanout) instead of O(n).

This implements the lookup half of the work deferred in `docs/plans/completed/0033-state-memory-and-persistence-io.md:159` and recorded again in `0034`, `0036`, and `0037`. The persisted document, the domain model shape, and all user-visible behavior stay exactly as they are.

The supported document-scale target is raised from 10,000 to 100,000 nodes by this plan. The performance measures recorded in `0033` covered 10,000 nodes; the guards and baselines below are measured at 100,000.

## Current behavior

- `locateNode(document, id)` (`src/domain/document.ts:88`) walks the whole tree, builds a `Map<TreeNode, TreeNode | null>` of visited nodes, then reconstructs the ancestor chain. Every call is a fresh O(n) traversal with O(n) allocation.
- Interactive paths call it repeatedly on the same document: `EditorStore.editContent` calls `requireNode` before `editNodeContent`, which calls `requireNode` again (`src/application/editor-store.ts:189,200`); render calls `displayedNodes` / `nodePath`; the command transitions call `requireNode` several times (`src/application/editor-command-transitions.ts`, `src/application/editor-clipboard-transitions.ts`).
- Text edits are already path-copying and share unchanged subtrees (`editNodeContent`), so the node objects for a text edit's ancestors change but the parent/child topology does not.
- The domain never mutates an input document (guarded by the property test "does not mutate its input document for any operation", `src/domain/document.property.test.ts:353`). Documents are immutable and node ids are unique.

Measured on this machine with the real domain code (Node 24, 100 roots x 100 children + roots = 10,100 nodes; 316 x 316 = 100,172 nodes):

| Operation | 10,100 nodes | 100,172 nodes |
| --- | --- | --- |
| `locateNode` (mid tree) | ~0.14 ms | ~1.8 ms |
| `cloneDocument` | ~0.18 ms | ~1.8 ms |
| Build a `Map<NodeId, NodeId>` over every node | ~0.38 ms | ~4.5 ms |
| Retained memory of that map | ~0.45 MB | ~2.6 MB |

A single index build costs roughly two to three times one `locateNode`, so it only pays off when reused. Reusing it across text edits and renders is what removes the repeated traversals.

## Proposed changes

### 1. Add a derived parent index

In `src/domain/document.ts`, add:

```ts
export type NodeIndex = ReadonlyMap<NodeId, NodeId | null>

export function buildNodeIndex(document: Document): NodeIndex
```

`buildNodeIndex` performs one iterative walk (same stack style as `collectAttachmentIds`) and maps every node id to its parent id, with `null` for top-level roots. It allocates only the map and its primitive entries; it never appears in the persisted `Document`.

### 2. Memoize the index per document identity

Keep a one-entry memo inside `document.ts`:

```ts
indexFor(document): NodeIndex   // build and cache on identity miss
shareIndex(from, to): void      // reuse the cached index for a topology-preserving result
```

The memo holds the most recent `{ document, index }`. Because documents are immutable, an identity hit can never return an index for a different topology.

Text and other topology-preserving operations transfer the warm index to the document they return, so a typing session and the render that follows pay at most one build for the whole session rather than one per keystroke:

- transfer: `editNodeContent` (and therefore `editNodeText`), `deleteLink`, `removeTextRange`, `attachImage`, `moveSibling`, `pasteText`;
- do not transfer (topology changes): `insertSiblingAfter`, `insertSiblingBefore`, `createFirstChild`, `splitNode`, `deleteNode`, `pasteMultilineText`, `ensureRoot`.

The memo is a transparent cache: it changes no result, and it is not part of the persisted model. It retains one index (O(n) entries, bounded by the measurements above) and never grows with edit count or history depth.

### 3. Rewrite `locateNode` on top of the index

`locateNode(document, id)` uses the memoized index:

1. If the index has no entry for `id`, return `undefined`.
2. Walk parent ids from `id` to a root to get the id path (O(depth)).
3. Descend `document.roots` / `children` along that path, matching ids, collecting `ancestors`, and returning `{ node, parent, siblings, index, ancestors }` with the same shape, ordering, and `undefined` behavior as today (O(depth + fanout)).

`requireNode`, `displayedNodes`, `nodePath`, and `isValidLocation` are unchanged; they inherit the improvement.

### 4. Invalidate the cache after in-place topology changes

Several operations clone the document and then mutate the clone in place (insert, split, delete, multiline paste). `requireNode(next, ...)` populates the cache before that mutation, so those operations call `invalidateIndex(next)` before mutating. The next lookup rebuilds from the mutated document. No public signature changes; `locateNode` and `requireNode` keep their current parameters.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`, `src/domain/document.property.test.ts`
- `src/application/editor-command-transitions.test.ts`, `src/application/editor-clipboard-transitions.test.ts` (only if a behavior assertion needs updating; none expected)
- `perf/state.spec.ts` and/or `perf/typing.spec.ts` (guard)
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`

## Data model and persistence changes

None. `Document` keeps its `{ roots }` shape. The index is derived in memory, never serialized, not part of IPC payloads, not part of history snapshots, and not written to disk. The persisted JSON is byte-for-byte unchanged.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change. No new reads or writes, no schema or file-format change.
- **CPU:** replaces repeated full traversals on typing, navigation, rendering, and command transitions with one O(n) build per topology version, reused across text edits and renders. Subsequent lookups are O(depth + fanout). Structural commands pay one extra index build for the result document because they still clone and then locate (path-copying structural commands remain out of scope). At the current 10,000-node target this roughly doubles a structural command from ~0.46 ms to ~0.94 ms and cuts a typing step from several traversals to one build-at-most plus O(depth) lookups; both stay well inside the interactive budget. The win grows with document size.
- **Memory:** one index retained for the current topology version: measured ~0.45 MB at 10,100 nodes and ~2.6 MB at 100,172 nodes. The memo replaces the entry on each new topology and never accumulates with edit count, history depth, or document count. History snapshots and attachment-reference counting are untouched.
- **Scaling:** index build is O(n) once per topology change; lookups, navigation, and rendering no longer scale with total document size.

## Automated performance guards

- **Unit (deterministic O(depth)):** `document.test.ts` builds a document with an instrumented unrelated subtree, performs a warm lookup, and asserts that the unrelated subtree is not read. This proves a memo hit resolves along the path rather than re-traversing the document.
- **Property:** for arbitrary generated documents, the indexed lookup returns exactly the same normalized location (node, parent, sibling order, index, ancestors) as a full-traversal reference, including absent ids.
- **Property:** the indexed lookup matches the reference for every node after text edits, link edits, inserts, splits, deletes, moves, single- and multiline paste, image attachment, and root creation. This guards both index sharing (topology-preserving) and cache invalidation (topology-changing).
- **Property:** input immutability continues to hold for every operation (existing test) and the index is not observable in serialization (`JSON.parse(JSON.stringify(document))` round-trip unchanged).
- **Unit:** `buildNodeIndex` maps roots to `null` and children to their parent; a node added by a structural operation is locatable; different documents do not share an index.
- **Perf:** `perf/typing.spec.ts` adds a `large-100000` scenario (316 x 316) that selects the last root so the edited node's lookup is worst-case, and asserts a wall-clock typing budget (`typingMs < 1500`) that the pre-change code exceeds. The existing `perf/state.spec.ts` save-policy and cleanup scenarios stay at 10,000, where history and save behavior are sampled.
- `npm run check:full` before commit.

## Measured results

Measured on this machine with the real application and with the real domain code.

- **Domain hot path (chained edits, the app's actual pattern), 100,172 nodes:** editing the last leaf costs **4.38 ms per keystroke** without the index and **0.009 ms** with it (about 500x). Editing the first root was already cheap (0.007 ms vs 0.0007 ms), which is why a first-node benchmark hides the change. The one-time index build at this scale is ~5 ms and amortizes across an editing session.
- **Typing (E2E, `perf/typing.spec.ts`):** the `large-100000` scenario selects the last root (`currentParentId: 'r315', selectedNodeId: 'r315c315'`) so each keystroke's lookup is worst-case. Wall-clock typing of 104 characters measured **2722 ms before** and **~160 ms after** (about 17x). The scenario now asserts `typingMs < 1500`, which fails on the pre-change code. `wide-1000` and `large-10000` are unchanged. The per-keystroke `commit` and `paint` samples do not capture this work: `commit` is sampled before React's handler runs and `paint` is animation-frame-bound.
- **Structural burst (E2E, `perf/state.spec.ts`):** 200 Enters on the 10,000-node seed take ~523 ms with the index versus ~462 ms without, about a 13% increase from the one index build per topology change. It remains far below the 15,000 ms ceiling. Path-copying structural commands would remove this cost and is the follow-up noted below.
- **Domain units:** `locateNode` on a warm index does not read an unrelated subtree, and it matches the full-traversal reference for every node before and after every operation.

## Testing

- Property tests comparing the indexed lookup against the reference traversal for arbitrary valid documents, every node, and absent ids; ancestors/siblings/index must match.
- Unit tests for index transfer (topology-preserving) and rebuild (topology-changing), and for `requireNode` / `displayedNodes` / `nodePath` / `isValidLocation` results.
- The existing location, navigation, editing, history, and persistence suites must keep passing unchanged.
- Existing E2E suites continue to exercise the real behavior; no boundary or product behavior changes, so no new E2E scenario is required.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §5 or §6: lookups use a derived, non-persisted parent index, giving O(depth) lookups; the index never affects the persisted document.
- `docs/DEVELOPMENT.md` §12: the property test and the deterministic O(depth) unit guard.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Correctness of sharing.** Transferring the warm index is only valid when parent/child topology is unchanged. Every operation that adds or removes nodes must not transfer. The property test (indexed path equals reference for every operation) and a per-operation unit test guard this.
- **Hidden module state.** The memo is transparent and identity-keyed, but it is mutable module state inside the otherwise pure domain. It cannot change any result because documents are immutable and ids are unique; the reference-comparison property test is the guard.
- **Fanout.** The descent scans each path level's sibling list, so a very wide level is O(fanout) rather than strictly O(depth). That is never worse than today's `siblings.indexOf` and is a large improvement for normal outline shapes; a pathological flat document stays O(n), the same as the current implementation.
- **Memo thrash.** If callers alternate between many documents, each lookup rebuilds. This only falls back to today's cost and does not affect correctness.

## Resolved decisions

- **Target scale.** The supported target is raised to 100,000 nodes (from the previous 10,000). The new performance baselines are recorded in `docs/DEVELOPMENT.md` §12.

## Out of scope

- Converting structural commands to path-copying so they, too, cost O(depth) instead of cloning. The deferred note bundled this with the index; it is a larger domain refactor and is proposed as a separate follow-up plan guarded by input-immutability and equivalence property tests.
- Changing the `Document` shape, the persisted schema, IPC payloads, or any domain operation signature.
- Persisting the index or sharing it across process or session boundaries.
