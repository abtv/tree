# Fsync-Based Persistence Durability

Status: Accepted
Date: 2026-09-14

## Context

Attachment writes stored their bytes with `writeFile` and no flush, while document saves already wrote through a durable sequence. A resolved attachment write could therefore leave its bytes, or the directory entry naming them, only in the operating system's page cache while a later durable document save persisted a reference to them.

Node's `fs` API exposes `file.sync()`, which maps to POSIX `fsync()` and flushes modified data and metadata to the storage device. macOS additionally provides `F_FULLFSYNC` through `fcntl`, which asks the device to flush its own volatile cache to stable media; Node exposes neither `fcntl` nor `F_FULLFSYNC`, so using it would require a native addon dependency. The application is a local, single-user macOS desktop app that stores one document plus its attachments and keeps temporary and backup recovery documents beside the primary file.

## Decision

Persistence uses `fsync` as its durability primitive:

* document saves flush the temporary file and the rotated backup before replacement;
* attachment writes flush the attachment file, then flush the attachments directory, before reporting success;
* a failed flush rejects the write, so the renderer can never record a reference to storage that was not flushed.

`F_FULLFSYNC` and a native addon are not adopted. The guarantee is POSIX `fsync` semantics: when a write resolves, the host has flushed the bytes and metadata to the storage device. The device's own cache is not forced to stable media, so the residual exposure is a power loss in the interval after a successful flush and before the device writes its cache through. This exposure is accepted for a local single-user editor.

## Consequences

* A completed attachment write cannot be lost to abrupt process termination, and subsequent document saves reference storage that was already flushed. The directory flush prevents a durable document reference from outliving the attachment's name.
* The accepted residual power-loss exposure is smaller than the previous behavior and equal to the document path's existing guarantee. If a document save is lost, the previous document plus recovery files remain loadable; startup cleanup removes attachments that are no longer referenced.
* Durability stays dependency-free and uses the same primitive on the document and attachment paths.
* Unit tests in `file-services.test.ts` assert the flush sequence and both flush-failure paths; `e2e/persistence-reliability.spec.ts` verifies that a completed paste survives a `SIGKILL` and restart.
* A future requirement for device-level power-loss guarantees must add the native flush dependency, reconsider the document path as well, and supersede this ADR.
