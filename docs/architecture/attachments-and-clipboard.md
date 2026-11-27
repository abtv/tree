# Attachments and Clipboard

### 13.7 Attachment Image Sizes

An attachment reference may store the image's natural size as optional `width` and `height` (PRODUCT.md §17), with no ADR and no schema version change, like `searchText` (§5.2). `src/domain/attachment-dimensions.ts` owns the rule: both fields or neither, positive integers within the attachment limits of 32,767 pixels per side and 67,108,864 pixels in total; `src/shared/png-validation.ts` re-exports those limits. Image paste, drop and browser paste share `pasteFromClipboard`, which reads the size from the PNG `IHDR` header with `readPngDimensions` (`src/shared/png-validation.ts`) before writing the attachment; desktop and browser use the same function. Notes archives carry the fields through the same serializer. An older build accepts a file with these fields and drops them on its next save. Unlike `searchText`, an invalid size does not reject the document: both validators accept it, and parsing drops the pair, because rejecting the file would fall back to an older generation and lose the user's latest edits (PRODUCT.md §1.1) for a value the image header restores.

After `initialize` publishes the loaded document, `EditorStore` starts a background backfill without awaiting it. `attachmentIdsWithoutDimensions` lists each attachment some node references without a size, and `EditorServices.readAttachmentDimensions` reads their headers in batches of at most `MAX_ATTACHMENT_SIZE_BATCH` (100) ids. Desktop uses the trusted, validated `tree:read-attachment-dimensions` channel; the file service reads only the first 24 bytes of each file in its serialized queue, returning null for a missing file, an invalid header, or a file it cannot read, which it logs as a failure without failing the rest of the batch. The browser adapter reads each stored IndexedDB value, which it cannot read partially, and parses only its header. A failed batch is skipped. The store applies every result in one publication through `attachmentSizeEnrichment` (`src/domain/attachment-size-enrichment.ts`), which, like the hidden OCR enrichment of §5.2, updates the current, undo and redo documents without a history entry, copies only changed ancestor paths, shares replacements across snapshots and keeps attachment summaries. It marks no pending change: the next ordinary save writes the sizes. A decoded image whose natural size differs from the stored one reports it through `recordAttachmentDimensions`; reports arriving within 100 ms are applied together in the same way, replacing the stored size. Both paths do nothing while the persistence lock holds.

Performance assessment (PRODUCT.md §22.1): no write or sync of its own; insertion parses 24 bytes; loading adds two integer checks per attachment; the backfill reads one 24-byte header per legacy image outside keyboard input and adds one document walk per snapshot when it publishes; a correction compares two numbers per image load; memory grows by two numbers per attachment. `src/application/editor-store-attachment-sizes.performance.test.ts` guards loading and backfilling 1,000 images.

---

## 14. Attachments

Image attachments are stored separately from the document JSON.

Conceptually:

```text id="v8m7lq"
data/
├── document.json
└── attachments/
    └── <attachment-id>.<extension>
```

The document stores an attachment reference.

Attachment storage is responsible for:

* creating attachment files;
* reading attachment files;
* reading the image size from an attachment's PNG header without reading the rest of the file (§13.7);
* deleting unused attachment files;
* ensuring attachment references remain valid;
* flushing attachment bytes and the attachments directory entry before a write reports success.

Reads, writes, and cleanup operations are ordered through the same infrastructure queue. Cleanup is therefore idempotent with respect to overlapping application requests rather than relying on concurrent unlink calls to succeed.

Attachment files referenced by a retained generation are kept even when the live document and runtime history no longer reference them. The file service unions the renderer's keep set with the attachment ids parsed from the primary document, the current temporary file, and every retained generation before it deletes anything, so recovery candidates remain loadable until pruning removes the last generation that references them and cleanup runs again.

Moving a node must not require copying its attachment file.

### 14.1 Decoded Image Cache

The renderer caches decoded attachment images in a bounded least-recently-used cache keyed by attachment id (`src/infrastructure/renderer/attachment-image-cache.ts`). Each entry holds one object URL and a retained, already decoded image element for it. While that element is referenced, the URL stays in the document's list of available images, so a remounted `<img>` with the same URL is complete in its first render instead of repeating the IPC call, the whole-file read and the decode. An entry costs its encoded bytes plus four bytes per decoded pixel. The budget is 512 MiB in the Electron renderer and 128 MiB in the browser adapter, where mobile browsers discard a tab under memory pressure much earlier; the browser entry supplies its cache to `App`. Eviction, a display error and `clear` release the entry's URL and decoded pixels; a single entry larger than the budget is still retained. A display error for a URL the cache already evicted or replaced requests the image again instead of reporting a load failure. A missing attachment or a failed read or decode is not cached. The cache is process-local renderer state and never changes stored bytes; filesystem reads remain in infrastructure.

