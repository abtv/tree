Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Cache renderer attachment bytes across mounts

## Goal

Cache attachment bytes in the renderer so that remounting an image does not repeat the IPC round trip and the main-process disk read for a file that has already been loaded in this session.

This is the deferred item recorded in `docs/plans/completed/0034-bound-window-writes-and-attachment-existence-io.md:89` and `docs/plans/completed/0036-reduce-redundant-save-serialization.md:98`. It is a renderer-side performance change only: image presentation, preview behavior, the document schema, the attachment storage format, and the IPC payloads stay exactly as they are.

## Current behavior

- `AttachmentImage` and `ImagePreview` each call `readAttachment(attachmentId)` from a `useEffect` keyed on the attachment id (`src/renderer/AttachmentPreview.tsx:12-26`, `src/renderer/AttachmentPreview.tsx:57-71`). They convert the returned bytes to an object URL and revoke that URL on unmount.
- `readAttachment` is a thin pass-through to `window.treeApi.readAttachment` (`src/infrastructure/renderer/electron-services.ts:15-17`), which invokes the `tree:read-attachment` IPC channel.
- The main handler reads the entire `<id>.png` from disk through the file-service operation queue (`src/main/ipc-handlers.ts:76-78`, `src/infrastructure/main/file-services.ts:86-99`), then structured-clones the bytes back to the renderer.
- Those components remount whenever the visible node set changes — entering or leaving a node, navigating to an ancestor, structural edits that replace the sibling list, and opening or closing the preview. The inline image and the preview for the same attachment also load independently.
- Each remount therefore repeats one IPC call, one whole-file read (up to `MAX_ATTACHMENT_BYTES`, 25 MB, `src/main/ipc-security.ts:5`), and one byte-array clone. The disk read is serialized behind saves and other attachment operations in the same queue.

## Proposed changes

### 1. Add a bounded renderer attachment-byte cache

Add `src/infrastructure/renderer/attachment-bytes-cache.ts` exporting a factory:

```ts
createAttachmentBytesCache(
  read: (id: string) => Promise<Uint8Array | null>,
  maxBytes: number,
): { get(id: string): Promise<Uint8Array | null>; clear(): void }
```

The cache is keyed by attachment id and has these rules:

- **Byte-budget LRU.** Keep resolved `Uint8Array` values in an insertion-ordered `Map` plus a running total of cached bytes. A hit re-inserts the entry so the most recently used id is last. On a successful insert, evict oldest entries until the total is within `maxBytes`. The entry just inserted is retained even if it alone is the largest entry.
- **In-flight deduplication.** Track pending reads per id so that concurrent mounts of the same attachment (inline image plus preview) share one read instead of issuing two.
- **Do not cache misses or failures.** A `null` result (missing file) and a rejected read are not retained, so a later mount re-checks and a transient failure can recover. Only successful, non-null reads are cached.
- **`clear()`** empties both maps and the byte total. It exists for test isolation and renderer lifecycle resets.

No React, DOM, or Electron dependency: the factory only takes a read function, so it is unit-testable in a plain Node environment.

### 2. Wire a singleton over the existing IPC reader

In `src/infrastructure/renderer/electron-services.ts`, keep `readAttachment` unchanged as the raw reader and add:

```ts
export const attachmentByteCache = createAttachmentBytesCache(
  readAttachment,
  ATTACHMENT_BYTES_CACHE_LIMIT,
)
```

with `ATTACHMENT_BYTES_CACHE_LIMIT = 64 * 1024 * 1024` (64 MiB). Since the largest attachment is 25 MiB, the budget holds at least two full-size images and many ordinary screenshots while bounding renderer retention.

### 3. Use the cache in the attachment components

In `src/renderer/AttachmentPreview.tsx`, both effects call `attachmentByteCache.get(attachmentId)` instead of `readAttachment(attachmentId)`. Object URL creation and revocation per mount are unchanged, as is the "render nothing until bytes are available, and on missing or failed reads" behavior. `clear()` is called between unit tests so a cached id cannot leak bytes across cases.

## Affected modules

- `src/infrastructure/renderer/attachment-bytes-cache.ts` (new) and `attachment-bytes-cache.test.ts` (new)
- `src/infrastructure/renderer/electron-services.ts`, `electron-services.test.ts`
- `src/renderer/AttachmentPreview.tsx`, `AttachmentPreview.test.tsx`
- `src/renderer/App.test.tsx`
- `docs/ARCHITECTURE.md` §14, `docs/DEVELOPMENT.md` §12

