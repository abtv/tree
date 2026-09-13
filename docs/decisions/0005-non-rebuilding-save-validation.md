# Non-Rebuilding Save Validation

Status: Accepted
Date: 2026-09-13

## Context

The save path performed several full-document passes. The renderer built and discarded a validation tree, deep-cloned the document for `serializeState`, and the main process rebuilt a fresh document with `parsePersistedState` at the untrusted IPC boundary before `JSON.stringify` wrote it. Plan 0033 deferred removing the `serializeState` clone and the main-process re-parse.

ADR 0004 established that documents are immutable: every domain operation returns a new document and never mutates its input, guarded by a property test. That invariant already lets `EditorHistory` retain snapshots by reference.

The architecture requires IPC arguments to be validated at runtime before filesystem operations run, so the save boundary cannot simply trust the renderer.

## Decision

`serializeState` validates the document and location and returns the in-memory document by reference without cloning. The renderer sends that value over the `save` channel.

The main process validates the untrusted payload with a validate-only walk that applies the same checks as the parser, in the same order, without allocating a replacement document tree. It returns the received value to the file service, which stringifies it. Parsing, schema migration, and link normalization remain on the load path, which reads files that may be older or non-canonical.

For canonical version-2 state produced by the renderer, the persisted bytes are unchanged.

## Consequences

Save work drops from five full-document traversals or allocations to two validate-only walks plus `JSON.stringify`, and transient allocation churn is reduced. The save boundary no longer migrates version 1 or strips unknown fields; this cannot be reached from the application renderer, which always emits version 2, and version-1 migration is preserved on load. Correctness depends on the domain immutability invariant, which the existing property test guards. The parser and validator share one node-walk implementation so their checks cannot diverge.
