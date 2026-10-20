# ADR 0023: Browser Folder Backup

Status: Accepted
Date: 2026-10-20

## Context

The owner approved an independent folder copy of browser notes in Chromium,
alongside manual ZIP archives. Browser storage remains the source of truth.
The implementation must preserve responsiveness, write images before their
document references, avoid deleting backup files, and request folder permission
only through explicit user interaction. PRODUCT §24.5 owns the behavior and timing.

## Decision

Keep the folder handle under a new key in the existing IndexedDB preferences
store, without a database version or origin change. Query permission on startup
on the main thread. Resume requests permission directly from a button click.
Use a long-lived, same-origin module worker for all document and image work.
The page sends only a small notification after a successful head transaction.

An application-layer sequencer owns coalescing and retries behind injected clock,
source and destination ports. It runs once at startup, permits only one run in
flight and retains saved notifications received during I/O. The deadline does
not move with repeated saves, so continuous typing cannot starve the backup.
The destination has no deletion operation. Scan existing image names once,
write each missing image with a writable stream and close it, then write and
close compact `document.json`. A failed image write prevents document replacement.
Empty image files left by failed streams are retried on startup. Reject image
names that collide by letter case before writing on case-insensitive filesystems.
Abort failed streams and propagate errors to the page. Stopping or page shutdown
terminates the worker; startup copies the current IndexedDB head again.

The existing-folder Restore choice shares the archive import's document/image
validation, journal, confirmation and one-transaction head replacement. Its folder
adapter reads only referenced files and applies size checks before allocation;
ZIP structural validation stays specific to ZIP input. No document crosses the
worker boundary. Restoring a folder does not enable backup.

## Consequences

The page does constant work per successful save and status message. The worker
holds one document, one image and the image-name set. It writes compact documents
at a bounded cadence and does not rewrite known images. Removed images remain
in the folder and can accumulate; immutable image identity and no external edits
are assumptions. Physical-disk performance, browser permission persistence and
power-loss behavior remain distinct from OPFS integration evidence. Browser
writable streams do not provide the desktop generation-retention or fsync policy.

Use one folder for one profile on one computer. Sharing a folder between writers
can overwrite notes; choosing a synchronized folder permits that service to copy
the unencrypted data. The packaged worker performs no network access or code
evaluation. The page meta CSP restricts worker creation but does not govern
execution inside a worker script.

## Alternatives

Performing serialization and writes on the page would add document-sized work
to interactive paths. Writing after every save would multiply disk writes.
A resettable trailing debounce could indefinitely postpone backup while typing.
A service worker or cloud service is outside the approved scope.
