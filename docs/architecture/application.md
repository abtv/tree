# Application Layer and Desktop Updates

## 7. Application Layer

The application layer coordinates user intentions with domain operations and infrastructure.

It is responsible for use cases such as:

* executing commands;
* coordinating domain changes;
* triggering persistence after changes;
* coordinating clipboard input;
* coordinating attachment storage;
* maintaining application-level state that is not part of the document itself.

The application layer may depend on the domain.

The application layer may use infrastructure interfaces.

The application layer must not contain React components or JSX.

The editor command coordinator composes focused collaborators for runtime snapshot history and queued persistence. History owns document snapshots and undo/redo location reconciliation. Persistence owns serialized document-save and attachment-cleanup scheduling, while receiving current state and referenced attachment IDs through narrow application-layer callbacks. This keeps editor commands independent from queue mechanics without moving product rules into infrastructure.

### 7.1 Desktop Updates

Desktop updates (PRODUCT.md §26) use `electron-updater` in the main process, with the packaged GitHub configuration. `AppUpdates` owns a separate bounded save acknowledgment and rollback of the bootstrap quit permission; it does not use the ordinary `QuitHandshake` (§7.6). Its independent state models own package readiness, download/failure feedback, the shared background-check Promise, manual check/dialog lifetime, and installation. Installation moves through `idle`, `awaiting-save` (request ID and deadline), `preparing-install` (native staging deadline) and `native-quit` (same deadline and quit-permission rollback). Public status and availability are derived from these states. A failed recheck can coexist with a ready package; failure feedback takes precedence without discarding that package.

The native Tree menu requests a renderer flush through trusted IPC. Renderer input is blocked until installation or failure. The renderer keeps request identity and the focus to restore in one attempt record. Save and acknowledgment continuations check that record before confirming, reporting a late failure or releasing input; completion of an earlier attempt cannot release a retry or a replacement owner. Automatic installation on quit is disabled. The ZIP-download notification enables Restart and Install; only after successful saving does the main process ask Squirrel.Mac to stage and verify it, then quit and install. Window close and ordinary quit can cancel the request during staging. Main grants the installer permission to close the windows immediately before calling its native quit method. The load-error screen shares the operation-error notification with the editor.

Main registers the native listeners once. It tracks one package as idle, staging, staged or installing. The preparation timeout releases editing. It cannot cancel an outstanding native operation, whose callbacks carry no request ID. If a saved retry is waiting when the old operation fails, main continues with the requested version. An error received before that save completes leaves the retry in control of its own save and deadline.

The permanent Check for Updates command shares an in-flight background request and shows one native result dialog without authorizing installation. Its check/dialog state disables duplicate commands; Restart and Install remains a separate explicit save-and-install action. Checks and download bytes do not touch the notes store or renderer network permissions.

The update-command snapshot and notification carry download status: null, a whole percentage, downloaded readiness, failure or installation preparation, plus the ready package version. Main coalesces percentage changes without rebuilding the native menu. `UpdateStatus` subscribes as an isolated renderer leaf, ignores stale initial snapshots after notifications, and releases its listener on unmount. Its bounded state causes no document work, persistence or editor rerenders.

Checks continue querying the provider after download. A new available package revokes previous readiness before downloading. Native staging is associated with its package version; late completion of an older staging attempt cannot install that version in response to a newer request. An unavailable package or staging error ends the native attempt. A retry that already completed its save can then start fresh staging, including for the same version. Reconnection schedules one check after a result dialog closes or an installation rolls back. If the connection returns during a failed provider request, the follow-up uses the new connection.

### 7.4 Trusted IPC Boundary and External Links

The main process treats the preload API as an untrusted boundary: every IPC call must originate from the configured application renderer, and IPC arguments are validated at runtime before filesystem, clipboard, or application operations run. Renderer navigation is restricted to the packaged renderer document (or the configured development renderer URL), while external links open only through the validated shell path.

External hyperlink opening is handled by the Electron shell. The renderer renders editable link anchors and updates their destination from valid edited text, while the main process validates HTTP(S) URLs and delegates approved URLs to the operating system's default hyperlink application.

### 7.5 Attachment Write Validation

Attachment writes are limited to validated IDs, PNG data, a bounded payload size, and a bounded decoded image size.

`shared/png-validation.ts` owns the pure PNG byte, structure and decoded-size checks. Electron's IPC validators re-export these checks; the browser calls them directly before its own decoder. Both platforms use `shared/attachment-limits.ts` for the payload limit. Browser and shared source cannot import desktop implementation modules; lint guards cover static imports, re-exports and dynamic imports.

PNG attachment writes validate the PNG signature, chunk structure and CRCs, require image data, enforce the pixel limits of PRODUCT.md §17 before decoding, and decode the image through the platform image decoder before bytes are stored. The decoded-size bound prevents a small, highly compressible payload from forcing an unbounded synchronous native bitmap allocation. The decoder is injected into the IPC handler so the validation rule remains unit-testable while Electron's `nativeImage` decoding stays in the main process.

### 7.6 Shutdown Handshake and Quit Phase

Before application shutdown is allowed to complete, the main process asks the renderer to flush its queued persistence work. The renderer then acknowledges shutdown through the trusted IPC path.

The shutdown handshake uses a request ID, suppresses duplicate requests, and times out after the time limit that PRODUCT.md §16.1 sets for the quit save. A timeout or renderer-reported persistence failure cancels shutdown and surfaces an error instead of forcing a potentially lossy exit. A renderer whose process has ended is the exception below: its changes are already lost, so shutdown proceeds.

Once the final flush has drained the editor and metadata queues, the store seals document edits for each active quit or update request. Canceling one request releases only its seal. The renderer locks native input before acknowledging quit. Closing and update installation share a reference-counted input lock. `src/renderer/QuitWithoutSavingPrompt.tsx` opens an HTML modal dialog above other renderer surfaces and restores their focus on cancellation. These transitions hold constant state per active request and perform no disk writes.

The store interrupts pending Find jumps at entry and again when it seals edits. Jumps completed while the queues drain contribute their location to the final save; expansion follows the same rule as Escape (PRODUCT.md §20.2.31). The destination handler rejects later jumps while a seal is held.

`quit-handshake.ts` owns a local idle/waiting/quitting union. Only waiting carries the request ID and timeout handle; confirmation or force enters the terminal quitting state before queuing the quit microtask. Timeout restores idle for retry. Renderer loss also restores idle, without the timeout's failure report, because no renderer remains to confirm or display it.

`bootstrap.ts` owns the single main-process quit phase (`running`, `updating`, `quitting`) and the identity of the main window whose renderer process has ended. Window, update and startup wiring read and change them only through its `QuitControl`. `render-process-gone` marks the window's renderer as gone and completes a waiting quit; a later quit for that window skips the handshake, as a window whose document never loaded does (§16). A main-frame navigation abandons a waiting request, because the new document must be asked again; only its commit (`did-navigate`) clears the mark, so a process that ends mid-navigation stays marked. Both transitions take the reporting window, and only the current main window can end a waiting request. An update rollback returns to `running` only while the phase is still `updating`. This state is two scalars; it causes no writes, syncs or interactive work.
