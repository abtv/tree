Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Bound the renderer-side attachment reference scan against history size

## Goal

Make the renderer's attachment-reference computation independent of undo/redo history depth.

Before each attachment cleanup the renderer recomputes the set of referenced attachment IDs by walking the live document and every retained history snapshot. The history retains up to `HISTORY_LIMIT` (200) undo entries plus up to 200 redo entries (`src/application/editor-history.ts:3`, `src/application/editor-history.ts:33-35`), so each cleanup traverses up to 401 whole documents, allocating a `Set` per document (`src/application/editor-store.ts:542-553`). Cleanup is queued on every undo and redo (`src/application/editor-store.ts:464`, `src/application/editor-store.ts:479`) and on structural edits and history eviction (`src/application/editor-store.ts:195`, `src/application/editor-store.ts:484`). A burst of undo/redo therefore performs O(`HISTORY_LIMIT` × document size) traversal work per cleanup, scaling with both history depth and document size.

The goal is to keep the same user-visible cleanup decisions while making the per-cleanup cost independent of history depth: exact attachment reachability is maintained incrementally as history snapshots are retained and released, instead of rescanned from scratch.

## Current behavior

- `EditorHistory` stores retained snapshots as two `Document[]` arrays (`past`, `future`) and exposes them via `documents()` (`src/application/editor-history.ts:5-35`).
- `EditorStore.referencedAttachmentIds()` builds a fresh `Set`, traverses the live document, then calls `collectAttachmentIds` for every retained history document before adding `pendingAttachmentIds` (`src/application/editor-store.ts:542-553`, `src/domain/document.ts:378-391`).
- `PersistenceCoordinator` calls that callback at cleanup time and forwards the resulting IDs over IPC (`src/application/persistence-coordinator.ts:94-105`).
- Cleanup is requested only where attachment reachability can change: initialization, structural edits, undo, redo, and history eviction. The resulting set already reflects the architecture rule that cleanup retains the live document, every retained history snapshot, and pending writes (`docs/ARCHITECTURE.md:363`).

## Proposed changes

### 1. Maintain incremental attachment reachability in `EditorHistory`

Change the retained-snapshot storage from `Document[]` to entries that carry the snapshot's attachment IDs alongside the document, and keep a reference count per attachment ID:

```text
entry = { document, attachmentIds: ReadonlySet<AttachmentId> }
attachmentCounts: Map<AttachmentId, number>
```

- On retention (`begin`, `undo`, `redo` pushing a snapshot), compute the snapshot's IDs once with `collectAttachmentIds` and increment each ID's count.
- On release (past eviction, future eviction, and clearing the redo stack in `begin`), decrement using the stored set and delete entries that reach zero. Using the stored set keeps release proportional to the snapshot's attachments, not to document size.
- Add `attachmentIds(): Iterable<AttachmentId>` returning IDs whose count is greater than zero, and stop calling `documents()` from the store. The store no longer needs the retained documents themselves, so the 400-element array allocation no longer happens on the cleanup path. `documents()` remains a read accessor used by the property test's reference model.
- Preserve the existing `begin` return value (`evicted`) so cleanup is still queued on exactly the same transitions as today. Clearing the redo stack continues not to queue cleanup by itself, preserving current timing behavior.

### 2. Use the maintained set in the store

- `EditorStore.referencedAttachmentIds()` keeps the live-document traversal and `pendingAttachmentIds` union, and replaces the per-history-document loop with `this.history.attachmentIds()`.

This is behavior-preserving: the returned referenced set is identical, so the same files are kept and removed.

## Affected modules

