# Bounded-Loss Document Generations

Status: Accepted
Date: 2026-09-14

## Context

ADR 0008 accepted `fsync` as the durability primitive and recorded the residual exposure: the operating system hands flushed bytes to the storage device, but the device may lose or reorder its own write-back cache on power failure. At that time every save rewrote the primary and a single backup inside the same short window, so a power loss could tear all candidates at once and leave no loadable document. The Product Owner approved a stronger behavior: the application must always open the newest loadable document, and an abrupt termination should risk at most a bounded interval of recent work. Spreading recovery candidates over time was chosen to make one power loss much less likely to remove every copy.

## Decision

Persistence keeps time-spread document generations instead of a single backup that is rewritten on every save.

* Each save writes the next primary durably, then preserves the document it replaces as an immutable generation before renaming the new primary into place. Generation content is never rewritten; only its name is assigned once.
* Load considers the primary, the interrupted-save temporary file, and every retained generation, newest first, and promotes the newest candidate the domain parser accepts. A candidate is not rejected because an attachment file is missing.
* Retention keeps the newest generations up to a fixed cap and always retains the newest generation past the safety window defined by `docs/PRODUCT.md` §16. Pruning deletes only generations older than that safety generation and never fails a committed save.
* Attachment cleanup counts every retained generation as a reference.
* Missing attachment files no longer prevent the document from opening; the affected image shows the display error.

## Consequences

* Recovery candidates span time, so a torn or lost newest save normally leaves an older loadable document that was written in an earlier window. This is a mitigation, not a device-level guarantee. The residual fsync exposure from ADR 0008 applies to every generation: the device's write-back cache is never forced to stable media, so a power loss can lose every generation without destroying the device.
* A save no longer copies and syncs a full backup; it performs one additional rename, one directory listing, and at most one deletion per save. Disk usage retains a bounded number of document-sized generations instead of one backup file.
* The previously accepted fsync exposure from ADR 0008 is unchanged at the device level; age-spread generations reduce the chance that a single failure removes every candidate, but nothing forces the device's cache to stable media. A future requirement for device-level durability would need a device-level flush and would supersede ADR 0008 and this ADR.
* The eager attachment-existence check and the `has-attachment` IPC channel are removed because a missing attachment must not block startup.
