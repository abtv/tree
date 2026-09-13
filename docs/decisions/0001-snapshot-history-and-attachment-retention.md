# Snapshot History and Attachment Retention

Status: Superseded by ADR 0004
Date: 2026-09-11

## Context

The product requires undo and redo for whole-document operations, including subtree deletion and image attachment changes. Attachment files must not be deleted while an undo or redo operation can still restore a reference to them.

## Decision

The renderer application layer keeps in-memory snapshots of the document before each history transaction. Consecutive direct text edits on one node are grouped according to the product's editing-session boundaries.

Attachment cleanup retains files referenced by the current document and by every snapshot reachable through undo or redo. Files become eligible for removal only after they are absent from all of those states. At application startup, runtime history is empty, so cleanup is based on the successfully loaded document.

## Consequences

This favors correctness and understandable behavior over minimizing in-memory history size. The history is runtime-only, so it does not complicate the persisted JSON format. A future history-size limit would need to discard snapshots before their attachment references may be cleaned up.