- `src/application/editor-history.ts`, `src/application/editor-history.test.ts`, `src/application/editor-history.property.test.ts`
- `src/application/editor-store.ts`, `src/application/editor-store.test.ts`
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`

## Data model and persistence changes

None to persisted data, the document schema, or IPC payloads. The change is limited to in-memory history bookkeeping. `EditorHistory` retains one small ID set per retained snapshot and one reference count per distinct attachment ID referenced by retained history.

## Performance assessment

Required by `PRODUCT.md` §22.1.

- CPU on reference-changing paths: previously O((2 × `HISTORY_LIMIT` + 1) × N) per cleanup, with N the node count, plus a `Set` allocation per retained document. Cleanup now reads the reference-count map (O(A), A distinct attachments) and traverses only the live document (O(N)); it no longer scales with history depth.
- CPU on history mutation paths: each snapshot is traversed once when it is retained. `begin` for a structural command already performs an O(N) deep copy, so this does not change the order of that path. A new text-editing session now traverses its starting snapshot once at session start; the same traversal previously happened later during cleanup, so total work decreases whenever a cleanup follows, but the cost moves earlier on an interactive path.
- Disk operations: unchanged. The set of retained attachment IDs is identical, so the same files are kept and removed, with the same cleanup scheduling. No new reads, writes, or syncs.
- Memory: adds one reference-count entry per distinct attachment ID referenced by retained history and one ID set per retained snapshot. Both are bounded by `HISTORY_LIMIT` and by the number of images actually present in retained snapshots; documents contain few attachments, and the sets hold no image bytes. This does not grow with edit count beyond the existing history bound.
- Scaling: the reference-changing path is now decoupled from history depth and scales only with the live document and the number of distinct attachments.

## Automated performance guards

- Property test (`src/application/editor-history.property.test.ts`): drive arbitrary sequences of `begin`, `undo`, and `redo` over documents with random, sometimes repeated attachment IDs, and assert `attachmentIds()` equals the union of `collectAttachmentIds` over the retained snapshots at every step. This guards the reachability invariant against the naive model.
- Deterministic unit guard (new focused unit test): mock `collectAttachmentIds` with a call counter and assert that calling `attachmentIds()` repeatedly after a large history has been built does not invoke it again. This proves cleanup no longer performs a per-snapshot traversal, without relying on wall-clock timing.
- Unit coverage (`src/application/editor-history.test.ts`): counts increase and decrease across retention, past eviction, redo-stack clearing, and future eviction; duplicate IDs across snapshots remain referenced until the last snapshot is released.
- The existing `perf/state.spec.ts` state/persistence scenario continues to exercise the end-to-end reference-changing cleanup across the Electron boundary and enforce its cleanup-duration ceiling (`docs/DEVELOPMENT.md:326`).
- `npm run check:full` before commit.

## Testing

- Unit: `EditorHistory.attachmentIds()` reflects past and future snapshots, releases on eviction and on redo-stack clearing, and handles duplicate IDs.
- Unit: `EditorStore.referencedAttachmentIds()` still retains attachments reachable only through history and still includes pending writes.
- Unit: cleanup decisions (which files are kept or removed) are unchanged for delete, undo, and redo.
- Property: the retained reachability model holds across arbitrary undo/redo sequences.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §11: attachment reachability is maintained incrementally with the history so cleanup does not rescan retained snapshots.
- `docs/ARCHITECTURE.md` §13: the retained referenced-attachment set is computed from the live document plus incrementally maintained history counts.
- `docs/DEVELOPMENT.md` §12: describe the new property and deterministic unit guards alongside the existing performance guards.

## Risks

- Recording attachment IDs when a snapshot is retained adds a per-snapshot `Set`. Retained snapshots share subtrees, so this is small in practice but is new retained memory; it stays bounded by the history limit.
- Moving the snapshot traversal to history mutation adds an O(N) scan when a text-editing session starts. It is offset by the removal of the repeated full-history scan at cleanup, but it should be confirmed by the typing and state performance scenarios.
- A counting mistake could under-retain a reachable attachment and delete a file still needed by undo. The model-based property test and the duplicate-ID unit cases specifically guard against this.
- `documents()` remains available as an application-internal read accessor; only the store stopped calling it, so no production behavior depends on it.

## Out of scope

- Incrementally tracking the live document's attachment IDs to avoid the single live-document traversal per cleanup.
- Any change to when cleanup is requested (for example, queueing cleanup when the redo stack is cleared).
- Changes to `HISTORY_LIMIT`, the snapshot-based history design, or attachment storage and IPC payloads.