Tree and full previews use this original-size cache. Search uses a separate 96 MiB cache in both the Electron renderer and the browser. It reads the same stored PNG and reduces a large static image to at most twice the Search display size in each direction (240×96 pixels), without upscaling. It keeps and charges only the reduced bitmap's pixels, closes the bitmap on eviction, and draws visible copies into their reserved boxes without encoding another PNG. Images with an embedded profile or non-sRGB chromaticities can use a Display P3 canvas. Small or animated images, PNGs with explicit media color metadata, and runtimes where the requested canvas or bitmap cannot be drawn use the original decode path. Search does not write thumbnail files or replace the original bytes.

The decoded-byte budgets count retained entries, not the Chromium renderer or GPU working set. A large PNG can still require a transient full decode. In a macOS Electron stress run with distinct screenshot-sized images, reducing the retained pixels lowered renderer memory and let the reverse traversal reuse the thumbnails without more reads. Simply lowering the original-image cache budget instead increased decoding and delayed image readiness on warm revisits. The comparisons cover scrolling and revisits on one host, not slow storage or system-wide memory pressure.

### 14.2 Reserved Image Box

`AttachmentImage` (`src/renderer/AttachmentPreview.tsx`) reserves an image's box before its bytes load, so a remounted or newly mounted row does not grow after its first paint. It takes the box from the size measured when the image last decoded in this renderer, kept for at most 1,024 attachments, or else from the stored `width` and `height` (§13.7), fitted to the inline bounding box of PRODUCT.md §17.1. The placeholder takes the margins of the image button it stands in for. A load-error message after a reserved box takes the same margins and keeps the box's height as its minimum height. On load it compares the decoded natural size with the stored one; a difference re-renders with the decoded box and is reported to `EditorStore.recordAttachmentDimensions`.

---

## 15. Clipboard

Clipboard access belongs to infrastructure.

A dedicated clipboard service should translate the operating system clipboard into application-level input.

Both clipboard adapters use `shared/clipboard-links.ts` for bounded pure HTML link extraction. The shared parser owns the input limits and the algorithm; platform adapters own native/event clipboard access and their payload shapes.

The rest of the application should not directly depend on browser clipboard APIs.

The clipboard service should support:

* text;
* multiline text;
* images.

Clipboard-specific platform details must remain outside the domain.

### 15.1 Vim External Clipboard Writes

Vim external yanks and Normal `dd` use a separate `writeClipboardContent` service and IPC channel carrying plain text or an attachment ID. Application projections choose the content under PRODUCT.md §20.2.22; the main process validates the payload, reads image bytes through the file-service queue, and validates the PNG before writing it. Native writes are serialized with rich clipboard copies so a pending image read cannot overwrite a later copy. The external copy causes no document mutation, persistence writes, or history entries beyond those of the command itself; text projections read selected text, node content, or whole selected subtrees for Normal text and node Visual yanks, and image copying uses the attachment byte and decoded-image limits. `dd` captures the caret before deletion changes focus and exports only after successful deletion; the undo history retains the removed attachment during image copying.

### 15.2 Editing Commands

`Cmd+C` on the Vim Normal image caret uses the same attachment clipboard service as Vim yanks.

In the browser adapter, keyboard paste reaches the native paste event. Browser infrastructure captures the event's text, HTML and PNG file synchronously and supplies a clipboard reader to the store paste operation. The renderer prevents default insertion and resolves Vim sessions before dispatching the edit. This avoids a separate programmatic clipboard-read permission prompt. Electron keeps the shortcut ownership described below.

The desktop application's Edit menu exposes Find, global Search and Vim Editing (PRODUCT.md §9.3), but no native roles for Undo, Redo, Cut, Copy, Paste or Select All. The editor key handler owns those standard editing commands: it intercepts the shortcut, prevents the native default, and performs the operation through the editor store and the clipboard service. The desktop application must not rely on native menu roles or native clipboard DOM events as the primary route. See `docs/decisions/0003-renderer-owns-standard-editing-commands.md`.

`EditorStore` (`src/application/editor-store.ts`) owns pending cut and paste edits. Each edit records its target, expected text and link ranges, and request order. The store rechecks the target when clipboard I/O finishes and again after writing an image for paste. Starting a new Vim Replace session invalidates pending edits on that node through `interruptPendingClipboardEdits`. An earlier cut or text paste advances a later paste's expected content only if the earlier edit succeeds and its pre-edit content matches what that paste expects (PRODUCT.md §12, §13.1). Each completed edit releases its record. The checks add no writes or syncs of their own, and maintaining request order visits only the edits still pending.

Editable node fields also expose a native macOS contextual menu. The renderer captures the node's selection and capabilities, the main process presents the platform menu, and the selected Cut, Copy, Paste, or Select All command returns to the renderer and uses the same editor-store path as the keyboard command. Look Up uses Electron's native definition service and Search with Google opens the selected text externally. The menu is attached only to editable node inputs, so other controls do not acquire editor commands.

Opening the menu performs one constant-size selection inspection and one IPC round trip. It does not write to disk until an editing command changes the document, does not traverse the tree, and does not retain state after the popup closes.
