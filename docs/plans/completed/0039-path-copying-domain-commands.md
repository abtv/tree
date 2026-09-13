Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Path-copying for editing and structural domain commands

## Goal

Remove the last full-document deep copies from the domain mutation path. Every domain operation should copy only the nodes along the path from the root to the edited node plus the affected sibling array, and share every unaffected subtree by reference with its input. This is the deferred follow-up recorded in `docs/plans/completed/0033-state-memory-and-persistence-io.md:93` and `docs/plans/completed/0038-index-document-node-lookups.md:146`.

The persisted document, the domain model shape, every domain operation signature, and all user-visible behavior stay exactly as they are. This is an internal representation change guarded by property tests.

## Current behavior

`editNodeContent` already rebuilds only the ancestor chain. The remaining operations deep-copy the whole document with `cloneDocument` and then mutate the clone in place:

- single-node edits: `deleteLink`, `removeTextRange`, `pasteText`, `attachImage`;
- structural commands: `insertSiblingAfter`, `insertSiblingBefore`, `createFirstChild`, `splitNode`, `deleteNode`, `moveSibling`, `pasteMultilineText`;
- `ensureRoot` clones an unchanged document when a root already exists.

At the supported 100,000-node target a `cloneDocument` costs about 1.8 ms (recorded in plan 0038), so each of these commands allocates and copies the entire document even though it changes one path. Structural history snapshots also stop sharing unchanged subtrees, so retained memory grows with the full document per structural entry rather than the changed path.

The domain never mutates an input document (guarded by `document.property.test.ts`), node ids are unique, and links/attachments are already treated as immutable value objects, so sharing structural subtrees between documents is safe.

## Proposed changes

### 1. Add a path-copying helper

In `src/domain/document.ts`:

```ts
function copyToRoot(document: Document, located: LocatedNode, nextSiblings: TreeNode[]): Document
function replaceNode(document: Document, located: LocatedNode, replacement: TreeNode): Document
```

`copyToRoot` rebuilds the chain from the direct parent (or the root list) to the top-level root, replacing the affected sibling array and copying each ancestor with a shallow copy. `replaceNode` is `copyToRoot` with the located node replaced by a supplied node and the remaining siblings shared.

`editNodeContent` is re-expressed with `replaceNode`; its result is unchanged.

### 2. Reimplement the remaining operations on the helper

- Topology-preserving (`deleteLink`, `removeTextRange`, `pasteText`, `attachImage`, `editNodeContent`) build a replacement node and call `replaceNode`, then transfer the warm index with `shareIndex`.
- Topology-changing (`insertSiblingAfter`, `insertSiblingBefore`, `createFirstChild`, `splitNode`, `deleteNode`, `moveSibling`, `pasteMultilineText`) build a new sibling array and call `copyToRoot`. They do not transfer the index, so the next lookup rebuilds it, exactly as the current `invalidateIndex` sequence intended.
- `ensureRoot` returns its input unchanged when a root already exists instead of cloning it, since callers pass an already-fresh document.

`setLinks` continues to mutate only the freshly built replacement node, never a shared node.

### 3. Keep the derived index correct

The per-document index memo is unchanged. Topology-preserving results share the warm index; topology-changing results simply do not, so the existing `locateNode`/`requireNode` behavior and the plan-0038 property tests keep passing.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`, `src/domain/document.property.test.ts`
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`
- `perf/state.spec.ts`, `perf/typing.spec.ts` (measured baseline refresh only; ceilings remain valid)

No application, renderer, main-process, IPC, or persistence code changes.

## Data model and persistence changes

None. `Document` keeps its `{ roots }` shape. No field, schema, IPC payload, or file-format change. The objects returned by every operation are structurally identical to before; the only difference is which sub-objects are shared by reference.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change. No new reads or writes and no schema change.
- **CPU:** every structural command drops from O(n) copy-and-mutate to O(depth + fanout) path copy. Single-node edits (`pasteText`, `attachImage`, `deleteLink`, `removeTextRange`) also stop deep-copying sibling subtrees. At 100,000 nodes each command saves roughly one full-document copy (~1.8 ms) and allocates only the path nodes.
- **Memory:** retained history states share unaffected subtrees instead of holding an independent full copy per structural entry. Structural growth is bounded by the changed path per command rather than by document size, and the 200-entry history cap is unchanged.
- **Scaling:** per-command allocation no longer scales with total document size; it scales with the edited path.

## Automated performance guards

- **Property (path sharing):** for arbitrary documents, every operation shares each subtree that is not on the edited path by reference with its input, proving no operation silently falls back to a full clone.
- **Property (equivalence and immutability):** the existing "does not mutate its input document" and "locates every node exactly like the full-traversal reference after any operation" properties continue to pass unchanged.
- **Unit:** structural operations on a multi-root document leave the untouched roots reference-identical; text edits and index sharing are unchanged.
- **Perf:** the existing structural-burst and typing scenarios in `perf/state.spec.ts` and `perf/typing.spec.ts` remain valid ceilings; the measured structural burst should improve and will be re-recorded in `docs/DEVELOPMENT.md` §12.
- `npm run check:full` before commit.

## Measured results

Measured on this machine with the real domain code (316 × 316 = 100,172 nodes):

| Operation | Before (full clone) | After (path copy) |
| --- | --- | --- |
| `insertSiblingAfter` (deep leaf) | ~2.66 ms | ~0.038 ms |
| `deleteNode` (deep leaf) | ~2.66 ms | ~0.0044 ms |

The end-to-end structural burst in `perf/state.spec.ts` (200 Enters on the 10,000-node seed) dropped from ~523 ms in plan 0038 to ~416 ms here; the remainder is Playwright key-event overhead. The `large-100000` typing scenario stays at ~167 ms. All performance ceilings remain valid.

## Testing

- Property tests for path sharing after every operation (edit, link delete, range delete, insert, split, delete, move, single/multiline paste, image attach, root ensure).
- Unit tests covering the deterministic sharing cases and a nested path rebuild.
- All existing domain, application, renderer, IPC, E2E, and performance suites stay green.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §5/§11: domain operations path-copy and share unchanged subtrees; history retains those shared snapshots by reference.
- `docs/DEVELOPMENT.md` §12: document the path-sharing property guard and refresh the structural-burst observation.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Accidental in-place mutation of a shared node.** `setLinks` and `delete node.attachment` must only touch freshly built nodes. The input-immutability property test and the path-sharing property test are the guard.
- **Stale index transfer.** Topology-changing operations must not transfer the warm index. The plan-0038 index-sharing/rebuild properties compare the indexed lookup against a full traversal after every operation.
- **Sharing value objects.** Unchanged `links`/`attachment` arrays are shared between documents. The code never mutates them in place; a future in-place mutation would violate the immutability invariant already enforced by tests.

## Out of scope

- Persisting, caching, or sharing the derived node index across processes or sessions.
- Changing any domain operation signature, the persisted schema, or IPC payloads.
- Incremental attachment reference tracking for the live document.
- Renderer or main-process attachment byte caching.
