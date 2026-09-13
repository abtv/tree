Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# State memory and persistence I/O

## Goal

Remove the two ways editor state grows unbounded with edit count, and replace per-keystroke autosave with the approved save policy:

- undo/redo history growing without limit (memory);
- a full-document save plus a full-history attachment scan on every keystroke (disk I/O and CPU).

The save policy is approved product behavior and is recorded in `docs/PRODUCT.md` §16.1. Undo/redo history is bounded to 200 entries.

Target scale: the application should stay responsive with documents up to about 10,000 nodes.

Measured with the real domain code, for 10 roots × 10 children × 10 grandchildren = 1,110 nodes × 50 characters:

- one document is ~130 KB heap;
- one history snapshot is ~118 KB heap (`cloneDocument`), so 1,000 snapshots ≈ 118 MB and 10,000 ≈ 1.2 GB;
- one save writes ~380 KB (pretty JSON to `document.json.tmp` plus a `.bak` copy) and issues 2 `fsync`s;
- `referencedAttachmentIds()` walks every snapshot on every save (1.1M node visits ≈ 5.4 ms per save at 1,000 snapshots), plus a `readdir` of the attachments directory.

Scaling of the domain operations (single-threaded, Node 24, wide document):

| Nodes | `cloneDocument` (structural) | `editNodeContent` (text) | One keystroke (2 lookups + copy) | One render (3 lookups) | Retained snapshot |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 0.04 ms | 0.02 ms | — | — | 0.08 MB |
| 10,000 | 0.26 ms | 0.30 ms | 0.7 ms | 0.35 ms | 0.7 MB |

Lookups are O(n) (`locateNode` traverses the whole tree), not O(depth), but at the approved 10,000-node ceiling one keystroke's lookup and copy work is under 1 ms, which is comfortably within the interactive budget. No domain lookup optimization is required at this scale.

## Current behavior

- `EditorHistory` keeps unbounded `past`/`future` arrays and deep-clones the whole document on every `begin`/`undo`/`redo` (`src/application/editor-history.ts:7-25`).
- `EditorStore` calls `history.begin` at each text-editing session start (`src/application/editor-store.ts:180`) and each structural command (`src/application/editor-store.ts:467`).
- A history entry is one text-editing session or one structural command, not a keystroke or a word. A text-editing session is a run of edits to the same node, ended by 5 seconds without a text change, a focus or caret change, cut/paste, or a structural command (`src/application/editor-store.ts:168-190`, `:247-258`, `:471-476`).
- Every edit calls `requestSave()` (`src/application/editor-store.ts:481-483`). `PersistenceCoordinator` coalesces only requests that arrive while a save is already in flight; there is no debounce (`src/application/persistence-coordinator.ts:44-81`).
- Each save cycle always runs `cleanupAttachments`, and `referencedAttachmentIds()` iterates the entire history (`src/application/persistence-coordinator.ts:68`, `src/application/editor-store.ts:490-501`).
- `serializeState` deep-clones and re-validates the document on every save (`src/domain/document.ts:393-399`), and the file service pretty-prints and writes two durable copies (`src/infrastructure/main/file-services.ts:161-171`).

The domain never mutates its input: every operation returns a new `Document`, and the application layer never mutates a document in place. That is an input-safety guarantee, not structural sharing everywhere. Text edits (`editNodeContent`) are path-copying and share unchanged subtrees; structural commands (`insertSiblingAfter/Before`, `createFirstChild`, `splitNode`, `deleteNode`, `moveSibling`, `pasteText`, `pasteMultilineText`, `attachImage`, `deleteLink`, `removeTextRange`) deep-clone the whole document with `cloneDocument` before mutating the clone. `EditorHistory` and `serializeState` also deep-clone. At 1,110 nodes a deep clone is ~0.045 ms, so this is memory churn rather than a latency problem at this scale.

## Proposed changes

### 1. Retain history snapshots by reference instead of deep-cloning

- `EditorHistory.begin/undo/redo` push the current `Document` object directly; remove the `cloneDocument` calls.
- This is safe because no operation mutates an existing document. States produced by text edits share unchanged subtrees with the live document; states produced by structural commands do not, because the command already deep-copied. Either way, retaining the existing object avoids the extra defensive clone in `begin`.
- Add a domain property test asserting that every document operation leaves its input document deeply unchanged (guards the invariant this change depends on).
- Update `src/application/editor-history.test.ts`: the existing "stores independent snapshots" test mutates a snapshot after `begin` and asserts defensive-copy semantics. Replace it with a test that undo returns the retained document and that domain operations do not mutate retained snapshots.

