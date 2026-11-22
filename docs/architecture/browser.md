# Browser Package, Archive and Folder Backup

### 13.14 Browser installation and storage protection

PRODUCT §24.1 adds no notes storage layer. Vite copies the manifest and icons from `src/web/public/` to the package root, and the release policy accepts them only by exact name. `src/web/storage-persistence.ts` reads `navigator.storage.persisted()` after the editor starts and calls `persist()` at most once per page load when storage is not yet persistent; `main.tsx` shows the result in the bottom status bar. `src/web/appearance.ts` switches the two `theme-color` meta tags together with the CSS appearance rules. Performance assessment (§22.1): one storage-state read and at most one request per page load; no IndexedDB writes, no interactive CPU and no memory growth.

### 13.15 Browser offline package and updates

`scripts/web/build.mts` builds `sw.js` from `src/web/workers/offline.worker.ts`, embedding
every current package file and its SHA-256 integrity value. The cache identity hashes the
worker bundle, including that inventory, so worker-only changes also install into a separate
cache. `src/web/offline-worker.ts` fetches the complete package sequentially with integrity
checks and without the HTTP cache. A failed installation deletes only its candidate cache;
the browser keeps the active worker. The release policy permits only the exact `sw.js` name.

The worker serves the cached entry page and app assets. A fixed-size metadata cache names
the active package, the requesting page's runtime package and the waiting package. A scoped
Web Lock serializes metadata and pruning across worker versions. Successful installation
prunes obsolete candidates while retaining the previous waiting worker in case it is entering
automatic activation. Failed installation leaves the previous waiting package intact.
Activation preserves the package containing the requester's entry script and stylesheets, including after
repeated activation timeouts; it does not infer the running version from cache creation order.
Only initial activation claims uncontrolled pages. Other caches and IndexedDB are untouched.
The waiting worker checks for a sole Tree window before cache work and again after pinning the runtime. It then sends `prepared` on the request's MessagePort. On receipt of `commit` on that same port, the worker checks windows once more to catch arrivals while the message was in transit. It observes cancellation and its deadline through that last check before calling `skipWaiting()`. A retired page attempt sends `cancel` and closes its port. A refusal restores the previous pin. The worker releases the cache lifecycle lock before awaiting activation.

A scoped Web Lock excludes page startup from the final switch. Both serving an entry navigation and opening the browser session use shared admission. A competing navigation immediately receives the reload message. The requester holds exclusive admission through its bounded wait for the selected controller. On timeout after sending `commit`, it releases input and writes and keeps running its pinned package. A late change of controller cannot reload the page. Retry saves again, waits for activation and controller ownership, then releases admission before reloading.

The preparation request extends the read-only offline-status message. An older waiting worker replies with ordinary asset readiness, and the new page offers close and reopen so the browser can activate it normally. An already active first-visit package uses an optional read-only window check with the same fallback. Older pages send one-way `tree-activate-update` consent. The waiting worker takes admission itself, checks windows and limits preparation to the original response budget from receipt. An old sender cannot confirm again or revoke its consent on the new protocol. The browser can change the controller of a navigation before its document starts executing. Previously shipped entry scripts and workers cannot enforce the new admission check.

`src/web/app-updates.ts` registers only in the production browser entry, checks at startup
and reconnection, and publishes readiness through the browser menu. Download never reloads
the page. An explicit update can start after user-initiated folder backup configuration
finishes. Ordinary background backup remains available. The update reserves the same operation slot as archive import and export,
blocks input, and flushes the store, including buffered and asynchronous edits. The flush
seals further edits before the controller suspends writes and requests activation through
a MessageChannel. Only the requester reloads, after the selected worker takes control.
Failure or timeout releases the operation slot and restores editing and writes. Cache
assessments apply only to their active worker and latest request. The worker records the
requested package and retains the open page's runtime until the browser confirms activation.
Only the current waiting package accepts an activation request. An interrupted download
preserves caches still used by the active worker, the waiting worker or the open page.

