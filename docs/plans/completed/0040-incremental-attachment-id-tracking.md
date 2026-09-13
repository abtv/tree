Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Incremental attachment-id tracking for the live document

## Goal

Remove the last full-document traversal from the command path. `EditorHistory.begin` currently calls `collectAttachmentIds` once per retained snapshot, which traverses every node of the live document even though path-copying (plan 0039) made the structural change itself O(depth). Track each document's attachment-id set as derived, non-persisted metadata that is propagated in O(1) by the domain operation that produced the document.

This implements the deferred item recorded in `docs/plans/completed/0033-state-memory-and-persistence-io.md:158` and `docs/plans/completed/0035-bound-renderer-attachment-reference-scan.md:95`.

## Current behavior

- `collectAttachmentIds(document)` (`src/domain/document.ts`) walks every node and returns the attachment ids.
- The history retains a snapshot by reference and stores its attachment-id set (`src/application/editor-history.ts:26-33`). Every `begin` — that is, every structural command and every new text-editing session — traverses the whole document once.
- `EditorStore.referencedAttachmentIds` also calls `collectAttachmentIds` on the live document for cleanup.
- Documents are immutable and path-copied, so the attachment-id set of a result is a small, known function of the input set and the operation's local change.

At 100,000 nodes the traversal costs roughly 1–2 ms; a 200-command structural burst pays it 200 times. It is the only remaining O(n) work on the command path.

## Proposed changes

In `src/domain/document.ts`:

1. Keep a module-private `WeakMap<Document, ReadonlySet<AttachmentId>>` of derived attachment-id sets. It is keyed by document identity, holds small sets, never leaks (weak keys), and is never serialized.
2. `collectAttachmentIds(document)` returns a fresh copy of the cached set, computing and caching it on first use. The public result type and behavior are unchanged (callers receive their own `Set`).
3. Add private helpers `inheritAttachmentIds(from, to)`, `addAttachmentId(from, to, id)`, and `removeAttachmentIds(from, to, ids)`.
4. Each document-producing operation records its result's set:
   - unchanged set: `ensureRoot` (returns the input), `editNodeContent`/`editNodeText`, `deleteLink`, `removeTextRange`, `insertSiblingBefore`, `createFirstChild`, `splitNode`, `moveSibling`, `pasteText`, `pasteMultilineText`;
   - add one id: `insertSiblingAfter` with an attachment, `attachImage` when the node had no attachment;
   - remove the deleted subtree's ids: `deleteNode`;
   - `createInitialDocument` caches the empty set;
   - `attachImage` overwriting an existing attachment does not populate the cache, so the correct set is computed lazily (the app only attaches to image-less nodes).
   - `cloneDocument` and `parsePersistedState` do not populate the cache; they are not on the hot command path.

No operation signature, document shape, persisted schema, or IPC payload changes.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`, `src/domain/document.property.test.ts`
- `src/application/editor-history.test.ts` (existing behavior stays; add a guard that retaining does not traverse the live document)
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`
- `perf/state.spec.ts` (measured structural burst refresh only)

## Data model and persistence changes

None. The tracked set is derived, in-memory, non-enumerable, and renderer-process-local; it is not part of `Document`, not included in `JSON.stringify`, and never crosses IPC.

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- **Disk:** no change.
- **CPU:** removes one O(n) traversal per structural command and per text-session start from `EditorHistory.begin`, and the live-document traversal from every attachment cleanup. After the first collection for a document, both become O(1). Structural commands become genuinely O(depth).
- **Memory:** one small set per in-cache document, held through weak document keys and released with the document. The number of attachments bounds the set size; nothing is retained by the map itself.
- **Scaling:** attachment collection no longer scales with document size on the command path.

## Automated performance guards

- **Property:** after every operation, `collectAttachmentIds(result)` equals a full reference traversal of the result (same ids), for arbitrary documents. This is the correctness guard for every propagation branch.
- **Unit:** a warm document's unrelated subtree is not read when a structural command's result attachment set is collected, proving the O(1) inheritance (instrumented `children` accessor).
- **Unit:** `deleteNode` removes exactly the deleted subtree's attachment ids; `attachImage` and `insertSiblingAfter` add the new id; unchanged operations preserve the set.
- **Existing:** the `editor-history` reference-count property test and the `editor-store` cleanup tests continue to pass.
- **Perf:** `perf/state.spec.ts` structural burst remains the end-to-end guard; the observation is re-recorded in the plan.
- `npm run check:full` before commit.

## Measured results

Measured on this machine with the real domain code (316 × 316 = 100,172 nodes). Two hundred topology-preserving edits, each followed by an attachment-id collection, took **~7.0 ms** with the derived per-document counts versus **~59.7 ms** recomputing the set by traversal — about 8.5× faster, or ~0.035 ms versus ~0.30 ms per command. The `perf/state.spec.ts` structural burst is unchanged at ~420 ms because the 10,000-node scenario is dominated by Playwright key-event overhead and the per-structural-command node-index rebuild recorded in plan 0038.

## Testing

- Property test for attachment-set equivalence after every operation.
- Focused unit tests for inheritance, addition, subtree removal, and overwrite fallback.
- All existing domain, application, renderer, IPC, E2E, and performance suites stay green.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §11/§14: the attachment-id set is derived per document and propagated by operations; history retains it without re-scanning.
- `docs/DEVELOPMENT.md` §12: document the attachment-set property guard.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Stale derived set.** A missed propagation would make `collectAttachmentIds` return an incorrect set and could let cleanup delete a referenced attachment. The after-every-operation property test and the existing cleanup tests are the guard.
- **Overwrite semantics.** `attachImage` on a node that already has an attachment does not populate the cache, so it cannot under-report the overwritten id.
- **Hidden module state.** The `WeakMap` is transparent and identity-keyed; it cannot change a result because documents are immutable.

## Out of scope

- Persisting or sharing attachment-id sets across processes or sessions.
- Incrementally tracking the live document's ids outside the per-document derived set.
- Renderer object-URL caching and main-process attachment byte caching.