### 2. Bound the undo/redo history to a fixed number of steps

Structural operations still produce a full new document (clone-then-mutate), so history can grow without limit. Cap the number of retained entries.

- Cap: **200 entries**. When exceeded, evict the oldest past entries. The future stack is bounded by the same cap.
- Worst case at the 10,000-node ceiling is ~140 MB (200 full structural snapshots at ~0.7 MB each). Text-session entries share unchanged subtrees, so typical memory is much lower.
- This changes user-visible undo depth and must be reflected in `docs/PRODUCT.md`.

### 3. Implement the automatic save policy (`docs/PRODUCT.md` §16.1)

- Add save-policy state to `EditorStore`: pending changes, inserted-word count since the last save, and an idle timer (reusing the injected `Clock`).
- Reset the idle timer on every document change.
- Count inserted words on text insertion (typing and paste), ignoring deletions. A word begins at the start of the text or after whitespace, so typing or pasting a partial word does not over-count.
- Save immediately when: an image is inserted; a hyperlink is inserted; or the inserted-word count since the last successful save reaches 10.
- Save after 10 seconds with no document change while changes are pending.
- Structural commands that insert no content (`Enter`, split, delete, reorder, undo/redo) mark changes pending and reset the idle timer but do not save by themselves.
- `flushPersistence()` must force a save when changes are pending before awaiting the queue, so quit and the error/shutdown handshake always persist pending changes.
- Counters are captured and reset when a save is requested. A failed save keeps changes pending and surfaces the error; retries happen on the next idle interval, volume trigger, or flush, and a later successful save clears the error.
- No hard maximum interval. In-flight saves still serialize as today. No persisted-data format changes.
- Image insertion and hyperlink insertion are detected at their source: image paste is already an explicit store path; link insertion is derived from the paste transition (a new link range in the pasted text).

### 4. Run attachment cleanup only when references may have changed, after the save

- `PersistenceCoordinator` stops running `cleanupAttachments` unconditionally after every save. It tracks a cleanup-dirty flag set by `requestAttachmentCleanup()`.
- Cleanup runs after the save that persists the new references, never before it, so a crash cannot leave `document.json` referencing a file already deleted.
- Startup cleanup with no pending document changes may run without a save.
- The store marks cleanup dirty only where references can change: structural deletes, `undo`, `redo`, and initialization. Text edits, splits, reorder, and multiline paste do not change the referenced set.
- Keep `pendingAttachmentIds` in the referenced set. This removes the per-keystroke O(history × nodes) scan and per-keystroke directory read.
- Update `PersistenceCoordinator` tests, which currently assume cleanup runs on every save cycle.

### 5. Automated performance guard (required by `docs/PRODUCT.md` §22.1)

- Add a performance scenario that performs a fixed structural-edit burst on a 10,000-node seeded document and asserts a wall-clock ceiling, printing a JSON baseline for the save-policy path and the reference-changing cleanup scan.
- Keep the existing `large-10000` typing-latency perf scenario, which already guards the interactive CPU path at the target ceiling.
- Guard history memory structurally at the unit level: assert snapshots are retained by reference (shared node identity) and that the 200-entry cap bounds retained entries. Renderer heap size is not directly observable from Playwright.

### 6. Optional follow-ups (not required for the primary fix)

- Remove the defensive `cloneDocument` inside `serializeState` (documents are immutable and `JSON.stringify` is synchronous).
- Longer term, convert the structural domain commands from clone-then-mutate to path-copying so structural states also share unchanged subtrees, reducing both memory and per-command allocation. This is a larger domain refactor and is not part of this plan.

## Affected modules

- `src/application/editor-history.ts`, `src/application/editor-history.test.ts`, `src/application/editor-history.property.test.ts`
- `src/application/editor-store.ts`, `src/application/editor-store.test.ts`, `src/application/editor-store.property.test.ts`
- `src/application/persistence-coordinator.ts`, `src/application/persistence-coordinator.test.ts`
- `src/application/save-policy.ts`, `src/application/save-policy.test.ts`, `src/application/save-policy.property.test.ts`
- `src/domain/document.property.test.ts` (input-immutability invariant)
- `src/domain/document.ts` (only if the optional `serializeState` change is approved)
- `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/DEVELOPMENT.md`, `docs/decisions/` (ADR)
- `e2e/persistence.spec.ts`, `e2e/persistence-reliability.spec.ts`, `e2e/shutdown-failures.spec.ts`
- `perf/state.spec.ts`

