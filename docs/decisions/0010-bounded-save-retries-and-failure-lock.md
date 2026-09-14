# Bounded Save Retries and Read-Only Failure Lock

Status: Accepted
Date: 2026-09-14

## Context

The automatic save policy retried a failed save at the idle interval indefinitely. A permanent failure, such as a full disk or a revoked permission, rewrote the full document at every retry for as long as the application stayed open. A failed attachment cleanup had the same effect: it marked document changes pending and triggered a full-document save just to retry an unlink. `docs/PRODUCT.md` §22.1 requires minimizing disk writes and filesystem syncs to limit SSD wear, so unbounded retry writes are not acceptable.

The Product Owner approved a simpler failure model: a save that fails three times in a row is already an unrecoverable problem for the session. The application should stop changing data, keep the failure visible, and ask the user to fix the cause and restart. The Product Owner also required an explicit guarantee that a failed save never destroys the previously saved document, including when the storage is full.

## Decision

Save failures are bounded, and an unrecoverable save failure switches the editor into a read-only state.

* The store counts consecutive failed document saves. Three consecutive failed attempts lock the application into the read-only save-failure state defined in `docs/PRODUCT.md` §16.2, and no further automatic save attempts are made. Retries normally happen at the idle interval, but a new change that crosses the volume threshold attempts a save immediately and that failure counts too, so a persistently failing save can lock after only a few more keystrokes.
* While locked, every document-mutating command is rejected in the application layer, including undo, redo, cut, paste, and image paste. Navigation, selection, and copy remain available for viewing the document.
* The failure and restart guidance stay visible. A successful save resets the failure count and releases the lock.
* Quit and window close still attempt a final save through the existing flush handshake. If that save fails while locked, the renderer asks for explicit confirmation and a dedicated trusted IPC operation quits without flushing. This is the only path that discards changes without saving.
* Attachment cleanup failures are reported separately from document-save failures. They are retried as cleanup-only operations at the idle interval for at most three consecutive failures, then left pending so the coordinator retries them on the next save or quit. They never lock the editor and never mark document changes pending.
* A failed save never destroys the previously saved document. Promotion of a recovered candidate to the primary file during load is best-effort, so a filesystem error while promoting, such as a full disk, cannot prevent the application from opening a valid candidate.

## Consequences

* A permanent failure costs at most three document writes instead of a full-document write on every retry, and a cleanup failure costs no document writes at all. The success path is unchanged.
* The coordinator must report whether a failed cycle was a document save or a cleanup, and the store must track two bounded failure counters and a lock flag. Both are scalar state; memory and CPU costs are constant.
* The locked state trades recovery flexibility for simplicity: there is no in-app retry after three failures, so a cause fixed while the application sits idle is only retried on quit or a restart. This was an explicit Product Owner decision to keep the failure UI simple.
* Unsaved changes can be discarded only while locked and only through an explicit confirmation. Without it, the existing guarantee that quit does not silently lose changes is preserved.
* The editor becomes viewable but not editable until the application restarts. This is the accepted user-visible cost of stopping an unrecoverable write failure.