## Data model and persistence changes

None. No document schema, persisted field, IPC channel, IPC payload, attachment id, or attachment file layout changes. The cache lives only in renderer memory and is discarded when the renderer reloads or exits.

## Performance assessment

Required by `PRODUCT.md` §22.1.

- **Disk reads.** Repeated mounts of an attachment no longer re-read its file. Only the first successful view of each id in a renderer session reads it; subsequent mounts hit the cache. The main-process file-service queue sees markedly fewer `readAttachment` operations during navigation, undo/redo, and preview open/close.
- **IPC and CPU on interactive paths.** Avoids one `tree:read-attachment` round trip and the structured clone of up to 25 MiB of bytes per remount. Each mount still builds a small `Blob` and object URL from the cached bytes; that cost is independent of disk and IPC.
- **Memory.** This adds retained memory where bytes were previously transient: bounded by `ATTACHMENT_BYTES_CACHE_LIMIT` (64 MiB) plus the in-flight reads. Eviction is least-recently-used, so retention follows the images actually revisited rather than growing with navigation or edit count. In-flight reads are bounded by the number of simultaneously mounted attachments, exactly as before this change.
- **Scaling.** Cache hits and recency updates are amortized O(1). Read cost scales with the number of distinct attachment ids viewed in a session, not with the number of mounts, navigation steps, or edits.

## Automated performance guards

- Unit (`attachment-bytes-cache.test.ts`): a second `get` for the same id does not call `read` again; two concurrent `get` calls issue one `read`; inserting beyond the budget evicts the least-recently-used entry and keeps retained bytes within the budget (allowing at most the newest oversized entry); a re-read after eviction calls `read` again; `null` and rejected reads are not cached and are retried.
- Component (`AttachmentPreview.test.tsx`): mounting, unmounting, and remounting `AttachmentImage` for the same id calls `window.treeApi.readAttachment` once. The same guard covers `ImagePreview` opening after the inline image has already loaded.
- Component (`App.test.tsx`): navigating away from and back to a node with an attachment does not increase the `readAttachment` call count.
- Existing `e2e/preview.spec.ts` and `e2e/clipboard.spec.ts` continue to exercise the real IPC read boundary end to end; the channel and payload are unchanged, so no new e2e scenario is required.
- `npm run check:full` before commit.

## Testing

- Unit: cache hit/miss, in-flight deduplication, LRU eviction by byte budget, oversized-entry retention, and non-caching of `null`/errors.
- Unit: `attachmentByteCache` forwards to `window.treeApi.readAttachment` and preserves resolved bytes and rejected errors.
- Component: repeated mounts of `AttachmentImage` and `ImagePreview` read once per id; missing and failed reads still render nothing.
- Existing image presentation, preview, and persistence e2e scenarios must keep passing unchanged.
- `npm run check:full` before commit.

## Documentation

- `docs/ARCHITECTURE.md` §14: the renderer caches attachment bytes in a bounded least-recently-used cache keyed by attachment id, so repeated mounts do not re-read files; the raw read and filesystem access stay in infrastructure.
- `docs/DEVELOPMENT.md` §12: describe the cache unit guard and the component guard that repeated mounts read once.

## Risks

- **Stale bytes.** Attachment ids are unique and never reused (`crypto.randomUUID`), and stored files are immutable, so a cached entry cannot become stale for a later mount. The plan adds no invalidation because there is no in-place content change path.
- **Retained memory.** The cache intentionally retains up to 64 MiB where bytes were previously transient. The bound is explicit, eviction runs on every insert, and the limit is a single constant if a future requirement needs a different budget.
- **Deleted files.** Cleanup only removes attachments no longer referenced by the live document, history, or pending writes, so a displayed image's file is not removed underneath the cache. Even if a retained entry were displayed after its file disappeared, the cached bytes are still valid content.
- **Test seam.** `clear()` is a small reset hook used by tests; module-level singletons otherwise persist within a test file.

## Out of scope

- Caching object URLs or decoded images to avoid the per-mount `Blob` creation.
- Indexing document nodes for O(depth) lookups.
- Main-process attachment byte caching, attachment deduplication, or a change to the file-service queue.
- Any change to attachment storage, cleanup policy, the IPC channel, or the persisted format.