Performance assessment (PRODUCT §22.1): package writes occur only during installation, off
the main thread, with temporary response memory bounded by one file. The controller retains
no document snapshots, and typing performs no update checks or cache writes. Activation uses
the existing save flush, adding no new persistence policy. Unit guards bound retained cache
generations and test ownership; browser tests exercise offline startup and real update failures.
Page admission adds a bounded lock operation on entry. The explicit update checks open clients and locks and may undo its single cache metadata write. This adds no work during typing and no writes to notes.

### 13.16 Browser notes archive

The browser export (`docs/PRODUCT.md` §24) follows [ADR 0022](../decisions/0022-notes-archive-format-and-worker.md). `src/web/storage-schema.ts` owns the IndexedDB identity and the open and read helpers that the page adapter and the archive worker share. `src/application/notes-archive/` owns entry names, limits, the finished-size budget and export sequencing behind two ports: a source that reads the head and one image per call, and a writer that appends entries. `src/infrastructure/archive/zip-writer.ts` implements the writer with fflate's synchronous streams; it and the inflater below are shared with the desktop application ([ADR 0024](../decisions/0024-desktop-notes-archive.md)), and `src/application/notes-archive/archive-messages.ts` owns the progress, result and confirmation wording; `src/web/archive/export-job.ts` runs the export in `src/web/workers/archive.worker.ts`, combines small output chunks and transfers buffers to the page. `src/web/data-menu.ts` flushes pending edits through `EditorStore.flushPersistence`, starts one worker per export, appends chunks to a `Blob`, starts the download and reports progress; cancelling terminates the worker and ignores messages it queued earlier.

Performance assessment (`docs/PRODUCT.md` §22.1): export adds no IndexedDB writes or syncs; its only write is the browser's download of the finished file. The worker reads the head in one transaction and each referenced image once, so its CPU is linear in document and image bytes, and it holds the encoded document, one image and a bounded block of pending output. The page's work per chunk is constant and independent of document size: it does not parse, copy or traverse the notes, and the Blob keeps archive bytes in browser-managed storage outside the page's JavaScript heap. The flush before export is the same save that quitting performs. `perf/web/export.spec.mts` guards main-thread long tasks during a large export and records duration, heap growth and archive size.

Import (`docs/PRODUCT.md` §24.4) runs in the same worker. `src/application/notes-archive/zip-reader.ts` is the archive reader: it validates the end record and the whole central directory before reading any payload, then reads one entry at a time through a random-access file port, checking its local header, size and CRC-32; Deflate data goes through an injected inflater, which `src/infrastructure/archive/zip-inflate.ts` implements with fflate's synchronous `Inflate`; `src/web/archive/blob-archive-file.ts` implements the file port over the chosen `File`. `import-notes.ts` validates `document.json` as loading does, then validates and stages each referenced image through an image-store port, never overwriting a stored image and removing its staged images on failure. `src/web/archive/import-job.ts` connects these to IndexedDB in the worker, reports both note counts, and on the page's command replaces the head in one transaction. The worker stores each image together with a journal key `import-staged:<id>` in the `preferences` store, in one transaction (`src/web/storage-schema.ts`); the head replacement deletes the journal in the same transaction as the head `put`. `src/web/data-menu.ts` passes the chosen `File` to the worker and shows the confirmation dialog; when the import is cancelled or fails it terminates the worker and removes every journaled image in one transaction, which IndexedDB orders after any image transaction the worker had started. The editing session removes a journal left by a closed tab or crash when it starts, after it holds the writer lock; without a journal that check is one read. Before the commit it flushes pending edits and suspends the session's writes (`DataSession.suspendWrites` in `src/web/services.ts`), so no autosave can write the previous document over the imported head; it resumes them when the commit fails and reloads the page when it succeeds. If the worker stops during the commit, the page reloads instead of resuming, because the head may already be replaced.

