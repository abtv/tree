Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Reduce redundant save serialization

## Goal

Remove the two full-document passes that plan 0033 deferred from the save path, without weakening the untrusted IPC boundary:

1. `serializeState` deep-clones the document even though the domain guarantees document immutability.
2. The main-process `save` handler re-parses and rebuilds the whole document (`parsePersistedState`) before the file service stringifies it.

After this change a save performs one validate-only walk in the renderer and one validate-only walk at the IPC boundary; neither allocates a replacement document tree. The persisted bytes for canonical version-2 renderer state are unchanged.

## Current behavior

- `serializeState` calls `assertDocument` (which builds and discards a parse tree via `parseNodes`), `isValidLocation`, and then `cloneDocument` (`src/domain/document.ts:393-399`).
- `PersistenceCoordinator` calls `serializeState` and passes the result over the preload `save` channel (`src/application/persistence-coordinator.ts:71`).
- The main `save` handler validates with `validatePersistedEditorState` → `parsePersistedState`, which rebuilds a fresh document and location before `fileServices.save` stringifies it (`src/main/ipc-handlers.ts:56-59`, `src/main/ipc-security.ts:24-26`, `src/domain/document.ts:401-425`).
- Documents are immutable by the invariant guarded in `src/domain/document.property.test.ts` ("does not mutate its input document for any operation") and recorded in ADR 0004. `EditorHistory` already relies on that invariant to retain snapshots by reference.

## Proposed changes

### 1. Let the node walk validate without building

Refactor the internal `parseNodes` into `walkNodes(value, nodeIds, build)`. Building keeps today's behavior for `parsePersistedState`. The validate-only mode traverses the same input, applies the same checks in the same order (`children` array, depth, node shape, unique IDs, attachment shape, link shape), and throws the same messages, but does not allocate node or children arrays. `assertDocument` switches to the validate-only mode.

### 2. Add a non-rebuilding persisted-state validator

Add `validatePersistedState(value: unknown): PersistedEditorState` to the domain. It performs the same envelope checks as `parsePersistedState`, runs the validate-only node walk, then `isValidLocation`, and returns the input value typed as `PersistedEditorState`. It accepts version 1 or 2 and does not migrate or strip fields; the renderer always emits canonical version 2, so the persisted output is unchanged in practice. `parsePersistedState` remains the load/parse path and keeps migration and normalization.

### 3. Remove the `serializeState` clone

`serializeState` keeps `assertDocument` and `isValidLocation`, and returns `document` by reference with a shallow copy of `location`. Since documents are immutable, nothing can mutate the object between serialization and the synchronous IPC structured clone.

### 4. Use the validator at the IPC boundary

`src/main/ipc-security.ts`'s `validatePersistedEditorState` delegates to the domain `validatePersistedState`. The boundary still rejects malformed and over-depth input before any filesystem operation, satisfying the architecture rule that IPC arguments are validated at runtime.

## Affected modules

- `src/domain/document.ts`
- `src/domain/document.test.ts`, `src/domain/document.property.test.ts`
- `src/main/ipc-security.ts`, `src/main/ipc-security.test.ts`
- `src/main/ipc-handlers.test.ts`
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/decisions/0005-non-rebuilding-save-validation.md`

## Data model and persistence changes

- No document schema or persisted-field change.
- The persisted JSON for canonical version-2 renderer state is byte-for-byte identical to today.
- The save boundary no longer migrates version 1 to version 2 or strips unknown fields. This path cannot be reached from the application renderer, which only calls `serializeState` (always version 2); version-1 migration remains on load.

## Performance assessment

Required by `PRODUCT.md` §22.1.

- Disk: unchanged. The same document is written with the same JSON.stringify and the same durable write sequence.
- CPU on the save path: previously the renderer built and discarded a parse tree (`assertDocument`), deep-cloned the document (`serializeState`), and the main process built a second tree (`parsePersistedState`) before `JSON.stringify`. Now both walks are validate-only and allocate no replacement tree. Link and attachment validation still allocate the small arrays/objects for nodes that have them.
- Memory: removes one full document clone and one full rebuild per save from the transient allocation churn. No retained structure is added.
- Scaling: save work remains O(document size) for the two validation walks plus `JSON.stringify`, down from five O(document size) traversals/allocations (assert build, clone, IPC, main rebuild, stringify). Saves are already infrequent under the save policy.

## Automated performance guards

- Unit guard (`src/domain/document.test.ts`): `serializeState(document, location).document` is the same reference as the input document, proving no defensive clone.
- Unit guard (`src/domain/document.test.ts`, `src/main/ipc-security.test.ts`, `src/main/ipc-handlers.test.ts`): `validatePersistedState` and `validatePersistedEditorState` return the same object reference they were given, and the `save` handler forwards that same reference to `fileServices.save`, proving the boundary does not rebuild.
- Property guard (`src/domain/document.property.test.ts`): for arbitrary valid documents and locations, `validatePersistedState(serializeState(...))` accepts, returns the same reference, and `parsePersistedState(JSON.parse(JSON.stringify(state)))` still round-trips.
- Existing `perf/state.spec.ts` continues to exercise the real save path across the Electron boundary.
- `npm run check:full` before commit.

## Testing

- Unit: `walkNodes` validate-only mode rejects the same malformed inputs as the parser (depth, duplicate IDs, bad links/attachment, invalid location) with the same messages.
- Unit: `serializeState` no longer clones but still validates the document and location.
- Unit: `validatePersistedState` accepts valid version-1 and version-2 state and returns the same reference; rejects unsupported format, empty roots, and mismatched locations.
- Boundary/contract: the `save` handler passes the validated state through to `fileServices.save` unchanged and still propagates validation and persistence failures.
- Property: serialization round-trip and reference identity hold for arbitrary generated documents.
- E2E: existing `e2e/persistence.spec.ts` restart scenarios continue to cover the real save/load boundary; no new scenario is required because the payload shape and persisted bytes are unchanged.
- `npm run check:full`.

## Documentation

- `docs/ARCHITECTURE.md` §13: the save boundary validates persisted state without rebuilding it, and serialization does not clone the immutable document; parsing/migration stay on the load path.
- `docs/decisions/0005-non-rebuilding-save-validation.md`: record that save-boundary validation is deliberately validate-only and relies on the domain immutability invariant.
- `docs/DEVELOPMENT.md` §12: describe the reference-identity unit guards.

## Risks

- The save boundary no longer normalizes input. The renderer always emits canonical version-2 state, so no user-visible file changes; a future non-application IPC caller could persist a version-1 document, which load still migrates. The boundary tests and the ADR record this.
- Validate-only walking duplicates parser behavior if the two modes are edited independently. The refactor keeps a single `walkNodes` implementation, and the property test compares both paths for valid input.
- Removing the clone depends on the immutability invariant. The existing immutability property test remains the guard.

## Out of scope

- Moving serialization entirely to the main process or changing the IPC save payload shape.
- Compact JSON or any change to the persisted file format.
- Caching attachment bytes in the renderer and indexing document nodes for O(depth) lookups.
