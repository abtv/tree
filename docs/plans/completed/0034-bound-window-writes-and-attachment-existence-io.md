Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Bound window-geometry writes and avoid attachment byte reads

## Goal

Remove two remaining sources of unnecessary disk and IPC work that were not covered by plan 0033:

1. The main window writes its geometry to disk synchronously on every `move` and `resize` event, which fires continuously while the user drags or resizes the window (`src/main/index.ts:57-58`, `src/infrastructure/main/window-state.ts:46-54`). Each event performs a blocking `writeFileSync` on the main process, causing event-loop stalls and excess writes.
2. Attachment existence validation reads the entire file (`src/infrastructure/main/file-services.ts:105-117`, `readFile`). Startup validates every attachment referenced by the document (`src/application/editor-store.ts:145-149`), so launch I/O is proportional to total attachment bytes, and the checks are issued sequentially over IPC.

Both changes are behavior-preserving: window geometry still persists across restarts, and missing attachments still fail loading safely.

## Current behavior

- `createMainWindow` registers `saveWindowBounds` for `move` and `resize`; the handler calls `window.getBounds()` and `windowBoundsStore.save(bounds)`, which runs `writeFileSync`. There is no debounce or throttle. The final geometry is also saved on `close`.
- `createFileServices().hasAttachment(id)` calls `readFile(path)` and only uses the result to distinguish success from `ENOENT`.
- `load()` verifies recovery-candidate attachments the same way, by reading each referenced file.
- `EditorStore.initialize` loops over `collectAttachmentIds(parsed.document)` and awaits `hasAttachment` sequentially.

## Proposed changes

### 1. Debounce window-geometry persistence

- Add `createDebouncedWindowBoundsSaver(store, delayMilliseconds, timers)` to `src/infrastructure/main/window-state.ts`. It coalesces `save(bounds)` calls into one `store.save` after the delay, keeps only the latest bounds, and exposes `flush()` to persist the pending bounds immediately and cancel the timer.
- Default delay: 300 ms. This bounds writes to one per drag/resize gesture while remaining imperceptible.
- `src/main/index.ts`: register the debounced saver for `move`/`resize`, and on `close` schedule the latest geometry then `flush()` synchronously before the window is allowed to close (the existing close path also runs the quit handshake).
- No product behavior change: geometry is still restored on next launch; a crash within the debounce window loses only the most recent uncommitted geometry, which the existing opportunistic store already treats as best-effort.

### 2. Metadata-only attachment existence checks

- Add an `attachmentExists` helper in `src/infrastructure/main/file-services.ts` that uses `stat` instead of `readFile`.
- Use it for `hasAttachment` and for the recovery-candidate attachment check in `load`.
- `EditorStore.initialize`: check all referenced attachment IDs concurrently with `Promise.all` while preserving the deterministic "first missing in traversal order" error, instead of one awaited IPC round trip per attachment.

## Affected modules

- `src/infrastructure/main/window-state.ts`, `src/infrastructure/main/window-state.test.ts`
- `src/main/index.ts`
- `src/infrastructure/main/file-services.ts`, `src/infrastructure/main/file-services.test.ts`
- `src/application/editor-store.ts`, `src/application/editor-store.test.ts`
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`

## Data model and persistence changes

None. No schema, IPC payload, or persisted-field change.

## Performance assessment

Required by `PRODUCT.md` §22.1.

- Disk writes: previously one synchronous `writeFileSync` per `move`/`resize` event (potentially many per gesture). Debouncing reduces this to at most one write per 300 ms of continuous movement and one flush on close. No new disk work.
- Disk reads: attachment existence checks previously read the full file contents, up to 25 MB per image. They now read only filesystem metadata (`stat`), so validation cost is constant per attachment instead of proportional to attachment bytes.
- CPU on interactive paths: window dragging/resizing previously blocked the main process on synchronous JSON serialization and a write syscall; it now does neither during the gesture.
- Startup latency: attachment validation is now O(number of attachments) metadata calls issued concurrently rather than a serial chain of full-file reads, so startup no longer scales with total attachment bytes.
- Memory: unchanged. The renderer still reads attachment bytes only when displaying or previewing an image.
- Scaling: the cost of both paths is decoupled from window-drag event volume and from attachment file size.

## Automated performance guards

- Unit (`window-state.test.ts`): with injected fake timers, many `save` calls within the delay produce exactly one persisted write and keep the latest bounds; `flush` persists immediately and cancels the pending timer.
- Unit (`file-services.test.ts`): `hasAttachment` resolves using `stat` and does not call `readFile`.
- Existing boundary coverage (`e2e/persistence.spec.ts` "restores the main window size and position after restart") continues to exercise the debounce plus close-flush across the real Electron boundary. The poll uses a tolerant reader (`tryReadWindowBounds`) so it retries while the debounced write is still pending.

## Testing

- Unit: debounced saver coalescing, latest-wins, and flush; window bounds still saved via the store.
- Unit: `hasAttachment` metadata-only check for present and missing files; recovery still rejects a missing attachment.
- Unit: `EditorStore.initialize` reports the first missing attachment and still loads when all are present.
- E2E: unchanged window-bounds restart scenario must keep passing.
- `npm run check:full` before commit.

## Documentation

- `docs/ARCHITECTURE.md` §16: window geometry writes are debounced and flushed on close.
- `docs/ARCHITECTURE.md` §14/§13: attachment existence validation reads metadata only.
- `docs/DEVELOPMENT.md` §12: note the new unit guards.

## Risks

- Debouncing could drop the final geometry if the process exits without a `close`/flush. The `close` handler flushes synchronously, and the store is already documented as opportunistic, so this remains best-effort.
- `stat` treats a directory named `<id>.png` as present. Attachment IDs are validated and written as files; a directory collision is not a supported state and is outside current behavior.
- Concurrent existence checks change which request is in flight but preserve the reported first-missing attachment.

## Out of scope

- Caching attachment bytes in the renderer across mounts.
- Removing the `serializeState` defensive clone or the main-process re-parse on save (deferred in plan 0033).
- Indexing document nodes for O(depth) lookups.