The page owns each import or folder restore through an explicit phase: initial save, preparation, confirmation, replacement save, submitted commit, then stopped or reloading. Only the submitted-commit phase owns a write suspension. A worker failure during the replacement save stops the operation without suspending writes or reloading. The save continuation checks its phase object identity before sending the commit, so a stopped attempt cannot resume or affect a subsequent import. After commit submission, an unexpected worker stop reloads exactly once without resuming writes or sweeping a potentially committed head. Explicit transaction rejection still releases the suspension and removes staged images.

Import performance assessment (`docs/PRODUCT.md` §22.1): import writes each new referenced image once, with its small journal key in the same transaction, and the head once, all in the worker; staged images that a cancel, failure or closed tab leaves are deleted in one transaction. Startup adds one key-range count on `preferences`. The worker's CPU is linear in archive bytes, and it holds the central directory, the document and one image at a time. The page does constant work per message and never receives the document. Its phase owns a bounded set of resources and adds no storage operations or document-sized state. `perf/web/import.spec.mts` guards main-thread long tasks while a large archive is prepared and records preparation time, replace-and-reload time and heap growth.

---

### 13.17 Browser folder backup

Folder backup follows [ADR 0023](../decisions/0023-browser-folder-backup.md) and PRODUCT §24.5. `src/application/folder-backup.ts` owns sequencing, fixed-deadline coalescing, retries and status behind source, destination and clock ports. The destination has no delete operation. `src/web/backup/folder-destination.ts` implements writes with `createWritable` and `close`, aborting a failed stream; images close before the document is opened. The worker scans image names once, excludes empty files left by failed writes, and adds a name only after its successful write. A folded-name set rejects case collisions before overwriting an image on macOS. Attachment IDs remain immutable; external edits of an active backup folder are unsupported.

`src/web/backup/backup-controller.ts` owns the picker, the `backup-folder` preference handle, permission queries and click-only permission requests, worker lifecycle and status UI. `DataSession.onSaved` in `services.ts` fires after a successful head transaction. It sends only `{ type: 'saved' }` to the long-lived same-origin module worker. The worker reads the latest head in one short read-only IndexedDB transaction, with one subsequent read per image. Page shutdown terminates it. Browser storage identity, schema and editing ownership do not change.

The controller separates lifecycle (`loading`, `off`, `starting`, `active`, `paused`,
`disposed`), asynchronous command execution, and confirmation (`closed`, `occupied`,
`resume`). Only the active lifecycle owns a Worker; configured states own their
folder, and each open confirmation owns its target folder. Stable action handlers
read that confirmation instead of capturing a new target on every dialog opening.
Menu identity derives from lifecycle; late messages must match its current Worker.
These bounded records add no document work, messages, preference writes or syncs.

Restore from Folder (PRODUCT §24.6) and the nonempty-folder Restore choice both reuse the import journal and commit pipeline: `src/web/data-menu.ts` sends the directory handle to the archive worker in a `restore` request. `prepareNotesFromSource` owns the shared validation and staging; the ZIP reader remains responsible for ZIP structure and CRC checks. `src/web/archive/folder-source.ts` checks sizes before allocation, reads only referenced files, and treats only NotFound as a missing image. The page receives counts and byte size, never document content. The menu command uses a read-only picker. Restoring a folder does not change the backup choice. An active backup worker keeps running during a restore; it cannot see the replaced head before the reload, because the commit is not a session save and session writes are suspended. When the source is the active backup folder, the backup replaces `document.json` atomically through `createWritable` and never rewrites a completed image, so the restore reads a complete version or fails closed if the file changes during its read.

Performance assessment (PRODUCT §22.1): each successful save adds one constant-size worker message; the editor never serializes or traverses content for backup. A run costs O(document bytes) and O(new image bytes), with one document write per interval and one write per missing image. Memory is the startup image-name set, one document, and one image, with no per-edit growth. Handle persistence writes once on enable and deletes one preference on stop. `perf/web/backup.spec.mts` compares alternating backup-off/on typing in a large profile and records paint latency, long tasks, save time, backup lag, bytes per minute and heap growth. OPFS tests establish API wiring and main-thread cost, not physical disk speed or native permission persistence.
