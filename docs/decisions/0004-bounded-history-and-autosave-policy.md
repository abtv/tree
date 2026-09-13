# Bounded Snapshot History and Automatic Save Policy

Status: Accepted
Date: 2026-09-13

## Context

The original snapshot-history decision (ADR 0001) retained an independent deep clone of the document for every history entry and ran attachment cleanup on every save cycle. That approach grows memory without bound as edit count rises, and writing the whole document plus scanning the full history for every keystroke costs disk I/O and CPU that scale with document size.

The domain already guarantees input safety: every operation returns a new document, and both text edits and structural commands path-copy the changed path while sharing every unchanged subtree by reference (plan 0039). This invariant makes defensive cloning redundant. The product target scale was about 10,000 nodes when this decision was made; it is now 100,000 (plan 0038).

## Decision

Undo/redo history retains document objects by reference rather than deep-cloning them. The history is bounded to 200 entries; when the limit is exceeded the oldest entry is discarded. An entry is one text-editing session or one structural command. The redo stack is bounded by the same limit.

Automatic saving follows the policy in `PRODUCT.md` §16.1 instead of saving on every keystroke: an image insertion, a hyperlink insertion, ten inserted words since the last successful save, or ten seconds with no document change while changes are pending. Structural commands that insert no content mark changes pending and reset the idle timer without saving by themselves. Quit flushes all pending changes. Failed saves retain pending changes, surface the error, and retry on the next idle interval, volume trigger, or quit.

Attachment cleanup is scheduled only when attachment reachability may have changed: structural deletes, undo, redo, history eviction, and initialization. Cleanup runs after the save that persists the new referenced set and never before it. Attachment files referenced by the live document, any retained history snapshot, or a pending attachment write are retained.

## Consequences

Memory growth is decoupled from keystroke count and bounded by the 200-entry cap and document size. Saves become far less frequent, removing per-keystroke disk writes and history-wide attachment scans. Reference retention depends on the domain immutability invariant, which is guarded by a property test asserting that every document operation leaves its input unchanged. The bounded history changes user-visible undo depth to 200 steps, documented in `PRODUCT.md` §10. Deferring cleanup narrows the attachment deletion triggers; the store must mark cleanup dirty when a future command changes attachment reachability. This ADR supersedes ADR 0001.