## Data model and persistence changes

- No document schema change.
- No persisted-field change.
- The persisted `document.json` stays 2-space pretty-printed (compact JSON was considered and rejected to keep the file readable).

## Performance assessment

Required by `docs/PRODUCT.md` §22.1.

- Disk: the primary win. Autosave currently writes and `fsync`s a full document per keystroke; the save policy reduces a burst of typing to one durable write per ten words (or per idle window), and cleanup no longer reads the attachments directory on every save. No new disk work is introduced.
- CPU: removes the per-keystroke O(history × document) attachment scan and the per-save defensive deep clone. Saving is deferred off the interactive path to word/idle triggers. Cost still scales with document size per save, but saves become far less frequent.
- Memory: reference retention removes the redundant full clone per history entry and lets consecutive text-edit states share unchanged subtrees. The 200-entry cap bounds worst-case growth from structural commands, which still allocate a full document each (~140 MB at the 10k ceiling, less in practice). The save policy adds only a word counter and a timer. No new unbounded structure is introduced.
- Scaling: the changes decouple growth from keystroke count; remaining growth is bounded by the history cap and by document size per save.

## Testing

- Unit: reference-retained history; 200-entry cap eviction preserves undo/redo and attachment reachability; save policy triggers (image, link, ten words, ten-second idle), no save per keystroke, forced flush of pending changes, and error retention and retry; cleanup triggered only by reference-changing operations and always after the save.
- Property: domain operations do not mutate their input; undo/redo consistency across cap eviction.
- Boundary/contract: existing file-service and IPC tests remain; add coverage that a forced flush of pending changes reaches `save` before quit acknowledgment, and that cleanup does not run before the save that removes the reference.
- E2E: rapid edits still persist (existing `persistence.spec.ts` scenario); quit with pending changes persists them; closing the main window flushes pending changes and quits; a delete that removes an attachment restarts with the file gone and the document consistent; startup cleanup of stale attachments still holds.
- Perf: required bounded-work scenario for a structural edit burst.

## Documentation

- `docs/ARCHITECTURE.md` §11 and §13: immutable snapshot retention, bounded history (200 entries), the autosave policy, cleanup-on-reference-change ordering, and window close as a quit request.
- `docs/PRODUCT.md` §16.1 and §10: the autosave policy (already added) and bounded undo depth (200 steps); §9.2: closing the main window quits and flushes.
- `docs/decisions/`: add an ADR (next free number) covering snapshot retention, bounded history, the autosave policy, and attachment retention; update or supersede `0001-snapshot-history-and-attachment-retention.md`.
- `docs/DEVELOPMENT.md` §12: document the new perf guard.

## Risks

- Reference retention depends on the domain immutability invariant; a future in-place mutation would silently corrupt history. The property test and ADR are the guard.
- Bounded history changes user-visible undo depth; `docs/PRODUCT.md` §10 must state the 200-step limit so the behavior is documented, not implicit.
- The save policy risks leaving pending changes unsaved on a hard crash; the ten-word threshold bounds loss during active typing and the ten-second idle timer bounds it during pauses, and quit always flushes.
- Narrowing cleanup triggers risks orphaned attachment files if a future operation changes references without notifying the store; tests must cover delete, undo/redo, and load, and cleanup must remain ordered after the save.
- Word counting and link-insertion detection are new logic; unit tests and a property test must cover partial words, pastes, deletions, and multi-node edits.

## Resolved decisions

- Target scale: up to about 10,000 nodes.
- Autosave policy: image insert, hyperlink insert, ten inserted words, or ten seconds idle; flush on quit (`docs/PRODUCT.md` §16.1).
- History bound: 200 entries; an entry is one text-editing session or one structural command.
- Persisted `document.json` stays 2-space pretty-printed.
- The `serializeState` defensive clone is retained (deferred as an optional follow-up).
- Closing the main window quits the application and flushes pending changes, using the same save-before-quit handshake as `Cmd+Q` (`docs/PRODUCT.md` §9.2).

## Out of scope

- Changing the domain model, persisted schema, or IPC payload shape.
- Persisting undo/redo history across restart.
- Incremental attachment reference counting (a possible later optimization if reference-changing commands prove too expensive).
- A domain id index and path-copying for O(depth) lookups and structural commands. Not required at the approved 10,000-node ceiling (under 1 ms per keystroke). Revisit only if the target scale changes, as a separate plan with property tests comparing the optimized operations against the current clone-then-mutate behavior and asserting inputs stay unchanged.
